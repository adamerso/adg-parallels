/**
 * ADG-Parallels Worker Lifecycle Manager
 * 
 * Handles worker spawning, heartbeat monitoring, auto-restart, and disposal.
 * Uses VS Code windows and file-based communication.
 * 
 * v0.3.0: XML heartbeat format, 60s interval, stage tracking.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { 
  WorkerHeartbeat, 
  WorkerConfig, 
  Role,
  Task,
  RolePaths,
  HeartbeatXML,
  PipelineTask
} from '../types';
import { 
  pathExists, 
  withLock,
  ensureDir
} from '../utils/file-operations';
import { logger } from '../utils/logger';
import { TaskManager } from './task-manager';
import { saveXML, loadXML, serializeToXML, parseXMLString } from './xml-loader';

// =============================================================================
// CONSTANTS
// =============================================================================

const HEARTBEAT_INTERVAL_MS = 60_000;  // 60 seconds (v0.3.0)
const UNRESPONSIVE_THRESHOLD_MS = 180_000;  // 3 minutes
const HEALTH_CHECK_INTERVAL_MS = 30_000;  // 30 seconds

// =============================================================================
// WORKER INFO
// =============================================================================

export interface WorkerInfo {
  workerId: string;
  workerDir: string;
  configPath: string;
  heartbeatPath: string;  // .xml in v0.3.0
  instructionsPath: string;
  outputDir: string;
  config?: WorkerConfig;
  heartbeat?: HeartbeatXML;  // XML format in v0.3.0
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
    // Workers dir is inside the project directory
    this.workersBaseDir = path.join(managementDir, 'workers');
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
    const configPath = path.join(workerDir, 'worker.xml');
    const heartbeatPath = path.join(workerDir, 'heartbeat.xml');
    const instructionsPath = path.join(workerDir, 'instructions.md');
    const outputDir = path.join(workerDir, 'output');

    // Load worker config from XML
    let config: WorkerConfig | undefined;
    if (pathExists(configPath)) {
      try {
        const xmlData = await loadXML<any>(configPath);
        config = this.parseWorkerConfigXml(xmlData);
      } catch (e) {
        logger.warn(`Failed to load worker config XML: ${configPath}`, e);
      }
    }
    
    // Load heartbeat from XML
    let heartbeat: HeartbeatXML | undefined;
    if (pathExists(heartbeatPath)) {
      heartbeat = await loadXML<HeartbeatXML>(heartbeatPath) ?? undefined;
    }

    return {
      workerId,
      workerDir,
      configPath,
      heartbeatPath,  // XML path for writes
      instructionsPath,
      outputDir,
      config: config ?? undefined,
      heartbeat,
      isHealthy: this.isHeartbeatHealthy(heartbeat),
      lastHealthCheck: new Date(),
    };
  }

  /**
   * Parse worker config from XML structure
   */
  private parseWorkerConfigXml(xmlData: any): WorkerConfig {
    const worker = xmlData.worker || xmlData;
    return {
      workerId: worker.worker_id || worker.workerId || '',
      role: worker.role || 'worker',
      parentRole: worker.parent_role || worker.parentRole || 'manager',
      paths: {
        tasksFile: worker.paths?.tasks_file || worker.paths?.tasksFile || '',
        attachments: worker.paths?.attachments || '',
        outputDir: worker.paths?.output_dir || worker.paths?.outputDir || '',
        workerRoot: worker.paths?.worker_root || worker.paths?.workerRoot || '',
      },
      taskFilter: {
        status: worker.task_filter?.status || worker.taskFilter?.status || 'pending',
      },
      createdAt: worker.created_at || worker.createdAt || new Date().toISOString(),
      instructionsVersion: worker.instructions_version || worker.instructionsVersion || '1.0',
    };
  }

  /**
   * Save worker config as XML
   */
  private async saveWorkerConfigXml(filePath: string, config: WorkerConfig): Promise<void> {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<worker>
  <worker_id>${config.workerId}</worker_id>
  <role>${config.role}</role>
  <parent_role>${config.parentRole}</parent_role>
  <paths>
    <tasks_file>${config.paths.tasksFile}</tasks_file>
    <attachments>${config.paths.attachments}</attachments>
    <output_dir>${config.paths.outputDir}</output_dir>
    <worker_root>${config.paths.workerRoot}</worker_root>
  </paths>
  <task_filter>
    <status>${config.taskFilter?.status || 'pending'}</status>
  </task_filter>
  <created_at>${config.createdAt}</created_at>
  <instructions_version>${config.instructionsVersion}</instructions_version>
</worker>
`;
    const fs = await import('fs');
    fs.writeFileSync(filePath, xmlContent, 'utf8');
  }

  /**
   * Convert JSON heartbeat to XML format (for migration)
   */
  private convertJsonHeartbeatToXml(json: WorkerHeartbeat): HeartbeatXML {
    // Map status - JSON 'unresponsive' or 'error' becomes 'idle' in XML since we track errors differently
    let status: 'idle' | 'working' | 'paused' | 'error' | 'shutting-down' = 'idle';
    if (json.status === 'working') {
      status = 'working';
    }
    
    return {
      workerId: json.workerId,
      timestamp: json.lastActivityTimestamp,
      status,
      currentTask: json.currentTask ? {
        taskId: String(json.currentTask.id),
        stageId: '1',  // Default to first stage for legacy tasks
        stageName: 'unknown',
        startedAt: json.currentTask.startedAt,
      } : undefined,
      stats: {
        tasksCompleted: 0,
        stagesProcessed: 0,
        uptimeSeconds: 0,
      },
    };
  }

  /**
   * Check if heartbeat indicates healthy worker
   */
  private isHeartbeatHealthy(heartbeat?: HeartbeatXML): boolean {
    if (!heartbeat) {
      return false;
    }

    const lastActivity = new Date(heartbeat.timestamp);
    const now = new Date();
    const timeDiff = now.getTime() - lastActivity.getTime();

    return timeDiff < UNRESPONSIVE_THRESHOLD_MS && heartbeat.status !== 'error';
  }

  /**
   * Provision a new worker
   */
  async provisionWorker(workerId?: string): Promise<WorkerInfo | null> {
    // Generate worker ID if not provided
    const id = workerId || `worker-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const workerDir = path.join(this.workersBaseDir, id);

    logger.info(`🥚 Provisioning worker ${id}`, { 
      workerDir, 
      workersBaseDir: this.workersBaseDir,
      managementDir: this.managementDir 
    });

    // Create worker directory structure
    const createdWorkerDir = ensureDir(workerDir);
    const createdOutputDir = ensureDir(path.join(workerDir, 'output'));
    const createdAdgDir = ensureDir(path.join(workerDir, '.adg-parallels', 'worker'));
    
    logger.info(`🥚 Created directories for ${id}`, { 
      createdWorkerDir, 
      createdOutputDir, 
      createdAdgDir 
    });

    // Get tasks file path from task manager (correct dynamic path)
    const tasksFilePath = this.taskManager.getFilePath();
    
    // Output goes to shared project output folder
    // Project root is the directory containing tasks.xml (managementDir)
    const projectRoot = this.managementDir;
    const sharedOutputDir = path.join(projectRoot, 'output');

    // Create worker config
    const workerConfig: WorkerConfig = {
      workerId: id,
      role: 'worker',
      parentRole: 'manager',
      paths: {
        tasksFile: tasksFilePath,
        attachments: path.join(workerDir, 'attachments'),
        outputDir: sharedOutputDir,  // Shared output folder for all workers
        workerRoot: workerDir,
      },
      taskFilter: {
        status: 'pending',
      },
      createdAt: new Date().toISOString(),
      instructionsVersion: '1.0',
    };

    // Write worker config as XML
    const configPath = path.join(workerDir, 'worker.xml');
    await this.saveWorkerConfigXml(configPath, workerConfig);

    // Create initial heartbeat (v0.3.0: XML format)
    const heartbeat: HeartbeatXML = {
      workerId: id,
      timestamp: new Date().toISOString(),
      status: 'idle',
      stats: {
        tasksCompleted: 0,
        stagesProcessed: 0,
        uptimeSeconds: 0,
      },
      systemInfo: {
        extensionVersion: '0.3.0',
      },
    };
    const heartbeatPath = path.join(workerDir, 'heartbeat.xml');
    await saveXML(heartbeatPath, heartbeat, 'heartbeat');

    // Create worker instructions
    await this.generateWorkerInstructions(workerDir, workerConfig);

    const workerInfo: WorkerInfo = {
      workerId: id,
      workerDir,
      configPath,
      heartbeatPath,  // Now .xml
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
- Update heartbeat.xml regularly to show you're alive
- If you encounter an error, update task status with lastError
- Do not modify tasks assigned to other workers
- Check for new tasks after completing each one

## Your Workspace
- Config: \`worker.xml\`
- Heartbeat: \`heartbeat.xml\` (v0.3.0)
- Output: \`output/\`

## Heartbeat Protocol (v0.3.0)
Update \`heartbeat.xml\` every 60 seconds with:
\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<heartbeat>
  <worker-id>${config.workerId}</worker-id>
  <timestamp>2024-01-15T10:30:00.000Z</timestamp>
  <status>working</status>
  <current-task>
    <task-id>1</task-id>
    <stage-id>2</stage-id>
    <stage-name>during_article_writing</stage-name>
    <started-at>2024-01-15T10:25:00.000Z</started-at>
  </current-task>
  <stats>
    <tasks-completed>5</tasks-completed>
    <stages-processed>12</stages-processed>
    <uptime-seconds>3600</uptime-seconds>
  </stats>
</heartbeat>
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
      logger.info(`🚀 Spawning worker window: ${workerInfo.workerId}`, { 
        workerDir: workerInfo.workerDir 
      });
      
      // Verify worker directory and config exist before opening
      if (!pathExists(workerInfo.workerDir)) {
        logger.error(`❌ Worker directory does not exist: ${workerInfo.workerDir}`);
        return false;
      }
      if (!pathExists(workerInfo.configPath)) {
        logger.error(`❌ Worker config does not exist: ${workerInfo.configPath}`);
        return false;
      }
      
      const uri = vscode.Uri.file(workerInfo.workerDir);
      
      // Show notification to user
      vscode.window.showInformationMessage(`🥚 Opening worker: ${workerInfo.workerId}`);
      
      // Open folder in new window
      await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
      
      // Give the new window time to fully initialize
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      logger.info(`✅ Spawned worker window: ${workerInfo.workerId}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to spawn worker: ${workerInfo.workerId}`, error);
      vscode.window.showErrorMessage(`Failed to spawn worker: ${workerInfo.workerId}`);
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
        // Larger delay between spawns to allow windows to fully initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
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
    // First check if there are any pending tasks - if not, no need to monitor
    const hasPending = await this.taskManager.hasPendingTasks();
    const isAllCompleted = await this.taskManager.isAllCompleted();
    
    if (isAllCompleted) {
      logger.info('All tasks completed, stopping health monitoring');
      this.stopHealthMonitoring();
      return;
    }
    
    const unhealthyWorkers: WorkerInfo[] = [];

    for (const [id, worker] of this.workers) {
      // Check if worker has finished flag - means it completed normally, not crashed
      const finishedFlagPath = path.join(worker.workerDir, 'finished.flag');
      const finishedFlagXmlPath = path.join(worker.workerDir, 'finished.flag.xml');
      const finishedXmlPath = path.join(worker.workerDir, 'finished.xml');
      if (pathExists(finishedFlagPath) || pathExists(finishedFlagXmlPath) || pathExists(finishedXmlPath)) {
        // Worker finished gracefully - mark as healthy and skip
        worker.isHealthy = true;
        logger.debug(`Worker ${id} has finished flag, skipping health check`);
        continue;
      }

      // Reload heartbeat from XML
      const heartbeatXmlPath = path.join(worker.workerDir, 'heartbeat.xml');
      
      if (pathExists(heartbeatXmlPath)) {
        worker.heartbeat = await loadXML<HeartbeatXML>(heartbeatXmlPath) ?? undefined;
      }

      worker.isHealthy = this.isHeartbeatHealthy(worker.heartbeat);
      worker.lastHealthCheck = new Date();

      if (!worker.isHealthy) {
        unhealthyWorkers.push(worker);
        logger.warn(`Worker ${id} is unhealthy`);
      }
    }

    // Handle unhealthy workers - but only if there's work to do
    if (hasPending && unhealthyWorkers.length > 0) {
      for (const worker of unhealthyWorkers) {
        await this.handleUnhealthyWorker(worker);
      }
    }
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      logger.info('Health monitoring stopped');
    }
  }

  /**
   * Handle an unhealthy worker
   */
  private async handleUnhealthyWorker(worker: WorkerInfo): Promise<void> {
    if (!worker.heartbeat) {
      return;
    }

    // Track consecutive failures (stored in memory, not in XML)
    const consecutiveFailures = ((worker as any)._consecutiveFailures ?? 0) + 1;
    (worker as any)._consecutiveFailures = consecutiveFailures;

    // Release any claimed tasks back to queue
    const released = await this.taskManager.releaseWorkerTasks(worker.workerId);
    if (released > 0) {
      logger.info(`Released ${released} tasks from unhealthy worker ${worker.workerId}`);
    }

    // Update heartbeat to show error status
    worker.heartbeat.status = 'error';
    await saveXML(worker.heartbeatPath, worker.heartbeat, 'heartbeat');

    // Auto-restart after 3 consecutive failures
    if (consecutiveFailures >= 3) {
      // Double-check finished flag before respawn - worker may have finished gracefully
      const finishedFlagPath = path.join(worker.workerDir, 'finished.flag');
      const finishedFlagXmlPath = path.join(worker.workerDir, 'finished.flag.xml');
      const finishedXmlPath = path.join(worker.workerDir, 'finished.xml');
      if (pathExists(finishedFlagPath) || pathExists(finishedFlagXmlPath) || pathExists(finishedXmlPath)) {
        logger.info(`Worker ${worker.workerId} has finished flag - skipping respawn`);
        (worker as any)._consecutiveFailures = 0;
        worker.isHealthy = true;
        return;
      }

      logger.warn(`Worker ${worker.workerId} failed 3+ times, attempting restart...`);
      
      // Try to respawn the worker
      const success = await this.spawnWorker(worker);
      if (success) {
        // Reset failure count on successful respawn
        (worker as any)._consecutiveFailures = 0;
        worker.heartbeat.status = 'idle';
        await saveXML(worker.heartbeatPath, worker.heartbeat, 'heartbeat');
        logger.info(`Worker ${worker.workerId} respawned successfully`);
        
        // Notify CEO via VS Code notification
        vscode.window.showWarningMessage(
          `🔄 Worker ${worker.workerId} was unresponsive and has been restarted.`
        );
      } else {
        logger.error(`Failed to respawn worker ${worker.workerId}`);
        vscode.window.showErrorMessage(
          `❌ Worker ${worker.workerId} is unresponsive and could not be restarted.`
        );
      }
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
   * Update heartbeat file (v0.3.0: XML format with stage tracking)
   */
  async updateHeartbeat(
    status?: 'idle' | 'working' | 'error' | 'paused' | 'shutting-down',
    currentTask?: { 
      taskId: string; 
      stageId: string; 
      stageName: string; 
      startedAt: string;
      progress?: string;
    }
  ): Promise<void> {
    if (!this.workerId) {
      return;
    }

    const heartbeatPath = path.join(
      this.managementDir, 
      '..', 
      'workers', 
      this.workerId, 
      'heartbeat.xml'
    );

    // Load existing stats if available
    let stats = {
      tasksCompleted: 0,
      stagesProcessed: 0,
      uptimeSeconds: 0,
    };
    
    if (pathExists(heartbeatPath)) {
      const existing = await loadXML<HeartbeatXML>(heartbeatPath);
      if (existing?.stats) {
        stats = existing.stats;
      }
    }

    const heartbeat: HeartbeatXML = {
      workerId: this.workerId,
      timestamp: new Date().toISOString(),
      status: status || 'idle',
      currentTask,
      stats,
      systemInfo: {
        extensionVersion: '0.3.0',
      },
    };

    await saveXML(heartbeatPath, heartbeat, 'heartbeat');
  }

  /**
   * Increment stats in heartbeat
   */
  async incrementHeartbeatStats(
    tasksCompleted?: number,
    stagesProcessed?: number
  ): Promise<void> {
    if (!this.workerId) {
      return;
    }

    const heartbeatPath = path.join(
      this.managementDir, 
      '..', 
      'workers', 
      this.workerId, 
      'heartbeat.xml'
    );

    const existing = await loadXML<HeartbeatXML>(heartbeatPath);
    if (!existing) {
      return;
    }

    if (!existing.stats) {
      existing.stats = { tasksCompleted: 0, stagesProcessed: 0, uptimeSeconds: 0 };
    }

    if (tasksCompleted) {
      existing.stats.tasksCompleted += tasksCompleted;
    }
    if (stagesProcessed) {
      existing.stats.stagesProcessed += stagesProcessed;
    }

    await saveXML(heartbeatPath, existing, 'heartbeat');
  }

  /**
   * Report error in heartbeat
   */
  reportError(error: string): void {
    this.updateHeartbeat('error');
    logger.error(`Worker ${this.workerId} error: ${error}`);
  }

  /**
   * Signal task start (legacy - for compatibility)
   */
  signalTaskStart(task: Task): void {
    this.updateHeartbeat('working', {
      taskId: String(task.id),
      stageId: '1',
      stageName: 'processing',
      startedAt: new Date().toISOString(),
    });
  }

  /**
   * Signal stage start (v0.3.0 - with stage tracking)
   */
  signalStageStart(taskId: string, stageId: string, stageName: string): void {
    this.updateHeartbeat('working', {
      taskId,
      stageId,
      stageName,
      startedAt: new Date().toISOString(),
    });
  }

  /**
   * Signal stage completion
   */
  async signalStageComplete(): Promise<void> {
    await this.incrementHeartbeatStats(0, 1);
    await this.updateHeartbeat('idle');
  }

  /**
   * Signal task completion
   */
  async signalTaskComplete(): Promise<void> {
    await this.incrementHeartbeatStats(1, 0);
    await this.updateHeartbeat('idle');
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
