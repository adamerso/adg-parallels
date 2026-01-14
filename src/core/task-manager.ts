/**
 * ADG-Parallels Task Manager
 * 
 * Manages the task queue with atomic updates, locking, and race condition handling.
 * This is the heart of task coordination between workers.
 * 
 * v0.3.0: Added pipeline stage support for multi-stage task execution.
 * v0.3.7: Added XML format support (tasks.xml)
 */

import * as path from 'path';
import * as fs from 'fs';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { 
  Task, 
  TaskStatus, 
  ProjectTasks, 
  ProjectConfig, 
  TaskStats,
  PipelineTask,
  PipelineAdapter,
  StageHistoryEntry
} from '../types';
import { 
  readJson, 
  writeJson, 
  withLock, 
  findFiles, 
  pathExists 
} from '../utils/file-operations';
import { logger } from '../utils/logger';
import { isClaimableStage, getNextWorkingStage } from './pipeline-engine';

/**
 * Task Manager class for handling task queue operations
 */
export class TaskManager {
  private tasksFilePath: string;
  private adapter?: PipelineAdapter;
  private isXmlFormat: boolean;

  constructor(tasksFilePath: string, adapter?: PipelineAdapter) {
    this.tasksFilePath = tasksFilePath;
    this.adapter = adapter;
    this.isXmlFormat = tasksFilePath.endsWith('.xml');
  }

