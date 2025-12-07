/**
 * ADG-Parallels Worker Executor
 * 
 * Orchestrates the full task execution flow:
 * 1. Load adapter for task type
 * 2. Render prompt with task data
 * 3. Send to LM and get response
 * 4. Check completion criteria
 * 5. Save output and update task status
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Task, TaskAdapter, WorkerConfig, TaskStats } from '../types';
import { TaskManager } from './task-manager';
import { LMClient, createLMClientForRole, LMResponse } from './lm-client';
import { getAdapterForTask, loadAdapter } from './adapter-loader';
import {
  buildRenderContext,
  renderTaskStartPrompt,
  renderTaskContinuePrompt,
  renderOutputPath,
  checkCompletionCriteria,
  parseCompletionSignal,
  buildCompletePrompt,
  RenderContext,
} from './prompt-renderer';
import { writeFile, ensureDir, pathExists } from '../utils/file-operations';
import { logger } from '../utils/logger';
import { CORPORATE_STATUTE } from '../constants/corporate-statute';

// =============================================================================
// TYPES
// =============================================================================

export interface ExecutorConfig {
  /** Worker ID */
  workerId: string;
  /** Worker role */
  role: string;
  /** Depth in hierarchy */
  depth: number;
  /** Path to adapters directory */
  adaptersDir: string;
  /** Path to output directory */
  outputDir: string;
  /** Project codename */
  projectCodename: string;
  /** Include corporate statute in prompts */
  includeStatute: boolean;
  /** Maximum retries per task */
  maxRetries: number;
}

export interface ExecutionResult {
  success: boolean;
  task: Task;
  output?: string;
  outputPath?: string;
  error?: string;
  durationMs: number;
  modelUsed?: string;
  retryCount: number;
}

export interface ExecutorCallbacks {
  onTaskStart?: (task: Task) => void;
  onProgress?: (task: Task, message: string) => void;
  onChunk?: (task: Task, chunk: string) => void;
  onTaskComplete?: (result: ExecutionResult) => void;
  onTaskError?: (task: Task, error: string) => void;
  onAllTasksComplete?: () => void;
}

// =============================================================================
// WORKER EXECUTOR CLASS
// =============================================================================

export class WorkerExecutor {
  private config: ExecutorConfig;
  private taskManager: TaskManager;
  private lmClient: LMClient;
  private callbacks: ExecutorCallbacks;
  private isRunning: boolean = false;
  private currentTask: Task | null = null;
  private cancellationSource: vscode.CancellationTokenSource | null = null;

  constructor(
    config: ExecutorConfig,
    taskManager: TaskManager,
    callbacks: ExecutorCallbacks = {}
  ) {
    this.config = config;
    this.taskManager = taskManager;
    this.callbacks = callbacks;
    this.lmClient = createLMClientForRole(config.role);
  }

  /**
   * Initialize the executor
   */
  async initialize(): Promise<boolean> {
    logger.info('Initializing worker executor', { workerId: this.config.workerId });

    const initialized = await this.lmClient.initialize();
    if (!initialized) {
      logger.error('Failed to initialize LM client');
      return false;
    }

    const modelInfo = this.lmClient.getModelInfo();
    logger.info('LM client initialized', modelInfo);

    return true;
  }

  /**
   * Execute the next available task
   */
  async executeNextTask(): Promise<ExecutionResult | null> {
    // Claim next task
    const task = await this.taskManager.claimNextTask(this.config.workerId);
    
    if (!task) {
      logger.info('No pending tasks available');
      return null;
    }

    return this.executeTask(task);
  }

  /**
   * Execute a specific task
   */
  async executeTask(task: Task): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.currentTask = task;
    this.cancellationSource = new vscode.CancellationTokenSource();

    logger.info(`Executing task #${task.id}: ${task.title}`, { type: task.type });
    this.callbacks.onTaskStart?.(task);

