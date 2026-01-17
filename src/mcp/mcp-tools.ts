/**
 * MCP Tool Definitions for ADG-Parallels
 * 
 * Each tool follows MCP specification with:
 * - name: Unique identifier
 * - description: What the tool does
 * - inputSchema: JSON Schema for parameters
 * - handler: Function executing the tool
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RuntimeDatabase, getRuntimeDatabase, resetRuntimeDatabase, TaskStatus, WorkerStatus } from '../core/runtime-database';

// =============================================================================
// TYPES
// =============================================================================

export interface McpToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'adg_status',
    description: 'Get current ADG-Parallels project status including active workers, pending tasks, and overall progress. Use this to understand the current state before taking any action.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder (root of the ADG project). If not provided, tries to auto-detect from workspace.',
        },
      },
    },
  },
  {
    name: 'adg_list_tasks',
    description: 'List all tasks in the project with their current status. Optionally filter by status or layer.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder.',
        },
        status: {
          type: 'string',
          description: 'Filter by task status.',
          enum: ['UNASSIGNED', 'PROCESSING', 'DONE', 'FAILED'],
        },
        layer: {
          type: 'number',
          description: 'Filter by layer number (0 = CEO, 1 = first subordinate level, etc.).',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return. Default: 50.',
        },
      },
    },
  },
  {
    name: 'adg_claim_task',
    description: 'Atomically claim the next available task for a worker. Returns the task details if successful, null if no tasks available.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder.',
        },
        workerUid: {
          type: 'string',
          description: 'Unique identifier of the worker claiming the task.',
        },
        layer: {
          type: 'number',
          description: 'Optional: Only claim tasks from specific layer.',
        },
      },
      required: ['workerUid'],
    },
  },
  {
    name: 'adg_complete_task',
    description: 'Mark a task as successfully completed. Provide the task ID and optionally the path to the result file.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder.',
        },
        taskId: {
          type: 'number',
          description: 'ID of the task to complete.',
        },
        resultPath: {
          type: 'string',
          description: 'Optional: Path to the result/output file.',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'adg_fail_task',
    description: 'Mark a task as failed with an error message.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder.',
        },
        taskId: {
          type: 'number',
          description: 'ID of the task that failed.',
        },
        errorMessage: {
          type: 'string',
          description: 'Description of why the task failed.',
        },
      },
      required: ['taskId', 'errorMessage'],
    },
  },
  {
    name: 'adg_worker_heartbeat',
    description: 'Send a heartbeat signal for a worker to indicate it is still alive and processing.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder.',
        },
        workerUid: {
          type: 'string',
          description: 'Unique identifier of the worker.',
        },
      },
      required: ['workerUid'],
    },
  },
  {
    name: 'adg_get_dashboard',
    description: 'Get comprehensive dashboard statistics including worker counts by status, task progress, slot usage, and any unresponsive workers.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder.',
        },
      },
    },
  },
  {
    name: 'adg_list_workers',
    description: 'List all workers in the project hierarchy with their current status, role, and task counts.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder.',
        },
        status: {
          type: 'string',
          description: 'Filter by worker status.',
          enum: ['QUEUED', 'SLOT_ASSIGNED', 'IDLE', 'WORKING', 'AWAITING_SUBORDINATES', 'DONE', 'ERROR', 'SHUTDOWN'],
        },
        parentUid: {
          type: 'string',
          description: 'Filter to show only children of a specific worker.',
        },
      },
    },
  },
  {
    name: 'adg_get_events',
    description: 'Get recent events from the audit log. Useful for debugging and understanding what happened.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder.',
        },
        workerUid: {
          type: 'string',
          description: 'Optional: Filter events for a specific worker.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return. Default: 50.',
        },
      },
    },
  },
  {
    name: 'adg_register_worker',
    description: 'Register a new worker in the project. Used when spawning new worker instances.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder.',
        },
        uid: {
          type: 'string',
          description: 'Unique identifier for the worker.',
        },
        folderName: {
          type: 'string',
          description: 'Name of the worker folder (e.g., .adg-parallels_CEO_4_1_00001).',
        },
        folderPath: {
          type: 'string',
          description: 'Full path to the worker folder.',
        },
        role: {
          type: 'string',
          description: 'Role of the worker (e.g., CEO, STRATOP, DELIVCO).',
        },
        layer: {
          type: 'number',
          description: 'Layer number in the hierarchy (0 = CEO).',
        },
        parentUid: {
          type: 'string',
          description: 'UID of the parent worker (null for CEO).',
        },
      },
      required: ['uid', 'folderName', 'folderPath', 'role', 'layer'],
    },
  },
  {
    name: 'adg_update_worker_status',
    description: 'Update the status of a worker.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder.',
        },
        workerUid: {
          type: 'string',
          description: 'Unique identifier of the worker.',
        },
        status: {
          type: 'string',
          description: 'New status for the worker.',
          enum: ['QUEUED', 'SLOT_ASSIGNED', 'IDLE', 'WORKING', 'AWAITING_SUBORDINATES', 'DONE', 'ERROR', 'SHUTDOWN'],
        },
        errorMessage: {
          type: 'string',
          description: 'Error message if status is ERROR.',
        },
      },
      required: ['workerUid', 'status'],
    },
  },
  {
    name: 'adg_create_tasks',
    description: 'Create new tasks in bulk. Tasks will be available for workers to claim.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder.',
        },
        layer: {
          type: 'number',
          description: 'Layer number for the tasks.',
        },
        payloads: {
          type: 'string',
          description: 'JSON array of task payloads (strings). Example: ["task1", "task2", "task3"]',
        },
      },
      required: ['layer', 'payloads'],
    },
  },
  {
    name: 'adg_init_project',
    description: 'Initialize the SQLite runtime database for a new project. Must be called before other operations.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder where runtime.db will be created.',
        },
        maxSlots: {
          type: 'number',
          description: 'Maximum number of concurrent worker slots. Default: 4.',
        },
        projectName: {
          type: 'string',
          description: 'Name of the project for metadata.',
        },
      },
      required: ['ceoPath'],
    },
  },
  // =========================================================================
  // DEVELOPMENT / SELF-MANAGEMENT TOOLS
  // =========================================================================
  {
    name: 'adg_install_vsix',
    description: 'Install or update the ADG-Parallels extension from a VSIX file. Use this to deploy new versions of the extension during development.',
    inputSchema: {
      type: 'object',
      properties: {
        vsixPath: {
          type: 'string',
          description: 'Path to the VSIX file to install. If not provided, will look for the most recent .vsix file in the project root.',
        },
        force: {
          type: 'boolean',
          description: 'Force reinstall even if the same version is already installed.',
        },
      },
    },
  },
  {
    name: 'adg_reload_window',
    description: 'Reload the VS Code window to apply extension updates or reset state. Use after installing a new VSIX.',
    inputSchema: {
      type: 'object',
      properties: {
        delay: {
          type: 'number',
          description: 'Delay in milliseconds before reloading. Default: 1000.',
        },
      },
    },
  },
  {
    name: 'adg_build_extension',
    description: 'Build the ADG-Parallels extension. Compiles TypeScript and optionally packages VSIX.',
    inputSchema: {
      type: 'object',
      properties: {
        packageVsix: {
          type: 'boolean',
          description: 'Also package a VSIX file after compilation. Default: false.',
        },
        projectPath: {
          type: 'string',
          description: 'Path to the extension project. Auto-detected if not provided.',
        },
      },
    },
  },
  {
    name: 'adg_spawn_worker_window',
    description: 'Spawn a new VS Code window for a worker. Opens a new VS Code instance with the worker folder.',
    inputSchema: {
      type: 'object',
      properties: {
        workerFolderPath: {
          type: 'string',
          description: 'Absolute path to the worker folder to open.',
        },
      },
      required: ['workerFolderPath'],
    },
  },
  // =========================================================================
  // WORKER PROVISIONING - Create and spawn new workers
  // =========================================================================
  {
    name: 'adg_provision_worker',
    description: 'Create a new worker folder with all necessary configuration files, register it in the database, and optionally spawn a VS Code window for it. This is the main tool for delegating work to new Ejajka workers.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder. Auto-detected if not provided.',
        },
        role: {
          type: 'string',
          description: 'Role for the worker. Default: STRATOP for layer 1, DELIVCO for deeper layers.',
          enum: ['CEO', 'STRATOP', 'DELIVCO', 'EXESUPP'],
        },
        layer: {
          type: 'number',
          description: 'Hierarchy layer (1 = direct subordinate of CEO). Required.',
        },
        parentUid: {
          type: 'string',
          description: 'UID of parent worker. For layer 1, this is usually the CEO UID.',
        },
        taskInstructions: {
          type: 'string',
          description: 'Optional: Custom instructions to include in the worker copilot-instructions.md file.',
        },
        autoSpawn: {
          type: 'boolean',
          description: 'Whether to automatically spawn a VS Code window for this worker. Default: true.',
        },
      },
      required: ['layer'],
    },
  },
];

// =============================================================================
// TOOL HANDLERS
// =============================================================================

/**
 * Get database instance, auto-detecting CEO path if not provided
 */
