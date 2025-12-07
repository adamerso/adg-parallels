/**
 * ADG-Parallels Type Definitions
 * 
 * Core types used throughout the extension.
 */

// =============================================================================
// ROLES
// =============================================================================

/**
 * Roles in the ADG-Parallels hierarchy
 */
export type Role = 'ceo' | 'manager' | 'teamlead' | 'worker';

/**
 * Role detection result with metadata
 */
export interface RoleInfo {
  role: Role;
  hasManagement: boolean;
  hasWorker: boolean;
  workerId?: string;
  depth: number;
  paths: RolePaths;
}

/**
 * Paths relevant to the current role
 */
export interface RolePaths {
  workspaceRoot: string;
  adgRoot: string;           // .adg-parallels/
  managementDir?: string;    // .adg-parallels/management/
  workerDir?: string;        // .adg-parallels/worker/
  jobsDir?: string;          // .adg-parallels/jobs/
  adaptersDir?: string;      // .adg-parallels/adapters/
}

// =============================================================================
// TASKS
// =============================================================================

/**
 * Task status in the workflow
 */
export type TaskStatus = 
  | 'pending'
  | 'processing'
  | 'task_completed'
  | 'audit_in_progress'
  | 'audit_failed'
  | 'audit_passed';

/**
 * A single task in the task queue
 */
export interface Task {
  id: number;
  type: string;              // Adapter type (e.g., 'article-generation')
  title: string;
  description?: string;
  status: TaskStatus;
  
  // Assignment
  assignedWorker?: string;
  startedAt?: string;        // ISO timestamp
  completedAt?: string;      // ISO timestamp
  
  // Output
  outputFile?: string;
  
  // Retry handling
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  
  // Custom parameters for adapter
  params?: Record<string, unknown>;
}

/**
 * Project task file structure
 */
export interface ProjectTasks {
  projectCodename: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  
  config: ProjectConfig;
  
  globalStatus: 'not_started' | 'in_progress' | 'all_disposed' | 'completed';
  
  stats: TaskStats;
  
  tasks: Task[];
}

/**
 * Project configuration
 */
export interface ProjectConfig {
  workerCount: number;
  model?: string;
  
  statuses: TaskStatus[];
  completedStatuses: TaskStatus[];
  failedStatuses: TaskStatus[];
  retryOnFailed: boolean;
  
  outputPattern: string;     // e.g., "output/{job_id}_{title_slug}.md"
}

/**
 * Task statistics
 */
export interface TaskStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

// =============================================================================
// HIERARCHY
// =============================================================================

/**
 * Hierarchy configuration and limits
 */
export interface HierarchyConfig {
  maxDepth: number;
  currentDepth: number;
  
  levelConfig: LevelConfig[];
  
  healthMonitoring: HealthMonitoringConfig;
  
  adapters: AdaptersConfig;
  
  emergencyBrake: EmergencyBrakeConfig;
}

/**
 * Configuration for each hierarchy level
 */
export interface LevelConfig {
  level: number;
  role: Role;
  canDelegate: boolean;
  maxSubordinates: number;
  subordinateRole: Role | null;
  model?: string;
}

/**
 * Health monitoring configuration
 */
export interface HealthMonitoringConfig {
  enabled: boolean;
  heartbeatIntervalSeconds: number;
  unresponsiveThresholdSeconds: number;
  maxConsecutiveFailures: number;
  autoRestart: boolean;
  alertCeoOnFaulty: boolean;
}

/**
 * Adapters configuration
 */
export interface AdaptersConfig {
  path: string;
  defaultAdapter: string;
  availableAdapters: string[];
}

/**
 * Emergency brake configuration
 */
export interface EmergencyBrakeConfig {
  maxTotalInstances: number;
  maxTasksPerWorker: number;
  timeoutMinutes: number;
}

// =============================================================================
// WORKER
// =============================================================================

/**
 * Worker configuration file structure
 */
export interface WorkerConfig {
  workerId: string;
  role: Role;
  parentRole: Role;
  
  paths: {
    tasksFile: string;
    attachments: string;
    outputDir: string;
    workerRoot: string;
  };
  
  model?: string;
  
  taskFilter?: {
    status: TaskStatus;
    category?: string;
  };
  
  createdAt: string;
  instructionsVersion: string;
}

/**
 * Worker heartbeat structure
 */
export interface WorkerHeartbeat {
  workerId: string;
  lastActivityTimestamp: string;  // ISO timestamp
  currentTask?: {
    id: number;
    title: string;
    startedAt: string;
  };
  status: 'idle' | 'working' | 'error' | 'unresponsive';
  windowPid?: number;
  consecutiveFailures: number;
}

// =============================================================================
// ADAPTERS
// =============================================================================

/**
 * Task adapter definition
 */
export interface TaskAdapter {
  adapterId: string;
  version: string;
  displayName: string;
  
  prompts: {
    taskStart: string;
    taskContinue: string;
    auditPrompt?: string;
  };
  
  completionCriteria: {
    requiredOutputFiles?: string[];
    minOutputLength?: number;
    validationRegex?: string;
  };
  
  outputProcessing: {
    saveAs: string;
    postProcess?: string[];
  };
  
  statusFlow: TaskStatus[];
  retryableStatuses: TaskStatus[];
  maxRetries: number;
  
  isMeta?: boolean;
  createsSubtasks?: boolean;
  requiresManagerRole?: boolean;
}
