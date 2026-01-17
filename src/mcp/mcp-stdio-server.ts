#!/usr/bin/env node
/**
 * ADG-Parallels MCP Server (stdio)
 * 
 * Standalone MCP server that communicates via stdin/stdout.
 * This allows GitHub Copilot to use ADG tools directly.
 * 
 * Usage:
 *   node out/mcp/mcp-stdio-server.js [ceoPath]
 * 
 * Add to VS Code settings.json:
 *   "mcp": {
 *     "servers": {
 *       "adg-parallels": {
 *         "command": "node",
 *         "args": ["path/to/out/mcp/mcp-stdio-server.js"]
 *       }
 *     }
 *   }
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// =============================================================================
// TYPES
// =============================================================================

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: any;
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const TOOLS: McpTool[] = [
  {
    name: 'adg_status',
    description: 'Get current ADG-Parallels project status including active workers, pending tasks, and overall progress. Use this to understand the current state before taking any action.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: {
          type: 'string',
          description: 'Path to the CEO folder (root of the ADG project). If not provided, tries to auto-detect.',
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
        ceoPath: { type: 'string', description: 'Path to the CEO folder.' },
        status: { type: 'string', enum: ['UNASSIGNED', 'PROCESSING', 'DONE', 'FAILED'], description: 'Filter by task status.' },
        layer: { type: 'number', description: 'Filter by layer number (0 = CEO, 1 = first subordinate level, etc.).' },
        limit: { type: 'number', description: 'Maximum number of tasks to return. Default: 50.' },
      },
    },
  },
  {
    name: 'adg_claim_task',
    description: 'Atomically claim the next available task for a worker. Returns the task details if successful, null if no tasks available.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: { type: 'string', description: 'Path to the CEO folder.' },
        workerUid: { type: 'string', description: 'Unique identifier of the worker claiming the task.' },
        layer: { type: 'number', description: 'Optional: Only claim tasks from specific layer.' },
      },
      required: ['workerUid'],
    },
  },
  {
    name: 'adg_complete_task',
    description: 'Mark a task as successfully completed.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: { type: 'string', description: 'Path to the CEO folder.' },
        taskId: { type: 'number', description: 'ID of the task to complete.' },
        resultPath: { type: 'string', description: 'Optional: Path to the result/output file.' },
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
        ceoPath: { type: 'string', description: 'Path to the CEO folder.' },
        taskId: { type: 'number', description: 'ID of the task that failed.' },
        errorMessage: { type: 'string', description: 'Description of why the task failed.' },
      },
      required: ['taskId', 'errorMessage'],
    },
  },
  {
    name: 'adg_get_dashboard',
    description: 'Get comprehensive dashboard statistics including worker counts by status, task progress, slot usage.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: { type: 'string', description: 'Path to the CEO folder.' },
      },
    },
  },
  {
    name: 'adg_list_workers',
    description: 'List all workers in the project hierarchy with their current status, role, and task counts.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: { type: 'string', description: 'Path to the CEO folder.' },
        status: { type: 'string', enum: ['QUEUED', 'SLOT_ASSIGNED', 'IDLE', 'WORKING', 'AWAITING_SUBORDINATES', 'DONE', 'ERROR', 'SHUTDOWN'], description: 'Filter by worker status.' },
        parentUid: { type: 'string', description: 'Filter to show only children of a specific worker.' },
      },
    },
  },
  {
    name: 'adg_get_events',
    description: 'Get recent events from the audit log. Useful for debugging and understanding what happened.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: { type: 'string', description: 'Path to the CEO folder.' },
        workerUid: { type: 'string', description: 'Optional: Filter events for a specific worker.' },
        limit: { type: 'number', description: 'Maximum number of events to return. Default: 50.' },
      },
    },
  },
  {
    name: 'adg_create_tasks',
    description: 'Create new tasks in bulk. Tasks will be available for workers to claim.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: { type: 'string', description: 'Path to the CEO folder.' },
        layer: { type: 'number', description: 'Layer number for the tasks.' },
        payloads: { type: 'string', description: 'JSON array of task payloads (strings). Example: ["task1", "task2"]' },
      },
      required: ['layer', 'payloads'],
    },
  },
  {
    name: 'adg_init_project',
    description: 'Initialize a new ADG project with SQLite runtime database.',
    inputSchema: {
      type: 'object',
      properties: {
        ceoPath: { type: 'string', description: 'Path to the CEO folder where runtime.db will be created.' },
        maxSlots: { type: 'number', description: 'Maximum number of concurrent worker slots. Default: 4.' },
        projectName: { type: 'string', description: 'Name of the project for metadata.' },
      },
      required: ['ceoPath'],
    },
  },
  // =========================================================================
  // DEVELOPMENT / SELF-MANAGEMENT TOOLS
  // =========================================================================
  {
    name: 'adg_install_vsix',
    description: 'Install or update the ADG-Parallels extension from a VSIX file.',
    inputSchema: {
      type: 'object',
      properties: {
        vsixPath: { type: 'string', description: 'Path to the VSIX file to install.' },
        force: { type: 'boolean', description: 'Force reinstall even if same version installed.' },
      },
    },
  },
  {
    name: 'adg_reload_window',
    description: 'Reload the VS Code window to apply extension updates.',
    inputSchema: {
      type: 'object',
      properties: {
        delay: { type: 'number', description: 'Delay in milliseconds before reloading. Default: 1000.' },
      },
    },
  },
  {
    name: 'adg_build_extension',
    description: 'Build the ADG-Parallels extension. Compiles TypeScript and optionally packages VSIX.',
    inputSchema: {
      type: 'object',
      properties: {
        packageVsix: { type: 'boolean', description: 'Also package a VSIX file after compilation.' },
        projectPath: { type: 'string', description: 'Path to the extension project.' },
      },
    },
  },
  {
    name: 'adg_spawn_worker_window',
    description: 'Spawn a new VS Code window for a worker.',
    inputSchema: {
      type: 'object',
      properties: {
        workerFolderPath: { type: 'string', description: 'Absolute path to the worker folder to open.' },
      },
      required: ['workerFolderPath'],
    },
  },
];

// =============================================================================
// DATABASE ACCESS (using RuntimeDatabase via sqlite3 CLI)
// =============================================================================

import { execSync } from 'child_process';

let cachedCeoPath: string | null = null;
let cachedDb: StdioRuntimeDatabase | null = null;

function detectCeoPath(): string | null {
  // Try command line arg first
  if (process.argv[2]) {
    return process.argv[2];
  }
  
  // Try cached path
  if (cachedCeoPath) {
    return cachedCeoPath;
  }
  
  // Try current directory
  const cwd = process.cwd();
  if (path.basename(cwd).startsWith('.adg-parallels_CEO_')) {
    cachedCeoPath = cwd;
    return cwd;
  }
  
  // Look in current directory for CEO folder
  try {
    const entries = fs.readdirSync(cwd);
    for (const entry of entries) {
      if (entry.startsWith('.adg-parallels_CEO_')) {
        cachedCeoPath = path.join(cwd, entry);
        return cachedCeoPath;
      }
    }
  } catch {
    // ignore
  }
  
  // Walk up directory tree looking for CEO folder (worker scenario)
  let currentPath = cwd;
  for (let i = 0; i < 10; i++) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) break; // Reached root
    
    const parentName = path.basename(parentPath);
    if (parentName.startsWith('.adg-parallels_CEO_')) {
      cachedCeoPath = parentPath;
      return parentPath;
    }
    currentPath = parentPath;
  }
  
  return null;
}

function getDbPath(ceoPath?: string): string | null {
  const resolved = ceoPath || detectCeoPath();
  if (!resolved) return null;
  return path.join(resolved, 'runtime.db');
}

/**
 * Simplified RuntimeDatabase for stdio server (uses sqlite3 CLI)
 * Mirrors the main RuntimeDatabase API but works standalone
 */