function getDb(ceoPath?: string): RuntimeDatabase | null {
  const resolvedPath = ceoPath || detectCeoPath();
  if (!resolvedPath) {
    return null;
  }
  return getRuntimeDatabase(resolvedPath);
}

/**
 * Try to auto-detect CEO folder from workspace
 * Searches:
 * 1. If workspace folder IS the CEO folder
 * 2. If workspace contains a CEO folder
 * 3. If workspace is INSIDE a CEO folder (worker scenario)
 */
function detectCeoPath(): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  // Look for .adg-parallels_CEO_* folder
  for (const folder of workspaceFolders) {
    const folderPath = folder.uri.fsPath;
    
    // Check if this IS a CEO folder
    if (path.basename(folderPath).startsWith('.adg-parallels_CEO_')) {
      return folderPath;
    }
    
    // Check for CEO folder inside
    try {
      const entries = fs.readdirSync(folderPath);
      for (const entry of entries) {
        if (entry.startsWith('.adg-parallels_CEO_')) {
          return path.join(folderPath, entry);
        }
      }
    } catch {
      // Ignore read errors
    }
    
    // NEW: Check if we're INSIDE a CEO folder (worker scenario)
    // Walk up the directory tree looking for a CEO folder
    let currentPath = folderPath;
    for (let i = 0; i < 10; i++) { // Max 10 levels up
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) break; // Reached root
      
      const parentName = path.basename(parentPath);
      if (parentName.startsWith('.adg-parallels_CEO_')) {
        return parentPath;
      }
      currentPath = parentPath;
    }
  }
  
  return null;
}

