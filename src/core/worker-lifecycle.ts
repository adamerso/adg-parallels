/**
 * ADG-Parallels Worker Lifecycle Manager
 * 
 * Handles worker spawning, heartbeat monitoring, auto-restart, and disposal.
 * Uses VS Code windows and file-based communication.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { 
  WorkerHeartbeat, 
  WorkerConfig, 
  Role,
  Task,
  RolePaths
} from '../types';
import { 
  pathExists, 
  readJson, 
  writeJson, 
  withLock,
  ensureDir
} from '../utils/file-operations';
import { logger } from '../utils/logger';
import { TaskManager } from './task-manager';

// =============================================================================
// CONSTANTS
// =============================================================================

const HEARTBEAT_INTERVAL_MS = 30_000;  // 30 seconds
const UNRESPONSIVE_THRESHOLD_MS = 90_000;  // 90 seconds
const HEALTH_CHECK_INTERVAL_MS = 15_000;  // 15 seconds

// =============================================================================
// WORKER INFO
// =============================================================================

export interface WorkerInfo {
  workerId: string;
  workerDir: string;
  configPath: string;
  heartbeatPath: string;
  instructionsPath: string;
  outputDir: string;
  config?: WorkerConfig;
  heartbeat?: WorkerHeartbeat;
  isHealthy: boolean;
  lastHealthCheck: Date;
}

// =============================================================================
// WORKER LIFECYCLE MANAGER
// =============================================================================

export class WorkerLifecycleManager {
  private workers: Map<string, WorkerInfo> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;
  private managementDir: string;
  private workersBaseDir: string;
  private taskManager: TaskManager;
  private isManager: boolean;
  private workerId?: string;

  constructor(
    managementDir: string,
    taskManager: TaskManager,
    isManager: boolean = false,
    workerId?: string
  ) {
    this.managementDir = managementDir;
    this.workersBaseDir = path.join(managementDir, '..', 'workers');
    this.taskManager = taskManager;
    this.isManager = isManager;
    this.workerId = workerId;
  }

  // ===========================================================================
  // MANAGER FUNCTIONS (Spawning & Monitoring Workers)
  // ===========================================================================

  /**
   * Initialize the lifecycle manager
   */
  async initialize(): Promise<void> {
    if (this.isManager) {
      await this.discoverExistingWorkers();
      this.startHealthMonitoring();
    } else if (this.workerId) {
      this.startHeartbeat();
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    logger.info('Worker lifecycle manager disposed');
  }

  /**
   * Discover existing workers from the workers directory
   */
  private async discoverExistingWorkers(): Promise<void> {
    if (!pathExists(this.workersBaseDir)) {
      logger.info('No workers directory found');
      return;
    }

    const entries = fs.readdirSync(this.workersBaseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('worker-')) {
        const workerDir = path.join(this.workersBaseDir, entry.name);
        const workerInfo = await this.loadWorkerInfo(entry.name, workerDir);
        if (workerInfo) {
          this.workers.set(entry.name, workerInfo);
          logger.info(`Discovered worker: ${entry.name}`);
        }
      }
    }
  }

  /**
   * Load worker info from directory
   */
  private async loadWorkerInfo(workerId: string, workerDir: string): Promise<WorkerInfo | null> {
    const configPath = path.join(workerDir, 'worker.json');
    const heartbeatPath = path.join(workerDir, 'heartbeat.json');
    const instructionsPath = path.join(workerDir, 'instructions.md');
    const outputDir = path.join(workerDir, 'output');

    const config = pathExists(configPath) ? readJson<WorkerConfig>(configPath) : undefined;
    const heartbeat = pathExists(heartbeatPath) ? readJson<WorkerHeartbeat>(heartbeatPath) : undefined;

    return {
      workerId,
      workerDir,
      configPath,
      heartbeatPath,
      instructionsPath,
      outputDir,
      config: config ?? undefined,
      heartbeat: heartbeat ?? undefined,
      isHealthy: this.isHeartbeatHealthy(heartbeat ?? undefined),
      lastHealthCheck: new Date(),
    };
  }

  /**
   * Check if heartbeat indicates healthy worker
   */
  private isHeartbeatHealthy(heartbeat?: WorkerHeartbeat): boolean {
    if (!heartbeat) {
      return false;
    }

    const lastActivity = new Date(heartbeat.lastActivityTimestamp);
    const now = new Date();
    const timeDiff = now.getTime() - lastActivity.getTime();

    return timeDiff < UNRESPONSIVE_THRESHOLD_MS && heartbeat.status !== 'unresponsive';
  }

  /**
   * Provision a new worker
   */
  async provisionWorker(workerId?: string): Promise<WorkerInfo | null> {
    // Generate worker ID if not provided
    const id = workerId || `worker-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const workerDir = path.join(this.workersBaseDir, id);

    // Create worker directory structure
    ensureDir(workerDir);
    ensureDir(path.join(workerDir, 'output'));
    ensureDir(path.join(workerDir, '.adg-parallels', 'worker'));

    // Get tasks file path from task manager (correct dynamic path)
    const tasksFilePath = this.taskManager.getFilePath();

    // Create worker config
    const workerConfig: WorkerConfig = {
      workerId: id,
      role: 'worker',
      parentRole: 'manager',
      paths: {
        tasksFile: tasksFilePath,
        attachments: path.join(workerDir, 'attachments'),
        outputDir: path.join(workerDir, 'output'),
        workerRoot: workerDir,
      },
      taskFilter: {
        status: 'pending',
      },
      createdAt: new Date().toISOString(),
      instructionsVersion: '1.0',
    };

    // Write worker config
    const configPath = path.join(workerDir, 'worker.json');
    writeJson(configPath, workerConfig);

    // Create initial heartbeat
    const heartbeat: WorkerHeartbeat = {
      workerId: id,
      lastActivityTimestamp: new Date().toISOString(),
      status: 'idle',
      consecutiveFailures: 0,
    };
    const heartbeatPath = path.join(workerDir, 'heartbeat.json');
    writeJson(heartbeatPath, heartbeat);

    // Create worker instructions
    await this.generateWorkerInstructions(workerDir, workerConfig);

    const workerInfo: WorkerInfo = {
      workerId: id,
      workerDir,
      configPath,
      heartbeatPath,
      instructionsPath: path.join(workerDir, 'instructions.md'),
      outputDir: path.join(workerDir, 'output'),
      config: workerConfig,
      heartbeat,
      isHealthy: true,
      lastHealthCheck: new Date(),
    };

    this.workers.set(id, workerInfo);
    logger.info(`Worker ${id} provisioned at ${workerDir}`);

    return workerInfo;
  }

  /**
   * Generate worker instructions file
   */
  private async generateWorkerInstructions(
    workerDir: string, 
    config: WorkerConfig
  ): Promise<void> {
    const instructions = `# ADG-Parallels Worker Instructions

## Your Role
You are an ADG-Parallels **Worker** (id: ${config.workerId}).

## Primary Directive
1. Check your task file: \`${config.paths.tasksFile}\`
2. Find tasks with status "pending"
3. Claim a task by updating its status to "processing" and adding your worker ID
4. Complete the task according to its type and parameters
5. Save output to your output directory: \`${config.paths.outputDir}\`
6. Update task status to "task_completed"
7. Repeat until no pending tasks remain

## Critical Rules
- Only work on ONE task at a time
- Update heartbeat.json regularly to show you're alive
- If you encounter an error, update task status with lastError
- Do not modify tasks assigned to other workers
- Check for new tasks after completing each one

## Your Workspace
- Config: \`worker.json\`
- Heartbeat: \`heartbeat.json\`
- Output: \`output/\`

## Heartbeat Protocol
Update \`heartbeat.json\` every 30 seconds with:
\`\`\`json
{
  "workerId": "${config.workerId}",
  "lastActivityTimestamp": "<current ISO timestamp>",
  "status": "working",
  "currentTask": { "id": <task_id>, "title": "<task_title>", "startedAt": "<timestamp>" }
}
\`\`\`

## Starting Work
Please confirm you've read these instructions by:
1. Reading your task file
2. Claiming your first pending task
3. Beginning work immediately

Good luck, worker! 🚀
`;

    fs.writeFileSync(path.join(workerDir, 'instructions.md'), instructions, 'utf8');
    logger.info(`Instructions generated for worker ${config.workerId}`);
  }

  /**
   * Spawn a worker in a new VS Code window
   */
  async spawnWorker(workerInfo: WorkerInfo): Promise<boolean> {
    try {
      // Simple approach - just open the folder in a new window
      // Extension will be loaded if installed, or user can run commands manually
      const uri = vscode.Uri.file(workerInfo.workerDir);
      await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
      logger.info(`Spawned worker window: ${workerInfo.workerId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to spawn worker: ${workerInfo.workerId}`, error);
      return false;
    }
  }

  /**
   * Provision and spawn multiple workers
   */
  async provisionAndSpawnWorkers(count: number): Promise<WorkerInfo[]> {
    const workers: WorkerInfo[] = [];
    
    for (let i = 0; i < count; i++) {
      const worker = await this.provisionWorker();
      if (worker) {
        workers.push(worker);
        await this.spawnWorker(worker);
        // Small delay between spawns to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    logger.info(`Provisioned and spawned ${workers.length} workers`);
    return workers;
  }

  /**
   * Start health monitoring (manager only)
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, HEALTH_CHECK_INTERVAL_MS);

    logger.info('Health monitoring started');
  }

  /**
   * Perform health check on all workers
   */
  private async performHealthCheck(): Promise<void> {
    const unhealthyWorkers: WorkerInfo[] = [];

    for (const [id, worker] of this.workers) {
      // Reload heartbeat
      if (pathExists(worker.heartbeatPath)) {
        worker.heartbeat = readJson<WorkerHeartbeat>(worker.heartbeatPath) ?? undefined;
      }

      worker.isHealthy = this.isHeartbeatHealthy(worker.heartbeat);
      worker.lastHealthCheck = new Date();

      if (!worker.isHealthy) {
        unhealthyWorkers.push(worker);
        logger.warn(`Worker ${id} is unhealthy`);
      }
    }

    // Handle unhealthy workers
    for (const worker of unhealthyWorkers) {
      await this.handleUnhealthyWorker(worker);
    }
  }

  /**
   * Handle an unhealthy worker
   */
  private async handleUnhealthyWorker(worker: WorkerInfo): Promise<void> {
    if (!worker.heartbeat) {
      return;
    }

    worker.heartbeat.consecutiveFailures++;

    // Release any claimed tasks back to queue
    const released = await this.taskManager.releaseWorkerTasks(worker.workerId);
    if (released > 0) {
      logger.info(`Released ${released} tasks from unhealthy worker ${worker.workerId}`);
    }

    // Update heartbeat to show unresponsive
    worker.heartbeat.status = 'unresponsive';
    writeJson(worker.heartbeatPath, worker.heartbeat);

    // Auto-restart if configured (future: check hierarchy config)
    if (worker.heartbeat.consecutiveFailures >= 3) {
      logger.warn(`Worker ${worker.workerId} failed too many times, consider manual intervention`);
      // Could trigger auto-restart here
    }
  }

  /**
   * Get all worker statuses
   */
  getWorkerStatuses(): Map<string, WorkerInfo> {
    return this.workers;
  }

  /**
   * Get healthy worker count
   */
  getHealthyWorkerCount(): number {
    let count = 0;
    for (const worker of this.workers.values()) {
      if (worker.isHealthy) {
        count++;
      }
    }
    return count;
  }

  // ===========================================================================
  // WORKER FUNCTIONS (Heartbeat & Self-reporting)
  // ===========================================================================

  /**
   * Start heartbeat (worker only)
   */
  private startHeartbeat(): void {
    if (!this.workerId) {
      return;
    }

    // Initial heartbeat
    this.updateHeartbeat('idle');

    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    logger.info(`Heartbeat started for worker ${this.workerId}`);
  }

  /**
   * Update heartbeat file
   */
  updateHeartbeat(
    status?: 'idle' | 'working' | 'error',
    currentTask?: { id: number; title: string; startedAt: string }
  ): void {
    if (!this.workerId) {
      return;
    }

    const heartbeatPath = path.join(
      this.managementDir, 
      '..', 
      'workers', 
      this.workerId, 
      'heartbeat.json'
    );

    const heartbeat: WorkerHeartbeat = {
      workerId: this.workerId,
      lastActivityTimestamp: new Date().toISOString(),
      status: status || 'idle',
      currentTask,
      consecutiveFailures: 0,
    };

    writeJson(heartbeatPath, heartbeat);
  }

  /**
   * Report error in heartbeat
   */
  reportError(error: string): void {
    this.updateHeartbeat('error');
    logger.error(`Worker ${this.workerId} error: ${error}`);
  }

  /**
   * Signal task start
   */
  signalTaskStart(task: Task): void {
    this.updateHeartbeat('working', {
      id: task.id,
      title: task.title,
      startedAt: new Date().toISOString(),
    });
  }

  /**
   * Signal task completion
   */
  signalTaskComplete(): void {
    this.updateHeartbeat('idle');
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a lifecycle manager for a manager role
 */
export function createManagerLifecycle(
  managementDir: string,
  taskManager: TaskManager
): WorkerLifecycleManager {
  return new WorkerLifecycleManager(managementDir, taskManager, true);
}

/**
 * Create a lifecycle manager for a worker role
 */
export function createWorkerLifecycle(
  managementDir: string,
  taskManager: TaskManager,
  workerId: string
): WorkerLifecycleManager {
  return new WorkerLifecycleManager(managementDir, taskManager, false, workerId);
}