  /**
   * Set the adapter for pipeline operations
   */
  setAdapter(adapter: PipelineAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Get the current adapter
   */
  getAdapter(): PipelineAdapter | undefined {
    return this.adapter;
  }

  /**
   * Get the path to the tasks file
   */
  getFilePath(): string {
    return this.tasksFilePath;
  }

  /**
   * Load the project tasks file (supports both XML and JSON)
   */
  async load(): Promise<ProjectTasks | null> {
    return await withLock(this.tasksFilePath, () => {
      if (this.isXmlFormat) {
        return this.loadXml();
      }
      return this.loadSync();
    });
  }

  /**
   * Load tasks from XML format
   */
  private loadXml(): ProjectTasks | null {
    if (!pathExists(this.tasksFilePath)) {
      return null;
    }
    
    try {
      const xmlContent = fs.readFileSync(this.tasksFilePath, 'utf8');
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        parseTagValue: true,
        trimValues: true,
        isArray: (name) => ['task'].includes(name),
      });
      
      const parsed = parser.parse(xmlContent);
      const tasksRoot = parsed.tasks || {};
      const metadata = tasksRoot.metadata || {};
      const taskList = tasksRoot.task_list?.task || tasksRoot.task || [];
      
      // Convert XML structure to ProjectTasks
      const tasks: Task[] = (Array.isArray(taskList) ? taskList : [taskList])
        .filter(Boolean)
        .map((t: any, idx: number) => ({
          id: parseInt(t['@_id'] || t.id || String(idx + 1)),
          title: t.title || '',
          type: t.type || 'generic',
          status: (t['@_status'] || t.status || 'pending') as TaskStatus,
          description: t.description || '',
          assignedWorker: t.assigned_worker || t['assigned-worker'] || undefined,
          startedAt: t.started_at || t['started-at'] || undefined,
          completedAt: t.completed_at || t['completed-at'] || undefined,
          retryCount: parseInt(t.retry_count || t['retry-count'] || '0'),
          maxRetries: parseInt(t.max_retries || t['max-retries'] || '3'),
          lastError: t.last_error || t['last-error'] || undefined,
        }));
      
      return {
        projectCodename: metadata.project || 'unknown',
        version: '1.0',
        createdAt: metadata.created_at || metadata['created-at'] || new Date().toISOString(),
        updatedAt: metadata.updated_at || metadata['updated-at'] || new Date().toISOString(),
        config: {
          workerCount: 4,
          statuses: ['pending', 'processing', 'task_completed', 'audit_passed'],
          completedStatuses: ['task_completed', 'audit_passed'],
          failedStatuses: ['audit_failed'],
          retryOnFailed: true,
          outputPattern: 'output/{id}_{title}.md',
        },
        globalStatus: tasks.length === 0 ? 'not_started' : 'in_progress',
        stats: {
          total: tasks.length,
          pending: tasks.filter(t => t.status === 'pending').length,
          processing: tasks.filter(t => t.status === 'processing').length,
          completed: tasks.filter(t => ['task_completed', 'audit_passed'].includes(t.status)).length,
          failed: tasks.filter(t => t.status === 'audit_failed').length,
        },
        tasks,
      };
    } catch (e) {
      logger.error('Failed to load tasks XML', { path: this.tasksFilePath, error: e });
      return null;
    }
  }

  /**
   * Save the project tasks file (supports both XML and JSON)
   */
  private async save(data: ProjectTasks): Promise<boolean> {
    data.updatedAt = new Date().toISOString();
    this.updateStats(data);
    
    if (this.isXmlFormat) {
      return this.saveXml(data);
    }
    return writeJson(this.tasksFilePath, data);
  }

  /**
   * Save tasks to XML format
   */
  private saveXml(data: ProjectTasks): boolean {
    try {
      const taskElements = data.tasks.map(t => `    <task id="${t.id}" status="${t.status}">
      <title>${this.escapeXml(t.title)}</title>
      <type>${t.type}</type>
      <description><![CDATA[${t.description || ''}]]></description>
      ${t.assignedWorker ? `<assigned_worker>${t.assignedWorker}</assigned_worker>` : ''}
      ${t.startedAt ? `<started_at>${t.startedAt}</started_at>` : ''}
      ${t.completedAt ? `<completed_at>${t.completedAt}</completed_at>` : ''}
      <retry_count>${t.retryCount}</retry_count>
      <max_retries>${t.maxRetries}</max_retries>
      ${t.lastError ? `<last_error><![CDATA[${t.lastError}]]></last_error>` : ''}
    </task>`).join('\n');

      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<tasks>
  <metadata>
    <project>${this.escapeXml(data.projectCodename)}</project>
    <created_at>${data.createdAt}</created_at>
    <updated_at>${data.updatedAt}</updated_at>
    <stats>
      <total>${data.stats.total}</total>
      <pending>${data.stats.pending}</pending>
      <processing>${data.stats.processing}</processing>
      <completed>${data.stats.completed}</completed>
      <failed>${data.stats.failed}</failed>
    </stats>
  </metadata>
  <task_list>
${taskElements}
  </task_list>
</tasks>
`;
      fs.writeFileSync(this.tasksFilePath, xmlContent, 'utf8');
      return true;
    } catch (e) {
      logger.error('Failed to save tasks XML', { path: this.tasksFilePath, error: e });
      return false;
    }
  }

  /**
   * Escape special XML characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Synchronous load (used inside lock) - supports both XML and JSON
   */
  private loadSync(): ProjectTasks | null {
    if (this.isXmlFormat) {
      return this.loadXml();
    }
    // JSON format - use readJson helper
    return readJson<ProjectTasks>(this.tasksFilePath);
  }

  /**
   * Synchronous save (used inside lock) - supports both XML and JSON
   */
  private saveSyncInternal(data: ProjectTasks): boolean {
    data.updatedAt = new Date().toISOString();
    this.updateStats(data);
    if (this.isXmlFormat) {
      return this.saveXml(data);
    }
    return writeJson(this.tasksFilePath, data);
  }

  /**
   * Update task statistics
   */
  private updateStats(data: ProjectTasks): void {
    const stats: TaskStats = {
      total: data.tasks.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const task of data.tasks) {
      switch (task.status) {
        case 'pending':
          stats.pending++;
          break;
        case 'processing':
          stats.processing++;
          break;
        case 'task_completed':
        case 'audit_in_progress':
        case 'audit_passed':
          stats.completed++;
          break;
        case 'audit_failed':
          stats.failed++;
          break;
      }
    }

    data.stats = stats;

    // Update global status
    if (stats.pending === 0 && stats.processing === 0) {
      if (stats.failed > 0) {
        data.globalStatus = 'all_disposed';
      } else {
        data.globalStatus = 'completed';
      }
    } else if (stats.processing > 0 || stats.completed > 0) {
      data.globalStatus = 'in_progress';
    } else {
      data.globalStatus = 'not_started';
    }
  }

  /**
   * Get all tasks
   */
  async getAllTasks(): Promise<Task[]> {
    const data = await this.load();
    return data?.tasks ?? [];
  }

  /**
   * Get tasks by status
   */
  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    const tasks = await this.getAllTasks();
    return tasks.filter(t => t.status === status);
  }

  /**
   * Get a specific task by ID
   */
  async getTask(taskId: number): Promise<Task | null> {
    const tasks = await this.getAllTasks();
    return tasks.find(t => t.id === taskId) ?? null;
  }

  /**
   * Find and claim the first available pending task
   * Returns the claimed task or null if none available
   */
  async claimNextTask(workerId: string): Promise<Task | null> {
    return await withLock(this.tasksFilePath, async () => {
      const data = this.loadSync();
      if (!data) {
        logger.error('Could not load tasks file');
        return null;
      }

      // Find first pending task
      const task = data.tasks.find(t => t.status === 'pending');
      if (!task) {
        logger.info('No pending tasks available');
        return null;
      }

      // Claim the task
      task.status = 'processing';
      task.assignedWorker = workerId;
      task.startedAt = new Date().toISOString();

      // Save immediately
      if (!this.saveSync(data)) {
        logger.error('Failed to save task claim');
        return null;
      }

      logger.info(`Task ${task.id} claimed by ${workerId}`, { 
        title: task.title, 
        type: task.type 
      });

      return task;
    });
  }

  /**
   * Synchronous save (used inside lock) - supports both XML and JSON
   */
  private saveSync(data: ProjectTasks): boolean {
    data.updatedAt = new Date().toISOString();
    this.updateStats(data);
    if (this.isXmlFormat) {
      return this.saveXml(data);
    }
    return writeJson(this.tasksFilePath, data);
  }

  /**
   * Complete a task
   */
  async completeTask(
    taskId: number, 
    workerId: string, 
    outputFile?: string
  ): Promise<boolean> {
    return await withLock(this.tasksFilePath, () => {
      const data = this.loadSync();
      if (!data) {
        return false;
      }

      const task = data.tasks.find(t => t.id === taskId);
      if (!task) {
        logger.error(`Task ${taskId} not found`);
        return false;
      }

      // Verify ownership
      if (task.assignedWorker !== workerId) {
        logger.error(`Task ${taskId} not assigned to ${workerId}`);
        return false;
      }

      task.status = 'task_completed';
      task.completedAt = new Date().toISOString();
      if (outputFile) {
        task.outputFile = outputFile;
      }

      logger.info(`Task ${taskId} completed by ${workerId}`);
      return this.saveSync(data);
    }) ?? false;
  }

  /**
   * Fail a task (with optional retry)
   */
  async failTask(
    taskId: number, 
    workerId: string, 
    error: string
  ): Promise<boolean> {
    return await withLock(this.tasksFilePath, () => {
      const data = this.loadSync();
      if (!data) {
        return false;
      }

      const task = data.tasks.find(t => t.id === taskId);
      if (!task) {
        logger.error(`Task ${taskId} not found`);
        return false;
      }

      task.lastError = error;
      task.retryCount++;

      // Check if should retry
      if (task.retryCount < task.maxRetries && data.config.retryOnFailed) {
        task.status = 'pending';
        task.assignedWorker = undefined;
        task.startedAt = undefined;
        logger.warn(`Task ${taskId} failed, will retry (${task.retryCount}/${task.maxRetries})`);
      } else {
        task.status = 'audit_failed';
        task.completedAt = new Date().toISOString();
        logger.error(`Task ${taskId} failed permanently`, { error });
      }

      return this.saveSync(data);
    }) ?? false;
  }

  /**
   * Release a task (put back in queue)
   */
  async releaseTask(taskId: number, workerId: string): Promise<boolean> {
    return await withLock(this.tasksFilePath, () => {
      const data = this.loadSync();
      if (!data) {
        return false;
      }

      const task = data.tasks.find(t => t.id === taskId);
      if (!task) {
        return false;
      }

      // Only release if assigned to this worker
      if (task.assignedWorker === workerId) {
        task.status = 'pending';
        task.assignedWorker = undefined;
        task.startedAt = undefined;
        logger.info(`Task ${taskId} released by ${workerId}`);
        return this.saveSync(data);
      }

      return false;
    }) ?? false;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: number, 
    status: TaskStatus, 
    workerId?: string
  ): Promise<boolean> {
    return await withLock(this.tasksFilePath, () => {
      const data = this.loadSync();
      if (!data) {
        return false;
      }

      const task = data.tasks.find(t => t.id === taskId);
      if (!task) {
        return false;
      }

      // If workerId provided, verify ownership
      if (workerId && task.assignedWorker !== workerId) {
        logger.error(`Task ${taskId} not owned by ${workerId}`);
        return false;
      }

      task.status = status;
      
      if (status === 'task_completed' || status === 'audit_passed' || status === 'audit_failed') {
        task.completedAt = new Date().toISOString();
      }

      logger.info(`Task ${taskId} status updated to ${status}`);
      return this.saveSync(data);
    }) ?? false;
  }

  /**
   * Add a new task
   */
  async addTask(task: Omit<Task, 'id' | 'retryCount'>): Promise<Task | null> {
    return await withLock(this.tasksFilePath, () => {
      const data = this.loadSync();
      if (!data) {
        return null;
      }

      // Generate new ID
      const maxId = data.tasks.reduce((max, t) => Math.max(max, t.id), 0);
      const newTask: Task = {
        ...task,
        id: maxId + 1,
        retryCount: 0,
        maxRetries: task.maxRetries ?? 3,
      };

      data.tasks.push(newTask);
      
      if (this.saveSync(data)) {
        logger.info(`Task ${newTask.id} added`, { title: newTask.title });
        return newTask;
      }
      return null;
    });
  }

  /**
   * Add multiple tasks (bulk insert)
   */
  async addTasks(tasks: Array<Omit<Task, 'id' | 'retryCount'>>): Promise<Task[]> {
    return await withLock(this.tasksFilePath, () => {
      const data = this.loadSync();
      if (!data) {
        return [];
      }

      let maxId = data.tasks.reduce((max, t) => Math.max(max, t.id), 0);
      const newTasks: Task[] = [];

      for (const task of tasks) {
        maxId++;
        const newTask: Task = {
          ...task,
          id: maxId,
          retryCount: 0,
          maxRetries: task.maxRetries ?? 3,
        };
        data.tasks.push(newTask);
        newTasks.push(newTask);
      }

      if (this.saveSync(data)) {
        logger.info(`${newTasks.length} tasks added`);
        return newTasks;
      }
      return [];
    }) ?? [];
  }

  /**
   * Get project statistics
   */
  async getStats(): Promise<TaskStats | null> {
    const data = await this.load();
    return data?.stats ?? null;
  }

  /**
   * Get project configuration
   */
  async getConfig(): Promise<ProjectConfig | null> {
    const data = await this.load();
    return data?.config ?? null;
  }

  /**
   * Check if all tasks are completed
   */
  async isAllCompleted(): Promise<boolean> {
    const stats = await this.getStats();
    if (!stats) {
      return false;
    }
    return stats.pending === 0 && stats.processing === 0;
  }

  /**
   * Check if there are any pending tasks
   */
  async hasPendingTasks(): Promise<boolean> {
    const stats = await this.getStats();
    return (stats?.pending ?? 0) > 0;
  }

  /**
   * Get tasks assigned to a specific worker
   */
  async getWorkerTasks(workerId: string): Promise<Task[]> {
    const tasks = await this.getAllTasks();
    return tasks.filter(t => t.assignedWorker === workerId);
  }

  /**
   * Release all tasks assigned to a worker (for cleanup on crash)
   */
  async releaseWorkerTasks(workerId: string): Promise<number> {
    return await withLock(this.tasksFilePath, () => {
      const data = this.loadSync();
      if (!data) {
        return 0;
      }

      let released = 0;
      for (const task of data.tasks) {
        if (task.assignedWorker === workerId && task.status === 'processing') {
          task.status = 'pending';
          task.assignedWorker = undefined;
          task.startedAt = undefined;
          released++;
        }
      }

      if (released > 0) {
        this.saveSync(data);
        logger.info(`Released ${released} tasks from worker ${workerId}`);
      }

      return released;
    }) ?? 0;
  }

  /**
   * Get subtasks for a parent task
   */
  async getSubtasks(parentTaskId: number): Promise<Task[]> {
    const tasks = await this.getAllTasks();
    return tasks.filter(t => t.parentTaskId === parentTaskId);
  }

  /**
   * Check if all subtasks of a parent task are completed
   */
  async areSubtasksComplete(parentTaskId: number): Promise<boolean> {
    const subtasks = await this.getSubtasks(parentTaskId);
    if (subtasks.length === 0) {
      return false;
    }
    return subtasks.every(t => 
      t.status === 'task_completed' || 
      t.status === 'audit_passed'
    );
  }

  /**
   * Get aggregated output paths for subtasks
   */
  async getSubtaskOutputs(parentTaskId: number): Promise<string[]> {
    const subtasks = await this.getSubtasks(parentTaskId);
    return subtasks
      .filter(t => t.outputFile)
      .map(t => t.outputFile as string);
  }

  // ===========================================================================
  // PIPELINE STAGE OPERATIONS (v0.3.0)
  // ===========================================================================

  /**
   * Get a pipeline task by ID (with stage information)
   */
  async getPipelineTask(taskId: number): Promise<PipelineTask | null> {
    const task = await this.getTask(taskId);
    if (!task) {
      return null;
    }
    
    // Convert to PipelineTask format
    return {
      ...task,
      currentStageId: (task as any).currentStageId ?? '1',
      stageHistory: (task as any).stageHistory ?? [],
      stageOutputs: (task as any).stageOutputs ?? {},
      auditFeedback: (task as any).auditFeedback,
    };
  }

  /**
   * Find and claim the next available claimable stage for a task
   * Returns the task with claimed stage or null if none available
   */
  async claimNextStage(workerId: string): Promise<PipelineTask | null> {
    if (!this.adapter) {
      logger.error('No adapter set, cannot claim stage');
      return null;
    }

    return await withLock(this.tasksFilePath, async () => {
      const data = this.loadSync();
      if (!data) {
        logger.error('Could not load tasks file');
        return null;
      }

      // Find a task with a claimable stage
      for (const task of data.tasks) {
        const pipelineTask = task as unknown as PipelineTask;
        const currentStageId = pipelineTask.currentStageId ?? '1';
        
        // Skip if already assigned to another worker at this stage
        if (task.assignedWorker && task.assignedWorker !== workerId) {
          continue;
        }
        
        // Check if current stage is claimable (working stage)
        // Note: this.adapter is checked at function start
        if (isClaimableStage(this.adapter!, currentStageId)) {
          // Claim the task at this stage
          task.status = 'processing';
          task.assignedWorker = workerId;
          task.startedAt = new Date().toISOString();
          
          // Initialize stage history if needed
          if (!pipelineTask.stageHistory) {
            (task as any).stageHistory = [];
          }
          
          // Add to stage history
          const stage = this.adapter!.pipeline.find(s => s.id === currentStageId);
          (task as any).stageHistory.push({
            stageId: currentStageId,
            stageName: stage?.name ?? 'unknown',
            workerId: workerId,
            startedAt: new Date().toISOString(),
          });

          if (!this.saveSync(data)) {
            logger.error('Failed to save stage claim');
            return null;
          }

          logger.info(`Stage ${currentStageId} of task ${task.id} claimed by ${workerId}`, { 
            title: task.title, 
            stageName: stage?.name 
          });

          return {
            ...task,
            currentStageId,
            stageHistory: (task as any).stageHistory ?? [],
            stageOutputs: (task as any).stageOutputs ?? {},
          } as PipelineTask;
        }
      }

      logger.info('No claimable stages available');
      return null;
    });
  }

  /**
   * Update task to the next stage after completing current stage
   */
  async advanceToNextStage(
    taskId: number,
    workerId: string,
    nextStageId: string,
    stageOutput?: string
  ): Promise<boolean> {
    if (!this.adapter) {
      logger.error('No adapter set, cannot advance stage');
      return false;
    }

    return await withLock(this.tasksFilePath, () => {
      const data = this.loadSync();
      if (!data) {
        return false;
      }

      const task = data.tasks.find(t => t.id === taskId);
      if (!task) {
        logger.error(`Task ${taskId} not found`);
        return false;
      }

      // Verify ownership
      if (task.assignedWorker !== workerId) {
        logger.error(`Task ${taskId} not assigned to ${workerId}`);
        return false;
      }

      const pipelineTask = task as unknown as PipelineTask;
      const previousStageId = pipelineTask.currentStageId ?? '1';

      // Update stage history with completion
      const stageHistory = (task as any).stageHistory as StageHistoryEntry[] ?? [];
      const lastEntry = stageHistory[stageHistory.length - 1];
      if (lastEntry && lastEntry.stageId === previousStageId) {
        lastEntry.completedAt = new Date().toISOString();
        if (lastEntry.startedAt) {
          lastEntry.durationMs = Date.now() - new Date(lastEntry.startedAt).getTime();
        }
      }
      (task as any).stageHistory = stageHistory;

      // Save stage output
      if (stageOutput) {
        const stageOutputs = (task as any).stageOutputs ?? {};
        stageOutputs[previousStageId] = stageOutput;
        (task as any).stageOutputs = stageOutputs;
      }

      // Update to next stage
      (task as any).currentStageId = nextStageId;

      // Check if next stage is terminal
      const nextStage = this.adapter!.pipeline.find(s => s.id === nextStageId);
      if (nextStage?.isTerminal) {
        task.status = nextStage.name === 'completed' ? 'task_completed' : 'audit_failed';
        task.completedAt = new Date().toISOString();
        task.assignedWorker = undefined;
        logger.info(`Task ${taskId} reached terminal stage: ${nextStage.name}`);
      } else {
        // Check if next stage is claimable or wait stage
        if (isClaimableStage(this.adapter!, nextStageId)) {
          // Worker can continue
          logger.info(`Task ${taskId} advanced to working stage ${nextStageId}`);
        } else {
          // Release task for other workers or automatic transition
          task.status = 'pending';
          task.assignedWorker = undefined;
          logger.info(`Task ${taskId} in wait stage ${nextStageId}, released for next worker`);
        }
      }

      return this.saveSync(data);
    }) ?? false;
  }

  /**
   * Get all tasks at a specific stage
   */
  async getTasksAtStage(stageId: string): Promise<PipelineTask[]> {
    const tasks = await this.getAllTasks();
    return tasks
      .filter(t => (t as any).currentStageId === stageId)
      .map(t => ({
        ...t,
        currentStageId: (t as any).currentStageId ?? '1',
        stageHistory: (t as any).stageHistory ?? [],
        stageOutputs: (t as any).stageOutputs ?? {},
      })) as PipelineTask[];
  }

  /**
   * Get stage output from a task
   */
  async getStageOutput(taskId: number, stageId: string): Promise<string | null> {
    const task = await this.getTask(taskId);
    if (!task) {
      return null;
    }
    const stageOutputs = (task as any).stageOutputs ?? {};
    return stageOutputs[stageId] ?? null;
  }

  /**
   * Set audit feedback for a task (used when audit fails)
   */
  async setAuditFeedback(
    taskId: number, 
    feedback: string, 
    restartStageId: string
  ): Promise<boolean> {
    return await withLock(this.tasksFilePath, () => {
      const data = this.loadSync();
      if (!data) {
        return false;
      }

      const task = data.tasks.find(t => t.id === taskId);
      if (!task) {
        return false;
      }

      // Set audit feedback for next iteration
      (task as any).auditFeedback = feedback;
      (task as any).currentStageId = restartStageId;
      task.status = 'pending';
      task.assignedWorker = undefined;
      task.retryCount++;

      logger.info(`Task ${taskId} audit failed, restarting from stage ${restartStageId}`);
      return this.saveSync(data);
    }) ?? false;
  }

  /**
   * Clear audit feedback (when task is picked up for retry)
   */
  async clearAuditFeedback(taskId: number): Promise<boolean> {
    return await withLock(this.tasksFilePath, () => {
      const data = this.loadSync();
      if (!data) {
        return false;
      }

      const task = data.tasks.find(t => t.id === taskId);
      if (!task) {
        return false;
      }

      delete (task as any).auditFeedback;
      return this.saveSync(data);
    }) ?? false;
  }

  /**
   * Update parent task with subtask IDs
   */
  async linkSubtasksToParent(parentTaskId: number, subtaskIds: number[]): Promise<boolean> {
    return await withLock(this.tasksFilePath, () => {
      const data = this.loadSync();
      if (!data) {
        return false;
      }

      const parentTask = data.tasks.find(t => t.id === parentTaskId);
      if (!parentTask) {
        return false;
      }

      parentTask.subtaskIds = subtaskIds;
      return this.saveSync(data);
    }) ?? false;
  }

  /**
   * Create an audit task for a completed task
   */
  async createAuditTask(originalTaskId: number, outputContent?: string): Promise<Task | null> {
    const originalTask = await this.getTask(originalTaskId);
    if (!originalTask) {
      logger.error(`Task ${originalTaskId} not found for audit`);
      return null;
    }

    if (originalTask.status !== 'task_completed') {
      logger.warn(`Task ${originalTaskId} is not completed, cannot audit`);
      return null;
    }

    // Update original task to audit_in_progress
    await this.updateTaskStatus(originalTaskId, 'audit_in_progress');

    // Create audit task
    const auditTask = await this.addTask({
      type: 'task-audit',
      title: `Audit: ${originalTask.title}`,
      description: `Review the output of task #${originalTaskId}`,
      status: 'pending',
      maxRetries: 2,
      params: {
        originalTaskId: originalTaskId,
        originalType: originalTask.type,
        originalTitle: originalTask.title,
        outputFile: originalTask.outputFile,
        outputContent: outputContent?.substring(0, 5000), // Limit content size
      },
    });

    if (auditTask) {
      logger.info(`Created audit task #${auditTask.id} for task #${originalTaskId}`);
    }

    return auditTask;
  }

  /**
   * Process audit result and update original task
   */
  async processAuditResult(
    auditTaskId: number, 
    passed: boolean, 
    reason?: string
  ): Promise<boolean> {
    const auditTask = await this.getTask(auditTaskId);
    if (!auditTask || auditTask.type !== 'task-audit') {
      logger.error(`Invalid audit task: ${auditTaskId}`);
      return false;
    }

    const originalTaskId = auditTask.params?.originalTaskId as number;
    if (!originalTaskId) {
      logger.error('Audit task missing originalTaskId');
      return false;
    }

    // Update original task status based on audit result
    const newStatus = passed ? 'audit_passed' : 'audit_failed';
    const success = await this.updateTaskStatus(originalTaskId, newStatus);

    if (success) {
      logger.info(`Audit ${passed ? 'passed' : 'failed'} for task #${originalTaskId}`, { reason });
    }

    return success;
  }

  /**
   * Get tasks ready for audit (completed but not yet audited)
   */
  async getTasksReadyForAudit(): Promise<Task[]> {
    const tasks = await this.getAllTasks();
    return tasks.filter(t => 
      t.status === 'task_completed' && 
      t.type !== 'task-audit' // Don't audit audit tasks
    );
  }
}