/**
 * Execute an MCP tool by name
 */
export async function executeTool(name: string, args: Record<string, any>): Promise<McpToolResult> {
  try {
    switch (name) {
      case 'adg_status':
        return handleStatus(args);
      
      case 'adg_list_tasks':
        return handleListTasks(args);
      
      case 'adg_claim_task':
        return handleClaimTask(args);
      
      case 'adg_complete_task':
        return handleCompleteTask(args);
      
      case 'adg_fail_task':
        return handleFailTask(args);
      
      case 'adg_worker_heartbeat':
        return handleHeartbeat(args);
      
      case 'adg_get_dashboard':
        return handleGetDashboard(args);
      
      case 'adg_list_workers':
        return handleListWorkers(args);
      
      case 'adg_get_events':
        return handleGetEvents(args);
      
      case 'adg_register_worker':
        return handleRegisterWorker(args);
      
      case 'adg_update_worker_status':
        return handleUpdateWorkerStatus(args);
      
      case 'adg_create_tasks':
        return handleCreateTasks(args);
      
      case 'adg_init_project':
        return handleInitProject(args);
      
      case 'adg_install_vsix':
        return handleInstallVsix(args);
      
      case 'adg_reload_window':
        return handleReloadWindow(args);
      
      case 'adg_build_extension':
        return handleBuildExtension(args);
      
      case 'adg_spawn_worker_window':
        return handleSpawnWorkerWindow(args);
      
      case 'adg_provision_worker':
        return handleProvisionWorker(args);
      
      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// =============================================================================
// HANDLER IMPLEMENTATIONS
// =============================================================================

function handleStatus(args: Record<string, any>): McpToolResult {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found. Provide ceoPath or open a workspace with an ADG project.' };
  }

  const stats = db.getDashboardStats();
  const meta = db.getAllProjectMeta();
  
  return {
    success: true,
    data: {
      project: meta,
      workers: {
        total: stats.total_workers,
        byStatus: stats.workers_by_status,
        unresponsive: stats.unresponsive_workers,
      },
      tasks: {
        total: stats.total_tasks,
        pending: stats.tasks_pending,
        processing: stats.tasks_processing,
        done: stats.tasks_done,
        failed: stats.tasks_failed,
        progressPercent: stats.total_tasks > 0 
          ? Math.round((stats.tasks_done / stats.total_tasks) * 100) 
          : 0,
      },
      slots: {
        used: stats.slots_used,
        total: stats.slots_total,
      },
    },
  };
}

function handleListTasks(args: Record<string, any>): McpToolResult {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found.' };
  }

  let tasks = db.getAllTasks();
  
  // Filter by status
  if (args.status) {
    tasks = tasks.filter(t => t.status === args.status);
  }
  
  // Filter by layer
  if (args.layer !== undefined) {
    tasks = tasks.filter(t => t.layer === args.layer);
  }
  
  // Limit results
  const limit = args.limit || 50;
  tasks = tasks.slice(0, limit);
  
  return { success: true, data: tasks };
}

function handleClaimTask(args: Record<string, any>): McpToolResult {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found.' };
  }

  if (!args.workerUid) {
    return { success: false, error: 'workerUid is required.' };
  }

  const task = db.claimTask(args.workerUid, args.layer);
  
  if (task) {
    return { success: true, data: task };
  } else {
    return { success: true, data: null, error: 'No tasks available to claim.' };
  }
}

