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
  
  // Subtask support (for task-splitter)
  parentTaskId?: number;     // ID of parent mega-task
  subtaskIds?: number[];     // IDs of child subtasks (if this is a mega-task)
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

// =============================================================================
// v0.3.0 - PIPELINE ADAPTER SYSTEM (XML-based)
// =============================================================================

/**
 * Pipeline stage definition (from XML adapter)
 */
export interface PipelineStage {
  id: string;                       // String for XML compatibility
  name: string;                     // e.g., "during_article_writing"
  
  // Stage type flags
  isAudit?: boolean;
  isTerminal?: boolean;
  
  // Task configuration
  allowedTaskTypes?: string[];      // e.g., ["generation", "review", "CUSTOM"]
  taskType?: string;                // Selected type from allowed list
  customTaskTypeDescription?: string;
  
  // Core execution
  taskToFulfill: string;            // Descriptive instructions (NOT template!)
  executor?: string;                // Model name: "gpt-4o", "claude-sonnet"
  
  // I/O
  input?: StageInput[];
  output?: StageOutput;
  
  // Completion
  completionDetection?: CompletionDetection;
  
  // Routing
  nextStage?: StageRouting;
  
  // Audit specific
  forbiddenPatterns?: ForbiddenPattern[];
  auditResult?: AuditResultConfig;
}

/**
 * Stage input reference
 */
export interface StageInput {
  name: string;                     // e.g., "task-definition"
  sourceStage: string;              // "initial" or stage name
  description: string;              // Human-readable description
}

/**
 * Stage output configuration
 */
export interface StageOutput {
  instructions: string;             // Descriptive output format instructions
}

/**
 * Completion detection configuration
 */
export interface CompletionDetection {
  method: 'natural-end' | 'signal' | 'length';
  minLength?: number;
  fallbackSignal?: string;
}

/**
 * Stage routing configuration
 */
export interface StageRouting {
  routing: string;                  // e.g., "Po zakończeniu → awaiting_audit"
  // Future: parsed conditions for complex routing
}

/**
 * Forbidden pattern for audit stages
 */
export interface ForbiddenPattern {
  pattern: string;
  reason: string;
}

/**
 * Audit result configuration
 */
export interface AuditResultConfig {
  passCriteria: string;             // e.g., "Ocena ≥ 7 AND brak forbidden patterns"
  onPass: {
    routing: string;
  };
  onFail: {
    routing: string;
    feedbackToStage?: string;
  };
}

/**
 * Pipeline adapter (v0.3.0 XML format)
 */
export interface PipelineAdapter {
  // Metadata
  id: string;
  name: string;
  version: string;
  description: string;
  
  // Type
  allowedAdapterTypes: string[];    // ["normal", "meta", "audit", "CUSTOM"]
  adapterType: string;
  
  // Output format
  allowedOutputFormats: string[];   // ["markdown", "json", "text", "CUSTOM"]
  outputFormat: string;
  
  // Pipeline definition
  pipeline: PipelineStage[];
  
  // Output configuration
  outputConfig: {
    saveLocation: string;
    fileExtension: string;
    filenamePattern: {
      instructions: string;
    };
  };
  
  // Retry configuration
  retryConfig?: {
    maxRetries: number;
    retryOnFail: boolean;
    backoffStrategy?: 'linear' | 'exponential';
  };
}

// =============================================================================
// v0.3.0 - TASK WITH STAGE TRACKING
// =============================================================================

/**
 * Stage history entry for task tracking
 */
export interface StageHistoryEntry {
  stageId: string;                  // String for XML compatibility
  stageName: string;
  workerId?: string;
  executor?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  result?: 'completed' | 'failed' | 'skipped';
  outputPath?: string;
}

/**
 * Audit result record
 */
export interface AuditResultRecord {
  stageId: string;                  // String for XML compatibility
  stageName: string;
  passed: boolean;
  score?: number;
  feedback?: string;
  forbiddenPatterns: string[];
  routedTo: string;
}

/**
 * Task with pipeline stage tracking (v0.3.0)
 */