    try {
      // Load adapter
      this.callbacks.onProgress?.(task, 'Loading adapter...');
      const adapter = getAdapterForTask(this.config.adaptersDir, task.type);
      
      // Build render context
      const stats = await this.taskManager.getStats();
      const context = this.buildContext(task, stats);

      // Render prompt
      this.callbacks.onProgress?.(task, 'Rendering prompt...');
      const prompt = renderTaskStartPrompt(adapter, context);
      
      // Build complete prompt with statute if configured
      const fullPrompt = this.config.includeStatute
        ? buildCompletePrompt(prompt, true, context)
        : prompt;

      // Check if prompt fits in context window
      const { fits, tokens, maxTokens } = await this.lmClient.checkFits(fullPrompt);
      if (!fits) {
        logger.warn('Prompt may be too long', { tokens, maxTokens });
      }

      // Send to LM
      this.callbacks.onProgress?.(task, 'Sending to language model...');
      
      let accumulatedOutput = '';
      const response = await this.lmClient.sendPrompt(fullPrompt, {
        token: this.cancellationSource.token,
        onChunk: (chunk) => {
          accumulatedOutput += chunk;
          this.callbacks.onChunk?.(task, chunk);
        },
        onProgress: (msg) => this.callbacks.onProgress?.(task, msg),
      });

      // Check completion criteria
      this.callbacks.onProgress?.(task, 'Checking completion criteria...');
      const criteriaResult = checkCompletionCriteria(response.text, adapter);
      const completionSignal = parseCompletionSignal(response.text);

      if (!criteriaResult.passed) {
        logger.warn('Completion criteria not met', { reason: criteriaResult.reason });
      }

      // Save output
      this.callbacks.onProgress?.(task, 'Saving output...');
      const outputPath = await this.saveOutput(task, adapter, context, response.text);

      // Handle meta-tasks (task-splitter) - parse and add subtasks
      if (adapter.isMeta && adapter.createsSubtasks) {
        this.callbacks.onProgress?.(task, 'Parsing subtasks from output...');
        const subtasksAdded = await this.handleMetaTaskOutput(task, response.text);
        if (subtasksAdded > 0) {
          logger.info(`Meta-task #${task.id} created ${subtasksAdded} subtasks`);
        }
      }

      // Update task status
      const newStatus = criteriaResult.passed && completionSignal.isComplete
        ? 'task_completed'
        : 'processing'; // Keep as processing if not complete

      if (newStatus === 'task_completed') {
        await this.taskManager.completeTask(task.id, this.config.workerId, outputPath);
      }

      const result: ExecutionResult = {
        success: true,
        task,
        output: response.text,
        outputPath,
        durationMs: Date.now() - startTime,
        modelUsed: response.model,
        retryCount: task.retryCount,
      };

      this.callbacks.onTaskComplete?.(result);
      logger.info(`Task #${task.id} completed`, { 
        durationMs: result.durationMs,
        outputLength: response.text.length,
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Task #${task.id} failed`, { error: errorMessage });

      // Update task as failed
      await this.taskManager.failTask(task.id, this.config.workerId, errorMessage);

      this.callbacks.onTaskError?.(task, errorMessage);

      return {
        success: false,
        task,
        error: errorMessage,
        durationMs: Date.now() - startTime,
        retryCount: task.retryCount,
      };
    } finally {
      this.currentTask = null;
      this.cancellationSource?.dispose();
      this.cancellationSource = null;
    }
  }

  /**
   * Run continuous execution loop
   */
  async runLoop(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Executor loop already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting executor loop');

    while (this.isRunning) {
      const result = await this.executeNextTask();

      if (!result) {
        // No more tasks
        logger.info('No more tasks, stopping loop');
        this.isRunning = false;
        this.callbacks.onAllTasksComplete?.();
        break;
      }

      // Small delay between tasks
      await this.delay(1000);
    }
  }

  /**
   * Stop the execution loop
   */
  stop(): void {
    this.isRunning = false;
    this.cancellationSource?.cancel();
    logger.info('Executor stopped');
  }

  /**
   * Get current task
   */
  getCurrentTask(): Task | null {
    return this.currentTask;
  }

  /**
   * Check if executor is running
   */
  isExecuting(): boolean {
    return this.isRunning;
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Build render context for a task
   */
  private buildContext(task: Task, stats: TaskStats | null): RenderContext {
    return buildRenderContext(
      task,
      this.config.workerId,
      this.config.role,
      this.config.depth,
      this.config.outputDir,
      this.config.projectCodename,
      stats ? {
        total: stats.total,
        completed: stats.completed,
        pending: stats.pending,
      } : undefined
    );
  }

  /**
   * Save task output to file
   */
  private async saveOutput(
    task: Task,
    adapter: TaskAdapter,
    context: RenderContext,
    output: string
  ): Promise<string> {
    // Render output path
    const relativePath = renderOutputPath(adapter, context);
    const fullPath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(this.config.outputDir, relativePath);

    // Ensure directory exists
    ensureDir(path.dirname(fullPath));

    // Write output
    writeFile(fullPath, output);
    logger.info(`Output saved to ${fullPath}`);

    return fullPath;
  }

  /**
   * Handle meta-task output (e.g., task-splitter)
   * Parses JSON subtasks from output and adds them to the queue
   */
  private async handleMetaTaskOutput(parentTask: Task, output: string): Promise<number> {
    try {
      // Extract JSON array from output (may be wrapped in markdown code blocks)
      const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/) || 
                        output.match(/(\[[\s\S]*\])/);
      
      if (!jsonMatch) {
        logger.warn('No JSON subtasks found in meta-task output');
        return 0;
      }

      const jsonStr = jsonMatch[1].trim();
      const subtasks = JSON.parse(jsonStr);

      if (!Array.isArray(subtasks)) {
        logger.warn('Subtasks output is not an array');
        return 0;
      }

      // Add each subtask to the queue
      const addedTasks = await this.taskManager.addTasks(
        subtasks.map((st: Record<string, unknown>) => ({
          type: (st.type as string) || 'article-generation',
          title: (st.title as string) || 'Untitled subtask',
          description: (st.description as string) || '',
          status: 'pending' as const,
          params: (st.params as Record<string, unknown>) || {},
          parentTaskId: parentTask.id,
          maxRetries: 3,
        }))
      );

      logger.info(`Added ${addedTasks.length} subtasks from meta-task #${parentTask.id}`);
      return addedTasks.length;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to parse subtasks from meta-task output', { error: errorMessage });
      return 0;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create executor from worker config
 */
export function createExecutorFromConfig(
  workerConfig: WorkerConfig,
  taskManager: TaskManager,
  adaptersDir: string,
  callbacks?: ExecutorCallbacks
): WorkerExecutor {
  const config: ExecutorConfig = {
    workerId: workerConfig.workerId,
    role: workerConfig.role,
    depth: 0, // TODO: get from hierarchy config
    adaptersDir,
    outputDir: workerConfig.paths.outputDir,
    projectCodename: 'project', // TODO: get from project config
    includeStatute: true,
    maxRetries: 3,
  };

  return new WorkerExecutor(config, taskManager, callbacks);
}

/**
 * Create executor with VS Code progress integration
 */
export async function executeTaskWithProgress(
  task: Task,
  executor: WorkerExecutor
): Promise<ExecutionResult> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Executing Task #${task.id}`,
      cancellable: true,
    },
    async (progress, token) => {
      // Connect cancellation
      token.onCancellationRequested(() => {
        executor.stop();
      });

      // Execute with progress updates
      const originalCallbacks = (executor as unknown as { callbacks: ExecutorCallbacks }).callbacks;
      const wrappedCallbacks: ExecutorCallbacks = {
        ...originalCallbacks,
        onProgress: (t, msg) => {
          progress.report({ message: msg });
          originalCallbacks.onProgress?.(t, msg);
        },
      };

      // Temporarily replace callbacks
      (executor as unknown as { callbacks: ExecutorCallbacks }).callbacks = wrappedCallbacks;

      try {
        return await executor.executeTask(task);
      } finally {
        (executor as unknown as { callbacks: ExecutorCallbacks }).callbacks = originalCallbacks;
      }
    }
  );
}