function handleCompleteTask(args: Record<string, any>): McpToolResult {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found.' };
  }

  if (!args.taskId) {
    return { success: false, error: 'taskId is required.' };
  }

  db.completeTask(args.taskId, args.resultPath);
  
  return { success: true, data: { taskId: args.taskId, status: 'DONE' } };
}

function handleFailTask(args: Record<string, any>): McpToolResult {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found.' };
  }

  if (!args.taskId || !args.errorMessage) {
    return { success: false, error: 'taskId and errorMessage are required.' };
  }

  db.failTask(args.taskId, args.errorMessage);
  
  return { success: true, data: { taskId: args.taskId, status: 'FAILED' } };
}

function handleHeartbeat(args: Record<string, any>): McpToolResult {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found.' };
  }

  if (!args.workerUid) {
    return { success: false, error: 'workerUid is required.' };
  }

  db.heartbeat(args.workerUid);
  
  return { success: true, data: { workerUid: args.workerUid, heartbeatSent: true } };
}

function handleGetDashboard(args: Record<string, any>): McpToolResult {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found.' };
  }

  const stats = db.getDashboardStats();
  
  return { success: true, data: stats };
}

function handleListWorkers(args: Record<string, any>): McpToolResult {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found.' };
  }

  let workers;
  
  if (args.status) {
    workers = db.getWorkersByStatus(args.status as WorkerStatus);
  } else if (args.parentUid) {
    workers = db.getChildren(args.parentUid);
  } else {
    workers = db.getAllWorkers();
  }
  
  return { success: true, data: workers };
}

function handleGetEvents(args: Record<string, any>): McpToolResult {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found.' };
  }

  const limit = args.limit || 50;
  
  let events;
  if (args.workerUid) {
    events = db.getWorkerEvents(args.workerUid, limit);
  } else {
    events = db.getRecentEvents(limit);
  }
  
  return { success: true, data: events };
}

function handleRegisterWorker(args: Record<string, any>): McpToolResult {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found.' };
  }

  const required = ['uid', 'folderName', 'folderPath', 'role', 'layer'];
  for (const field of required) {
    if (args[field] === undefined) {
      return { success: false, error: `${field} is required.` };
    }
  }

  db.registerWorker(
    args.uid,
    args.folderName,
    args.folderPath,
    args.role,
    args.layer,
    args.parentUid
  );
  
  return { success: true, data: { uid: args.uid, registered: true } };
}

function handleUpdateWorkerStatus(args: Record<string, any>): McpToolResult {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found.' };
  }

  if (!args.workerUid || !args.status) {
    return { success: false, error: 'workerUid and status are required.' };
  }

  db.updateWorkerStatus(args.workerUid, args.status as WorkerStatus, args.errorMessage);
  
  return { success: true, data: { workerUid: args.workerUid, status: args.status } };
}

function handleCreateTasks(args: Record<string, any>): McpToolResult {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found.' };
  }

  if (args.layer === undefined || !args.payloads) {
    return { success: false, error: 'layer and payloads are required.' };
  }

  let payloads: string[];
  try {
    payloads = JSON.parse(args.payloads);
  } catch {
    return { success: false, error: 'payloads must be a valid JSON array of strings.' };
  }

  const ids = db.createTasks(args.layer, payloads);
  
  return { success: true, data: { created: ids.length, taskIds: ids } };
}

async function handleInitProject(args: Record<string, any>): Promise<McpToolResult> {
  if (!args.ceoPath) {
    return { success: false, error: 'ceoPath is required.' };
  }

  // Ensure directory exists
  if (!fs.existsSync(args.ceoPath)) {
    fs.mkdirSync(args.ceoPath, { recursive: true });
  }

  const db = getRuntimeDatabase(args.ceoPath);
  await db.init();
  
  // Initialize slots
  const maxSlots = args.maxSlots || 4;
  db.initSlots(maxSlots);
  
  // Set project metadata
  if (args.projectName) {
    db.setProjectMeta('name', args.projectName);
  }
  db.setProjectMeta('created_at', Math.floor(Date.now() / 1000).toString());
  
  db.logEvent('PROJECT_STARTED', null, null, args.projectName || 'New Project');
  
  return { 
    success: true, 
    data: { 
      ceoPath: args.ceoPath, 
      dbPath: db.getPath(),
      maxSlots,
      initialized: true,
    },
  };
}

// =============================================================================
// DEVELOPMENT / SELF-MANAGEMENT HANDLERS
// =============================================================================