/**
 * Find tasks file in a directory
 * 
 * Searches for task file: tasks.xml (primary format)
 */
export function findTasksFile(managementDir: string): string | null {
  // Primary format: tasks.xml in project directory
  const tasksXmlPath = require('path').join(managementDir, 'tasks.xml');
  if (pathExists(tasksXmlPath)) {
    return tasksXmlPath;
  }
  
  // Also check for project_*_tasks.xml naming convention
  const files = findFiles(managementDir, /^(project_.*_)?tasks\.xml$/);
  if (files.length > 0) {
    return files[0];
  }
  
  return null;
}

/**
 * Create a new project tasks file
 */
export function createProjectTasks(
  filePath: string,
  projectCodename: string,
  config: Partial<ProjectConfig>,
  initialTasks: Array<Omit<Task, 'id' | 'retryCount' | 'maxRetries'>> = []
): boolean {
  const defaultConfig: ProjectConfig = {
    workerCount: 4,
    statuses: ['pending', 'processing', 'task_completed', 'audit_in_progress', 'audit_passed', 'audit_failed'],
    completedStatuses: ['audit_passed'],
    failedStatuses: ['audit_failed'],
    retryOnFailed: true,
    outputPattern: 'output/{id}_{title}.md',
    ...config,
  };

  const tasks: Task[] = initialTasks.map((t, i) => ({
    ...t,
    id: i + 1,
    status: t.status || 'pending',
    retryCount: 0,
    maxRetries: 3,
  }));

  const projectTasks: ProjectTasks = {
    projectCodename,
    version: '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: defaultConfig,
    globalStatus: 'not_started',
    stats: {
      total: tasks.length,
      pending: tasks.length,
      processing: 0,
      completed: 0,
      failed: 0,
    },
    tasks,
  };

  return writeJson(filePath, projectTasks);
}