class StdioRuntimeDatabase {
  private dbPath: string;
  
  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }
  
  private exec(sql: string): string {
    const tempFile = path.join(path.dirname(this.dbPath), '.query.sql');
    const wrappedSql = `.mode json\n${sql}`;
    fs.writeFileSync(tempFile, wrappedSql, 'utf8');
    
    try {
      const cmd = `sqlite3 "${this.dbPath}" < "${tempFile}"`;
      const result = execSync(cmd, { 
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      });
      return result.trim();
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
  
  private query<T>(sql: string): T[] {
    const result = this.exec(sql);
    if (!result) return [];
    try {
      return JSON.parse(result) as T[];
    } catch {
      return [];
    }
  }
  
  private run(sql: string): void {
    this.exec(sql);
  }
  
  private now(): number {
    return Math.floor(Date.now() / 1000);
  }
  
  // Task operations
  getAllTasks(): any[] {
    return this.query(`SELECT * FROM tasks ORDER BY id`);
  }
  
  getTasksByStatus(status: string): any[] {
    return this.query(`SELECT * FROM tasks WHERE status = '${status}' ORDER BY id`);
  }
  
  claimTask(workerUid: string, layer?: number): any | null {
    const now = this.now();
    const layerFilter = layer !== undefined ? `AND layer = ${layer}` : '';
    
    const sql = `
      UPDATE tasks 
      SET status = 'PROCESSING',
          assigned_worker = '${workerUid}',
          updated_at = ${now}
      WHERE id = (
        SELECT id FROM tasks 
        WHERE status = 'UNASSIGNED' ${layerFilter}
        ORDER BY id LIMIT 1
      )
      RETURNING *
    `;
    
    const result = this.query<any>(sql);
    const task = result[0] ?? null;
    
    if (task) {
      this.logEvent('TASK_CLAIMED', workerUid, task.id);
      this.run(`
        UPDATE workers 
        SET current_task_id = ${task.id}, status = 'WORKING', updated_at = ${now}
        WHERE uid = '${workerUid}'
      `);
    }
    
    return task;
  }
  
  completeTask(taskId: number, resultPath?: string): void {
    const now = this.now();
    const resultSql = resultPath ? `'${resultPath.replace(/'/g, "''")}'` : 'NULL';
    
    this.run(`
      UPDATE tasks 
      SET status = 'DONE', result_path = ${resultSql}, updated_at = ${now}
      WHERE id = ${taskId}
    `);
    
    const tasks = this.query<any>(`SELECT assigned_worker FROM tasks WHERE id = ${taskId}`);
    const workerUid = tasks[0]?.assigned_worker;
    
    if (workerUid) {
      this.run(`
        UPDATE workers 
        SET tasks_completed = tasks_completed + 1, 
            current_task_id = NULL,
            status = 'IDLE'
        WHERE uid = '${workerUid}'
      `);
    }
    
    this.logEvent('TASK_DONE', workerUid, taskId);
  }
  
  failTask(taskId: number, errorMessage: string): void {
    const now = this.now();
    const errorSql = errorMessage.replace(/'/g, "''");
    
    this.run(`
      UPDATE tasks 
      SET status = 'FAILED', error_message = '${errorSql}', updated_at = ${now}
      WHERE id = ${taskId}
    `);
    
    const tasks = this.query<any>(`SELECT assigned_worker FROM tasks WHERE id = ${taskId}`);
    const workerUid = tasks[0]?.assigned_worker;
    
    if (workerUid) {
      this.run(`
        UPDATE workers 
        SET tasks_failed = tasks_failed + 1, 
            current_task_id = NULL,
            status = 'IDLE'
        WHERE uid = '${workerUid}'
      `);
    }
    
    this.logEvent('TASK_FAILED', workerUid, taskId, errorMessage);
  }
  
  createTasks(layer: number, payloads: string[]): number[] {
    const ids: number[] = [];
    for (const payload of payloads) {
      const now = this.now();
      const payloadSql = `'${payload.replace(/'/g, "''")}'`;
      const result = this.query<{id: number}>(`
        INSERT INTO tasks (layer, payload, status, created_at, updated_at)
        VALUES (${layer}, ${payloadSql}, 'UNASSIGNED', ${now}, ${now})
        RETURNING id
      `);
      if (result[0]) {
        ids.push(result[0].id);
        this.logEvent('TASK_CREATED', null, result[0].id);
      }
    }
    return ids;
  }
  
  // Worker operations
  getAllWorkers(): any[] {
    return this.query(`SELECT * FROM workers ORDER BY layer, uid`);
  }
  
  getWorkersByStatus(status: string): any[] {
    return this.query(`SELECT * FROM workers WHERE status = '${status}' ORDER BY layer, uid`);
  }
  
  getChildren(parentUid: string): any[] {
    return this.query(`SELECT * FROM workers WHERE parent_uid = '${parentUid}' ORDER BY uid`);
  }
  
  heartbeat(uid: string): void {
    const now = this.now();
    this.run(`UPDATE workers SET last_heartbeat = ${now} WHERE uid = '${uid}'`);
  }
  
  registerWorker(uid: string, folderName: string, folderPath: string, role: string, layer: number, parentUid?: string): void {
    const now = this.now();
    const parentSql = parentUid ? `'${parentUid}'` : 'NULL';
    
    this.run(`
      INSERT INTO workers (uid, folder_name, folder_path, role, layer, parent_uid, created_at)
      VALUES ('${uid}', '${folderName}', '${folderPath.replace(/'/g, "''")}', '${role}', ${layer}, ${parentSql}, ${now})
    `);
    
    this.logEvent('WORKER_SPAWNED', uid);
  }
  
  updateWorkerStatus(uid: string, status: string, errorMessage?: string): void {
    const now = this.now();
    const errorSql = errorMessage ? `, error_message = '${errorMessage.replace(/'/g, "''")}'` : '';
    
    let extraFields = '';
    if (status === 'SLOT_ASSIGNED' || status === 'WORKING') {
      extraFields = `, started_at = COALESCE(started_at, ${now})`;
    } else if (status === 'DONE' || status === 'SHUTDOWN') {
      extraFields = `, completed_at = ${now}`;
    }
    
    this.run(`
      UPDATE workers 
      SET status = '${status}', last_heartbeat = ${now}${errorSql}${extraFields}
      WHERE uid = '${uid}'
    `);
  }
  
  // Events
  logEvent(eventType: string, workerUid?: string | null, taskId?: number | null, details?: string): void {
    const now = this.now();
    const workerSql = workerUid ? `'${workerUid}'` : 'NULL';
    const taskSql = taskId ? taskId : 'NULL';
    const detailsSql = details ? `'${details.replace(/'/g, "''")}'` : 'NULL';
    
    this.run(`
      INSERT INTO events (timestamp, event_type, worker_uid, task_id, details)
      VALUES (${now}, '${eventType}', ${workerSql}, ${taskSql}, ${detailsSql})
    `);
  }
  
  getRecentEvents(limit: number = 50): any[] {
    return this.query(`SELECT * FROM events ORDER BY timestamp DESC LIMIT ${limit}`);
  }
  
  getWorkerEvents(workerUid: string, limit: number = 50): any[] {
    return this.query(`
      SELECT * FROM events WHERE worker_uid = '${workerUid}'
      ORDER BY timestamp DESC LIMIT ${limit}
    `);
  }
  
  // Dashboard
  getDashboardStats(): any {
    const workers = this.getAllWorkers();
    const tasks = this.getAllTasks();
    const slots = this.getSlotUsage();
    const unresponsive = this.getUnresponsiveWorkers();
    
    const workersByStatus: Record<string, number> = {
      QUEUED: 0, SLOT_ASSIGNED: 0, IDLE: 0, WORKING: 0,
      AWAITING_SUBORDINATES: 0, DONE: 0, ERROR: 0, SHUTDOWN: 0,
    };
    
    for (const w of workers) {
      workersByStatus[w.status] = (workersByStatus[w.status] || 0) + 1;
    }
    
    return {
      total_workers: workers.length,
      workers_by_status: workersByStatus,
      total_tasks: tasks.length,
      tasks_done: tasks.filter((t: any) => t.status === 'DONE').length,
      tasks_processing: tasks.filter((t: any) => t.status === 'PROCESSING').length,
      tasks_pending: tasks.filter((t: any) => t.status === 'UNASSIGNED').length,
      tasks_failed: tasks.filter((t: any) => t.status === 'FAILED').length,
      slots_used: slots.used,
      slots_total: slots.total,
      unresponsive_workers: unresponsive.map((w: any) => w.uid),
    };
  }
  
  getSlotUsage(): { used: number; total: number } {
    const used = this.query<{count: number}>(`
      SELECT COUNT(*) as count FROM slots WHERE worker_uid IS NOT NULL
    `);
    const total = this.query<{count: number}>(`SELECT COUNT(*) as count FROM slots`);
    
    return {
      used: used[0]?.count ?? 0,
      total: total[0]?.count ?? 0,
    };
  }
  
  getUnresponsiveWorkers(thresholdSeconds: number = 90): any[] {
    const cutoff = this.now() - thresholdSeconds;
    return this.query(`
      SELECT * FROM workers 
      WHERE status NOT IN ('DONE', 'SHUTDOWN', 'ERROR', 'QUEUED')
        AND last_heartbeat IS NOT NULL
        AND last_heartbeat < ${cutoff}
      ORDER BY last_heartbeat
    `);
  }
  
  // Project metadata
  getAllProjectMeta(): Record<string, string> {
    const rows = this.query<{key: string; value: string}>(`SELECT * FROM project`);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }
  
  setProjectMeta(key: string, value: string): void {
    this.run(`
      INSERT OR REPLACE INTO project (key, value) VALUES ('${key}', '${value.replace(/'/g, "''")}')
    `);
  }
  
  // Init
  initSlots(count: number): void {
    for (let i = 1; i <= count; i++) {
      this.run(`INSERT OR IGNORE INTO slots (slot_id) VALUES (${i})`);
    }
    this.setProjectMeta('max_slots', count.toString());
  }
  
  initSchema(): void {
    const SCHEMA = `
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      
      CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY,
          layer INTEGER NOT NULL,
          payload TEXT,
          status TEXT NOT NULL DEFAULT 'UNASSIGNED',
          assigned_worker TEXT,
          result_path TEXT,
          error_message TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS workers (
          uid TEXT PRIMARY KEY,
          folder_name TEXT NOT NULL,
          folder_path TEXT NOT NULL,
          role TEXT NOT NULL,
          layer INTEGER NOT NULL,
          parent_uid TEXT,
          status TEXT NOT NULL DEFAULT 'QUEUED',
          slot_id INTEGER,
          last_heartbeat INTEGER,
          tasks_completed INTEGER DEFAULT 0,
          tasks_failed INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER,
          started_at INTEGER,
          completed_at INTEGER,
          current_task_id INTEGER,
          error_message TEXT
      );
      
      CREATE TABLE IF NOT EXISTS slots (
          slot_id INTEGER PRIMARY KEY,
          worker_uid TEXT,
          assigned_at INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          worker_uid TEXT,
          task_id INTEGER,
          details TEXT
      );
      
      CREATE TABLE IF NOT EXISTS project (
          key TEXT PRIMARY KEY,
          value TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_layer_status ON tasks(layer, status);
      CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
      CREATE INDEX IF NOT EXISTS idx_workers_parent ON workers(parent_uid);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_events_worker ON events(worker_uid);
    `;
    
    const tempFile = path.join(path.dirname(this.dbPath), '.schema.sql');
    fs.writeFileSync(tempFile, SCHEMA, 'utf8');
    
    try {
      execSync(`sqlite3 "${this.dbPath}" < "${tempFile}"`, { 
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      });
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
}

function getDb(ceoPath?: string): StdioRuntimeDatabase | null {
  const resolved = ceoPath || detectCeoPath();
  if (!resolved) return null;
  
  const dbPath = path.join(resolved, 'runtime.db');
  if (!fs.existsSync(dbPath)) return null;
  
  if (!cachedDb || cachedCeoPath !== resolved) {
    cachedCeoPath = resolved;
    cachedDb = new StdioRuntimeDatabase(dbPath);
  }
  
  return cachedDb;
}

// =============================================================================
// TOOL EXECUTION (Real implementation using RuntimeDatabase)
// =============================================================================

/**
 * Locate VS Code CLI executable path
 * 
 * Searches in order:
 * 1. PATH environment variable (code/code-insiders)
 * 2. Standard installation paths
 * 3. Portable installation detection via environment
 */
function getVsCodeCliPath(): string {
  // Try to detect if we're in Insiders based on environment
  const isInsiders = process.env.VSCODE_PID || process.env.TERM_PROGRAM === 'vscode';
  const cliName = 'code'; // For stdio server, we default to regular code
  
  // Method 1: Try PATH first
  try {
    const whereCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${whereCmd} ${cliName}`, { encoding: 'utf8', timeout: 5000, windowsHide: true });
    if (result.trim()) {
      return cliName;
    }
  } catch {
    // Not in PATH
  }
  
  // Try code-insiders too
  try {
    const whereCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${whereCmd} code-insiders`, { encoding: 'utf8', timeout: 5000, windowsHide: true });
    if (result.trim()) {
      return 'code-insiders';
    }
  } catch {
    // Not in PATH
  }
  
  // Method 2: Standard installation paths
  const standardPaths = process.platform === 'win32' ? [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'),
    path.join(process.env.PROGRAMFILES || '', 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd'),
    path.join(process.env.PROGRAMFILES || '', 'Microsoft VS Code', 'bin', 'code.cmd'),
  ] : [
    '/usr/local/bin/code-insiders',
    '/usr/local/bin/code',
    '/usr/bin/code-insiders',
    '/usr/bin/code',
    path.join(process.env.HOME || '', '.local', 'bin', 'code-insiders'),
    path.join(process.env.HOME || '', '.local', 'bin', 'code'),
  ];
  
  for (const p of standardPaths) {
    if (fs.existsSync(p)) {
      return `"${p}"`;
    }
  }
  
  // Method 3: Look for portable installations in common locations
  // Check D:\ drive for portable installs (common pattern)
  if (process.platform === 'win32') {
    const portablePaths = [
      'D:\\instant_run\\vscode-insiders\\vscode-portable-insiders\\bin\\code-insiders.cmd',
      'D:\\portable\\VSCode-Insiders\\bin\\code-insiders.cmd',
      'D:\\VSCode-Insiders\\bin\\code-insiders.cmd',
    ];
    for (const p of portablePaths) {
      if (fs.existsSync(p)) {
        return `"${p}"`;
      }
    }
  }
  
  // Fallback
  return cliName;
}

async function executeTool(name: string, args: Record<string, any>): Promise<any> {
  const ceoPath = args.ceoPath || detectCeoPath();
  
  // =========================================================================
  // DEVELOPMENT / SELF-MANAGEMENT TOOLS - DO NOT REQUIRE DATABASE
  // These tools work WITHOUT database - they control VS Code itself
  // =========================================================================
  
  if (name === 'adg_install_vsix') {
    let vsixPath = args.vsixPath;
    
    // Auto-detect VSIX if not provided
    if (!vsixPath) {
      const cwd = process.cwd();
      try {
        const files = fs.readdirSync(cwd);
        const vsixFiles = files.filter(f => f.endsWith('.vsix'));
        
        if (vsixFiles.length === 0) {
          return { error: 'No VSIX files found. Provide vsixPath or run adg_build_extension first.' };
        }
        
        // Get most recent by modification time
        const vsixStats = vsixFiles.map(f => ({
          name: f,
          path: path.join(cwd, f),
          mtime: fs.statSync(path.join(cwd, f)).mtime.getTime(),
        }));
        vsixStats.sort((a, b) => b.mtime - a.mtime);
        vsixPath = vsixStats[0].path;
      } catch (error: any) {
        return { error: `Failed to scan for VSIX files: ${error.message}` };
      }
    }
    
    if (!fs.existsSync(vsixPath)) {
      return { error: `VSIX file not found: ${vsixPath}` };
    }
    
    try {
      const cliPath = getVsCodeCliPath();
      const forceFlag = args.force ? '--force' : '';
      execSync(`${cliPath} --install-extension "${vsixPath}" ${forceFlag}`, {
        encoding: 'utf8',
        timeout: 60000,
      });
      
      return { 
        vsixPath, 
        installed: true,
        cliUsed: cliPath,
        message: 'Extension installed successfully. ⚠️ IMPORTANT: Window reload is needed to apply changes. Please reload the window manually (Ctrl+Shift+P -> "Developer: Reload Window") as automatic reload breaks the chat session.',
      };
    } catch (error: any) {
      return { error: `Failed to install VSIX: ${error.message}` };
    }
  }
  
  if (name === 'adg_reload_window') {
    // stdio server can't reload window directly
    return {
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
    };
  }
  
  if (name === 'adg_build_extension') {
    let projectPath = args.projectPath || process.cwd();
    
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return { error: `No package.json found at ${projectPath}` };
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
        execSync('npm run vsix', {
          cwd: projectPath,
          encoding: 'utf8',
          timeout: 120000,
        });
        
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
      
      return { 
        compiled: true,
        projectPath,
        vsixPath,
        message: args.packageVsix 
          ? `Extension compiled and packaged: ${vsixPath}` 
          : 'Extension compiled successfully',
      };
    } catch (error: any) {
      return { error: `Build failed: ${error.message}` };
    }
  }
  
  if (name === 'adg_spawn_worker_window') {
    if (!args.workerFolderPath) {
      return { error: 'workerFolderPath is required' };
    }
    
    if (!fs.existsSync(args.workerFolderPath)) {
      return { error: `Worker folder not found: ${args.workerFolderPath}` };
    }
    
    try {
      const cliPath = getVsCodeCliPath();
      
      // Use VS Code CLI to open folder in new window
      execSync(`${cliPath} --new-window "${args.workerFolderPath}"`, {
        encoding: 'utf8',
        timeout: 10000,
      });
      
      return { 
        workerFolderPath: args.workerFolderPath, 
        spawned: true,
        cliUsed: cliPath,
        message: 'New worker window spawned',
      };
    } catch (error: any) {
      return { error: `Failed to spawn worker window: ${error.message}` };
    }
  }
  
  // =========================================================================
  // DATABASE-BASED TOOLS - require existing ADG project
  // =========================================================================
  
  // Special case: init doesn't require existing DB
  if (name === 'adg_init_project') {
    if (!args.ceoPath) {
      return { error: 'ceoPath is required for adg_init_project' };
    }
    
    // Ensure directory exists
    if (!fs.existsSync(args.ceoPath)) {
      fs.mkdirSync(args.ceoPath, { recursive: true });
    }
    
    const dbPath = path.join(args.ceoPath, 'runtime.db');
    const db = new StdioRuntimeDatabase(dbPath);
    db.initSchema();
    
    const maxSlots = args.maxSlots || 4;
    db.initSlots(maxSlots);
    
    if (args.projectName) {
      db.setProjectMeta('name', args.projectName);
    }
    db.setProjectMeta('created_at', Math.floor(Date.now() / 1000).toString());
    db.logEvent('PROJECT_STARTED', null, null, args.projectName || 'New Project');
    
    cachedCeoPath = args.ceoPath;
    cachedDb = db;
    
    return {
      ceoPath: args.ceoPath,
      dbPath,
      maxSlots,
      initialized: true,
    };
  }
  
  // All other tools require an existing database
  const db = getDb(ceoPath);
  if (!db) {
    return {
      error: 'No ADG project found. Please provide ceoPath or run from a workspace with an ADG project.',
      hint: 'Use adg_init_project to create a new project first.',
      searchedPaths: [ceoPath, process.cwd()],
    };
  }
  
  switch (name) {
    case 'adg_status': {
      const stats = db.getDashboardStats();
      const meta = db.getAllProjectMeta();
      return {
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
        ceoPath,
      };
    }
    
    case 'adg_list_tasks': {
      let tasks = db.getAllTasks();
      
      if (args.status) {
        tasks = tasks.filter((t: any) => t.status === args.status);
      }
      if (args.layer !== undefined) {
        tasks = tasks.filter((t: any) => t.layer === args.layer);
      }
      
      const limit = args.limit || 50;
      return tasks.slice(0, limit);
    }
    
    case 'adg_claim_task': {
      if (!args.workerUid) {
        return { error: 'workerUid is required' };
      }
      const task = db.claimTask(args.workerUid, args.layer);
      return task || { message: 'No tasks available to claim' };
    }
    
    case 'adg_complete_task': {
      if (!args.taskId) {
        return { error: 'taskId is required' };
      }
      db.completeTask(args.taskId, args.resultPath);
      return { taskId: args.taskId, status: 'DONE' };
    }
    
    case 'adg_fail_task': {
      if (!args.taskId || !args.errorMessage) {
        return { error: 'taskId and errorMessage are required' };
      }
      db.failTask(args.taskId, args.errorMessage);
      return { taskId: args.taskId, status: 'FAILED' };
    }
    
    case 'adg_worker_heartbeat': {
      if (!args.workerUid) {
        return { error: 'workerUid is required' };
      }
      db.heartbeat(args.workerUid);
      return { workerUid: args.workerUid, heartbeatSent: true };
    }
    
    case 'adg_get_dashboard': {
      return db.getDashboardStats();
    }
    
    case 'adg_list_workers': {
      let workers;
      if (args.status) {
        workers = db.getWorkersByStatus(args.status);
      } else if (args.parentUid) {
        workers = db.getChildren(args.parentUid);
      } else {
        workers = db.getAllWorkers();
      }
      return workers;
    }
    
    case 'adg_get_events': {
      const limit = args.limit || 50;
      if (args.workerUid) {
        return db.getWorkerEvents(args.workerUid, limit);
      } else {
        return db.getRecentEvents(limit);
      }
    }
    
    case 'adg_register_worker': {
      const required = ['uid', 'folderName', 'folderPath', 'role', 'layer'];
      for (const field of required) {
        if (args[field] === undefined) {
          return { error: `${field} is required` };
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
      return { uid: args.uid, registered: true };
    }
    
    case 'adg_update_worker_status': {
      if (!args.workerUid || !args.status) {
        return { error: 'workerUid and status are required' };
      }
      db.updateWorkerStatus(args.workerUid, args.status, args.errorMessage);
      return { workerUid: args.workerUid, status: args.status };
    }
    
    case 'adg_create_tasks': {
      if (args.layer === undefined || !args.payloads) {
        return { error: 'layer and payloads are required' };
      }
      
      let payloads: string[];
      try {
        payloads = JSON.parse(args.payloads);
      } catch {
        return { error: 'payloads must be a valid JSON array of strings' };
      }
      
      const ids = db.createTasks(args.layer, payloads);
      return { created: ids.length, taskIds: ids };
    }
    
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// =============================================================================
// MCP PROTOCOL HANDLERS
// =============================================================================

function handleInitialize(params: any): any {
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: 'adg-parallels',
      version: '0.6.2',
    },
  };
}

function handleListTools(): any {
  return {
    tools: TOOLS,
  };
}

async function handleCallTool(params: any): Promise<any> {
  const { name, arguments: args } = params;
  
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) {
    throw { code: -32601, message: `Unknown tool: ${name}` };
  }
  
  const result = await executeTool(name, args || {});
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

// =============================================================================
// JSON-RPC TRANSPORT
// =============================================================================

function sendResponse(response: JsonRpcResponse): void {
  const json = JSON.stringify(response);
  // Send raw JSON with newline (no Content-Length header - VS Code MCP uses raw JSON)
  process.stdout.write(json + '\n');
  console.error('[ADG MCP] Sent response for id:', response.id, 'length:', json.length);
}

function sendError(id: number | string | null, code: number, message: string): void {
  sendResponse({
    jsonrpc: '2.0',
    id: id ?? 0,
    error: { code, message },
  });
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  try {
    let result: any;
    
    switch (request.method) {
      case 'initialize':
        result = handleInitialize(request.params);
        break;
      
      case 'tools/list':
        result = handleListTools();
        break;
      
      case 'tools/call':
        result = await handleCallTool(request.params);
        break;
      
      case 'notifications/initialized':
        // No response needed for notifications
        return;
      
      default:
        throw { code: -32601, message: `Method not found: ${request.method}` };
    }
    
    sendResponse({
      jsonrpc: '2.0',
      id: request.id,
      result,
    });
  } catch (error: any) {
    sendError(
      request.id,
      error.code || -32603,
      error.message || 'Internal error'
    );
  }
}

// =============================================================================
// MAIN
// =============================================================================

function main(): void {
  // Disable console.error buffering for debug messages
  console.error('[ADG MCP] Server starting...');
  
  let buffer = '';
  
  // Use raw mode for stdin
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    console.error('[ADG MCP] Received chunk, buffer size:', buffer.length);
    
    // Try to parse JSON messages - VS Code may send raw JSON or with Content-Length
    while (buffer.length > 0) {
      // First, try to find Content-Length header
      const headerMatch = buffer.match(/^Content-Length:\s*(\d+)\r?\n\r?\n/);
      if (headerMatch) {
        const contentLength = parseInt(headerMatch[1], 10);
        const headerLength = headerMatch[0].length;
        
        if (buffer.length >= headerLength + contentLength) {
          const message = buffer.substring(headerLength, headerLength + contentLength);
          buffer = buffer.substring(headerLength + contentLength);
          processMessage(message);
          continue;
        } else {
          console.error('[ADG MCP] Waiting for complete message, have:', buffer.length - headerLength, 'need:', contentLength);
          break;
        }
      }
      
      // No Content-Length header - try to parse as raw JSON
      // Find the first complete JSON object
      let braceCount = 0;
      let inString = false;
      let escape = false;
      let jsonEnd = -1;
      
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        
        if (escape) {
          escape = false;
          continue;
        }
        
        if (char === '\\' && inString) {
          escape = true;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          continue;
        }
        
        if (inString) continue;
        
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
      
      if (jsonEnd > 0) {
        const message = buffer.substring(0, jsonEnd);
        buffer = buffer.substring(jsonEnd).replace(/^\s+/, ''); // Trim leading whitespace
        console.error('[ADG MCP] Found JSON message, length:', message.length);
        processMessage(message);
      } else {
        console.error('[ADG MCP] Waiting for complete JSON...');
        break;
      }
    }
  });
  
  process.stdin.on('end', () => {
    console.error('[ADG MCP] stdin closed, shutting down');
    process.exit(0);
  });
  
  process.stdin.on('error', (err) => {
    console.error('[ADG MCP] stdin error:', err.message);
  });
  
  console.error('[ADG MCP] Server ready, waiting for input...');
}

function processMessage(message: string): void {
  console.error('[ADG MCP] Processing:', message.substring(0, 80) + '...');
  try {
    const request = JSON.parse(message) as JsonRpcRequest;
    console.error('[ADG MCP] Method:', request.method, 'ID:', request.id);
    handleRequest(request);
  } catch (e: any) {
    console.error('[ADG MCP] Parse error:', e.message);
    sendError(null, -32700, 'Parse error: ' + e.message);
  }
}

main();