/**
 * Locate VS Code CLI executable path
 * 
 * Searches in order:
 * 1. PATH environment variable (code/code-insiders)
 * 2. Portable installation (relative to VS Code install dir)
 * 3. Standard installation paths
 */
function getVsCodeCliPath(): string {
  const { execSync } = require('child_process');
  const appName = vscode.env.appName.toLowerCase();
  const isInsiders = appName.includes('insider');
  const cliName = isInsiders ? 'code-insiders' : 'code';
  
  // Method 1: Try PATH first (works if shell integration is set up)
  try {
    const whereCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${whereCmd} ${cliName}`, { encoding: 'utf8', timeout: 5000, windowsHide: true });
    if (result.trim()) {
      return cliName; // Found in PATH
    }
  } catch {
    // Not in PATH, continue searching
  }
  
  // Method 2: Derive from VS Code's appRoot (works for portable installs)
  // vscode.env.appRoot gives us something like D:\path\to\vscode\resources\app
  try {
    const appRoot = vscode.env.appRoot;
    if (appRoot) {
      // Go up from resources/app to find bin folder
      const vscodePath = path.dirname(path.dirname(appRoot));
      const cliPath = path.join(vscodePath, 'bin', `${cliName}.cmd`);
      if (fs.existsSync(cliPath)) {
        return `"${cliPath}"`;
      }
      // Also try without .cmd extension (Linux/macOS)
      const cliPathUnix = path.join(vscodePath, 'bin', cliName);
      if (fs.existsSync(cliPathUnix)) {
        return `"${cliPathUnix}"`;
      }
    }
  } catch {
    // Continue to fallbacks
  }
  
  // Method 3: Standard installation paths
  const standardPaths = process.platform === 'win32' ? [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', isInsiders ? 'Microsoft VS Code Insiders' : 'Microsoft VS Code', 'bin', `${cliName}.cmd`),
    path.join(process.env.PROGRAMFILES || '', isInsiders ? 'Microsoft VS Code Insiders' : 'Microsoft VS Code', 'bin', `${cliName}.cmd`),
  ] : [
    `/usr/local/bin/${cliName}`,
    `/usr/bin/${cliName}`,
    path.join(process.env.HOME || '', '.local', 'bin', cliName),
  ];
  
  for (const p of standardPaths) {
    if (fs.existsSync(p)) {
      return `"${p}"`;
    }
  }
  
  // Fallback: just use the name and hope for the best
  return cliName;
}

/**
 * Install VSIX extension package
 */
async function handleInstallVsix(args: Record<string, any>): Promise<McpToolResult> {
  const { execSync } = await import('child_process');
  
  let vsixPath = args.vsixPath;
  
  // Auto-detect VSIX if not provided
  if (!vsixPath) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { success: false, error: 'No workspace folder found. Provide vsixPath explicitly.' };
    }
    
    const projectRoot = workspaceFolders[0].uri.fsPath;
    
    // Find most recent .vsix file
    try {
      const files = fs.readdirSync(projectRoot);
      const vsixFiles = files.filter(f => f.endsWith('.vsix'));
      
      if (vsixFiles.length === 0) {
        return { success: false, error: 'No VSIX files found in project root. Run adg_build_extension first with packageVsix=true.' };
      }
      
      // Get most recent by modification time
      const vsixStats = vsixFiles.map(f => ({
        name: f,
        path: path.join(projectRoot, f),
        mtime: fs.statSync(path.join(projectRoot, f)).mtime.getTime(),
      }));
      
      vsixStats.sort((a, b) => b.mtime - a.mtime);
      vsixPath = vsixStats[0].path;
    } catch (error: any) {
      return { success: false, error: `Failed to scan for VSIX files: ${error.message}` };
    }
  }
  
  if (!fs.existsSync(vsixPath)) {
    return { success: false, error: `VSIX file not found: ${vsixPath}` };
  }
  
  try {
    // Use VS Code CLI to install extension
    const cliPath = getVsCodeCliPath();
    const forceFlag = args.force ? '--force' : '';
    execSync(`${cliPath} --install-extension "${vsixPath}" ${forceFlag}`, {
      encoding: 'utf8',
      timeout: 60000,
    });
    
    return { 
      success: true, 
      data: { 
        vsixPath, 
        installed: true,
        cliUsed: cliPath,
        message: 'Extension installed successfully. ⚠️ IMPORTANT: Window reload is needed to apply changes. Please reload the window manually (Ctrl+Shift+P -> "Developer: Reload Window") as automatic reload breaks the chat session.',
      },
    };
  } catch (error: any) {
    return { success: false, error: `Failed to install VSIX: ${error.message}` };
  }
}

/**
 * Reload VS Code window
 * 
 * WARNING: This breaks the current chat session permanently!
 * The tool now does NOT auto-reload, but instructs the user to do it manually.
 */
async function handleReloadWindow(args: Record<string, any>): Promise<McpToolResult> {
  // DO NOT AUTO-RELOAD - it breaks the chat session permanently
  // Instead, return instructions for manual reload
  
  return { 
    success: true, 
    data: { 
      autoReloadDisabled: true,
      reason: 'Auto-reload breaks the current chat session permanently.',
      instructions: [
        '⚠️ RELOAD REQUIRED - but DO NOT use auto-reload!',
        '',
        'Please reload the window MANUALLY using one of these methods:',
        '  1. Press Ctrl+Shift+P and type "Developer: Reload Window"',
        '  2. Press Ctrl+R (if keyboard shortcut is set)',
        '',
        'After reload, you will need to start a NEW chat session.',
        'The current chat will become unresponsive after reload.',
      ].join('\n'),
    },
  };
}

/**
 * Build the extension (compile + optionally package VSIX)
 */
async function handleBuildExtension(args: Record<string, any>): Promise<McpToolResult> {
  const { execSync } = await import('child_process');
  
  let projectPath = args.projectPath;
  
  // Auto-detect project path
  if (!projectPath) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { success: false, error: 'No workspace folder found. Provide projectPath explicitly.' };
    }
    projectPath = workspaceFolders[0].uri.fsPath;
  }
  
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { success: false, error: `No package.json found at ${projectPath}` };
  }
  
  try {
    // Run npm compile
    execSync('npm run compile', {
      cwd: projectPath,
      encoding: 'utf8',
      timeout: 120000,
    });
    
    let vsixPath: string | null = null;
    
    // Optionally package VSIX
    if (args.packageVsix) {
      const output = execSync('npm run vsix', {
        cwd: projectPath,
        encoding: 'utf8',
        timeout: 120000,
      });
      
      // Find generated VSIX path from output
      const vsixMatch = output.match(/Packaged: (.+\.vsix)/);
      if (vsixMatch) {
        vsixPath = path.join(projectPath, vsixMatch[1]);
      } else {
        // Find newest .vsix file
        const files = fs.readdirSync(projectPath);
        const vsixFiles = files.filter(f => f.endsWith('.vsix'));
        if (vsixFiles.length > 0) {
          const vsixStats = vsixFiles.map(f => ({
            name: f,
            path: path.join(projectPath, f),
            mtime: fs.statSync(path.join(projectPath, f)).mtime.getTime(),
          }));
          vsixStats.sort((a, b) => b.mtime - a.mtime);
          vsixPath = vsixStats[0].path;
        }
      }
    }
    
    return { 
      success: true, 
      data: { 
        compiled: true,
        projectPath,
        vsixPath,
        message: args.packageVsix 
          ? `Extension compiled and packaged: ${vsixPath}` 
          : 'Extension compiled successfully',
      },
    };
  } catch (error: any) {
    return { success: false, error: `Build failed: ${error.message}` };
  }
}

/**
 * Spawn a new VS Code window for a worker
 */
async function handleSpawnWorkerWindow(args: Record<string, any>): Promise<McpToolResult> {
  if (!args.workerFolderPath) {
    return { success: false, error: 'workerFolderPath is required.' };
  }
  
  if (!fs.existsSync(args.workerFolderPath)) {
    return { success: false, error: `Worker folder not found: ${args.workerFolderPath}` };
  }
  
  try {
    // Open folder in new window
    const folderUri = vscode.Uri.file(args.workerFolderPath);
    await vscode.commands.executeCommand('vscode.openFolder', folderUri, { forceNewWindow: true });
    
    return { 
      success: true, 
      data: { 
        workerFolderPath: args.workerFolderPath, 
        spawned: true,
        message: 'New worker window spawned',
      },
    };
  } catch (error: any) {
    return { success: false, error: `Failed to spawn worker window: ${error.message}` };
  }
}

// =============================================================================
// WORKER PROVISIONING
// =============================================================================

/**
 * Generate unique worker UID
 */
function generateWorkerUid(db: RuntimeDatabase): string {
  // Get highest existing UID
  const workers = db.getAllWorkers();
  let maxUid = 0;
  for (const w of workers) {
    const match = w.uid.match(/U(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxUid) maxUid = num;
    }
  }
  const nextUid = maxUid + 1;
  return `U${nextUid.toString().padStart(5, '0')}`;
}

/**
 * Generate worker folder name
 */
function generateWorkerFolderName(role: string, workers: number, sibling: number, uid: string): string {
  const uidNum = uid.replace('U', '');
  return `.adg-parallels_${role}_W${workers}_S${sibling}_U${uidNum}`;
}

/**
 * Generate worker.xml content
 */
function generateWorkerXml(config: {
  workerId: string;
  role: string;
  layer: number;
  parentRole: string;
  parentUid: string;
  ceoFolder: string;
  workerRoot: string;
  outputDir: string;
  claimFromLayer: number;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<worker>
  <worker_id>${config.workerId}</worker_id>
  <role>${config.role}</role>
  <layer>${config.layer}</layer>
  <parent_role>${config.parentRole}</parent_role>
  <parent_uid>${config.parentUid}</parent_uid>
  
  <paths>
    <ceo_folder>${config.ceoFolder.replace(/\\/g, '/')}</ceo_folder>
    <worker_root>${config.workerRoot.replace(/\\/g, '/')}</worker_root>
    <output_dir>${config.outputDir.replace(/\\/g, '/')}</output_dir>
  </paths>
  
  <mcp_config>
    <use_mcp_tools>true</use_mcp_tools>
    <claim_from_layer>${config.claimFromLayer}</claim_from_layer>
  </mcp_config>
  
  <created_at>${new Date().toISOString()}</created_at>
  <instructions_version>2.0</instructions_version>
</worker>
`;
}

/**
 * Generate copilot-instructions.md for worker
 */
function generateWorkerInstructions(config: {
  role: string;
  workerId: string;
  sibling: number;
  layer: number;
  ceoFolder: string;
  workerRoot: string;
  taskInstructions?: string;
}): string {
  const roleDescriptions: Record<string, string> = {
    CEO: 'Chief Executive Officer - orchestrates the entire project',
    STRATOP: 'Strategic Operations - executes strategic tasks',
    DELIVCO: 'Delivery Coordinator - handles deliverables',
    EXESUPP: 'Executive Support - provides support tasks',
  };
  
  const roleDesc = roleDescriptions[config.role] || config.role;
  
  let customSection = '';
  if (config.taskInstructions) {
    customSection = `
---

## 📌 SPECIFIC TASK INSTRUCTIONS

${config.taskInstructions}

---
`;
  }
  
  return `\`\`\`instructions
# ADG-Parallels Worker Instructions
## You are: ${config.role} (${roleDesc}) Worker
## UID: ${config.workerId} | Sibling: ${config.sibling} | Layer: ${config.layer}

---

## 🎯 YOUR MISSION

You are an ADG-Parallels worker (Ejajka 🥚). Your job is to:
1. Claim a task from the task queue
2. Execute the task according to instructions in the payload
3. Report completion
4. Repeat until no more tasks are available
${customSection}
---

## 📋 IMMEDIATE ACTION - START WORKING NOW

When you start, immediately do the following:

### Step 1: Check Status and Claim Task

First, check the current status:
\`\`\`
Use MCP tool: mcp_adg-parallels_adg_status
\`\`\`

Then claim a task:
\`\`\`
Use MCP tool: mcp_adg-parallels_adg_claim_task
Parameters:
  workerUid: "${config.workerId}"
  ceoPath: "${config.ceoFolder.replace(/\\/g, '/')}"
\`\`\`

### Step 2: Execute the Task

The task payload contains your specific instructions. Read them carefully and execute.
The payload might ask you to:
- Review code files
- Write documentation
- Create files in the \`output/\` folder
- Analyze data

### Step 3: Complete the Task

When done:
\`\`\`
Use MCP tool: mcp_adg-parallels_adg_complete_task
Parameters:
  taskId: (the ID from the claimed task)
  ceoPath: "${config.ceoFolder.replace(/\\/g, '/')}"
\`\`\`

### Step 4: Claim Next Task

Go back to Step 1 and claim another task. Continue until no tasks are available.

---

## 🚨 IMPORTANT RULES

1. **ONE TASK AT A TIME**: Only work on one task at a time
2. **REPORT FAILURES**: If a task fails, use \`mcp_adg-parallels_adg_fail_task\`
3. **QUALITY FIRST**: Do the task well, not just fast
4. **NO ASSUMPTIONS**: Read the task payload carefully

---

## 🔧 AVAILABLE MCP TOOLS

All tools are prefixed with \`mcp_adg-parallels_\`:
- \`adg_status\` - Check overall project status
- \`adg_claim_task\` - Claim your next task (requires workerUid, ceoPath)
- \`adg_complete_task\` - Mark task as done (requires taskId, ceoPath)
- \`adg_fail_task\` - Mark task as failed (requires taskId, errorMessage, ceoPath)
- \`adg_get_dashboard\` - Get detailed statistics
- \`adg_list_tasks\` - See all tasks

---

## 📍 CONTEXT

- **CEO Path**: \`${config.ceoFolder.replace(/\\/g, '/')}\`
- **Your Path**: \`${config.workerRoot.replace(/\\/g, '/')}\`
- **Your UID**: \`${config.workerId}\`
- **Output Folder**: \`./output/\`

---

## 🏁 START NOW

Begin by checking status and claiming your first task! Use the MCP tools available to you.

Good luck, Ejajeczka! 🐣

*"Many Ejajkas, One Goal"*

\`\`\`
`;
}

/**
 * Provision a new worker: create folder, config files, register in DB, optionally spawn
 */
async function handleProvisionWorker(args: Record<string, any>): Promise<McpToolResult> {
  const db = getDb(args.ceoPath);
  if (!db) {
    return { success: false, error: 'No ADG project found. Provide ceoPath or initialize a project first with adg_init_project.' };
  }
  
  const ceoPath = args.ceoPath || detectCeoPath();
  if (!ceoPath) {
    return { success: false, error: 'Could not determine CEO path.' };
  }
  
  const layer = args.layer;
  if (layer === undefined || layer < 1) {
    return { success: false, error: 'layer is required and must be >= 1.' };
  }
  
  // Determine role based on layer if not provided
  let role = args.role;
  if (!role) {
    role = layer === 1 ? 'STRATOP' : 'DELIVCO';
  }
  
  // Generate unique UID
  const workerId = generateWorkerUid(db);
  
  // Determine parent UID
  let parentUid = args.parentUid;
  let parentRole = 'CEO';
  if (!parentUid) {
    // Find CEO or appropriate parent
    const workers = db.getAllWorkers();
    const ceoWorker = workers.find(w => w.layer === 0 || w.role === 'CEO');
    if (ceoWorker) {
      parentUid = ceoWorker.uid;
      parentRole = ceoWorker.role;
    } else {
      // No CEO registered yet, use placeholder
      parentUid = 'U00001';
      parentRole = 'CEO';
    }
  }
  
  // Count existing siblings at this layer
  const existingAtLayer = db.getAllWorkers().filter(w => w.layer === layer);
  const siblingIndex = existingAtLayer.length + 1;
  
  // Generate folder name
  const workerFolderName = generateWorkerFolderName(role, 0, siblingIndex, workerId);
  const workerFolderPath = path.join(ceoPath, workerFolderName);
  const outputDir = path.join(workerFolderPath, 'output');
  const githubDir = path.join(workerFolderPath, '.github');
  
  try {
    // Create folder structure
    fs.mkdirSync(workerFolderPath, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(githubDir, { recursive: true });
    
    // Create worker.xml
    const workerXml = generateWorkerXml({
      workerId,
      role,
      layer,
      parentRole,
      parentUid,
      ceoFolder: ceoPath,
      workerRoot: workerFolderPath,
      outputDir,
      claimFromLayer: layer,
    });
    fs.writeFileSync(path.join(workerFolderPath, 'worker.xml'), workerXml, 'utf8');
    
    // Create copilot-instructions.md
    const instructions = generateWorkerInstructions({
      role,
      workerId,
      sibling: siblingIndex,
      layer,
      ceoFolder: ceoPath,
      workerRoot: workerFolderPath,
      taskInstructions: args.taskInstructions,
    });
    fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), instructions, 'utf8');
    
    // Register worker in database
    db.registerWorker(
      workerId,
      workerFolderName,
      workerFolderPath,
      role,
      layer,
      parentUid
    );
    
    db.logEvent('WORKER_PROVISIONED', workerId, null, `Created worker folder: ${workerFolderName}`);
    
    // Optionally spawn window
    const autoSpawn = args.autoSpawn !== false; // Default true
    let spawned = false;
    
    if (autoSpawn) {
      try {
        const folderUri = vscode.Uri.file(workerFolderPath);
        await vscode.commands.executeCommand('vscode.openFolder', folderUri, { forceNewWindow: true });
        spawned = true;
        db.logEvent('WORKER_SPAWNED', workerId, null, 'VS Code window opened');
      } catch (e: any) {
        // Spawn failed, but worker is still created
        db.logEvent('WORKER_SPAWN_FAILED', workerId, null, e.message);
      }
    }
    
    return {
      success: true,
      data: {
        workerId,
        role,
        layer,
        parentUid,
        folderName: workerFolderName,
        folderPath: workerFolderPath,
        spawned,
        message: `Worker ${workerId} (${role}) provisioned successfully at layer ${layer}${spawned ? ' and window spawned' : ''}`,
      },
    };
  } catch (error: any) {
    return { success: false, error: `Failed to provision worker: ${error.message}` };
  }
}