export interface PipelineTask {
  id: number;                       // Keep as number for legacy compatibility
  type: string;                     // Adapter ID
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: number;
  
  // Pipeline stage (v0.3.0)
  currentStageId: string;
  currentStageName?: string;
  stageHistory: StageHistoryEntry[];
  
  // Assignment
  assignedWorker?: string;
  startedAt?: string;
  
  // Completion
  completedAt?: string;
  outputFile?: string;
  stageOutputs: Record<string, string>;  // stageId → output content
  
  // Retry logic
  retryCount: number;
  stageRetryCount?: number;
  maxRetries: number;
  lastError?: string;
  
  // Params
  params?: Record<string, unknown>;
  
  // Hierarchy
  parentTaskId?: number;
  subtaskIds?: number[];
  
  // Audit
  auditResults?: AuditResultRecord[];
  auditFeedback?: string;           // Feedback from failed audit for retry
  forbiddenPatternsFound?: string[];
}

/**
 * Tasks file structure (v0.3.0 XML)
 */
export interface PipelineTasksFile {
  projectCodename: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  
  config: {
    defaultAdapter: string;
    heartbeatInterval: number;
  };
  
  tasks: PipelineTask[];
}

// =============================================================================
// v0.3.0 - XML HIERARCHY CONFIG
// =============================================================================

/**
 * Hierarchy configuration (v0.3.0 XML format)
 */
export interface HierarchyConfigXML {
  limits: {
    maxDepth: number;               // default: 5
    maxSubordinates: number;        // default: 50
    emergencyBrake: number;         // default: 100
  };
  
  timing: {
    heartbeatInterval: number;      // ms, default: 60000
    healthCheckInterval: number;    // ms, default: 15000
    unresponsiveThreshold: number;  // ms, default: 120000
    autoCloseDelay: number;         // ms, default: 5000
  };
  
  workerSettings: {
    autoClose: boolean;
    maxRetries: number;
    retryBackoff: 'linear' | 'exponential';
  };
}

// =============================================================================
// v0.3.0 - HEARTBEAT (XML)
// =============================================================================

/**
 * Heartbeat current task info (v0.3.0)
 */
export interface HeartbeatCurrentTask {
  taskId: string;
  stageId: string;
  stageName: string;
  startedAt: string;
  progress?: string;
}

/**
 * Worker heartbeat stats (v0.3.0)
 */
export interface HeartbeatStats {
  tasksCompleted: number;
  stagesProcessed: number;
  uptimeSeconds: number;
  avgStageDurationMs?: number;
}

/**
 * System info in heartbeat (v0.3.0)
 */
export interface HeartbeatSystemInfo {
  extensionVersion: string;
  vscodeVersion?: string;
  os?: string;
}

/**
 * Worker heartbeat (v0.3.0 XML format)
 */
export interface HeartbeatXML {
  workerId: string;
  timestamp: string;
  status: 'idle' | 'working' | 'paused' | 'error' | 'shutting-down';
  currentTask?: HeartbeatCurrentTask;
  stats?: HeartbeatStats;
  systemInfo?: HeartbeatSystemInfo;
  lastError?: string;
}

/**
 * Finished flag (v0.3.0 XML format)
 */
export interface FinishedFlagXML {
  workerId: string;
  finishedAt: string;
  reason: 'no_more_tasks' | 'all_completed' | 'error';
  tasksCompleted: number;
  stagesExecuted: number;
  lastTaskId?: string;
  lastStageName?: string;
}

// =============================================================================
// v0.3.0 - MODEL RESOLUTION
// =============================================================================

/**
 * Model resolution info
 */
export interface ModelInfo {
  name: string;                     // e.g., "gpt-4o"
  vendor: string;                   // e.g., "copilot"
  family: string;                   // e.g., "gpt-4o"
  available: boolean;
}

/**
 * Stage execution result
 */
export interface StageExecutionResult {
  success: boolean;
  output: string;
  durationMs: number;               // Duration in milliseconds
  nextStageId?: string;             // String for XML compatibility
  nextStageName?: string;
  error?: string;
  forbiddenPatternsFound?: string[];
  auditPassed?: boolean;
}
