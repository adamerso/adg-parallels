/**
 * SQLite Runtime Database
 * 
 * Central state management for ADG-Parallels runtime.
 * Uses SQLite in WAL mode for concurrent access.
 * 
 * Tables:
 * - tasks: Task queue with atomic claiming
 * - workers: Worker registry + heartbeat
 * - slots: Concurrent window allocation
 * - events: Audit log
 * - project: Key-value metadata
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync, exec } from 'child_process';

// Standalone logger (no vscode dependency for testability)
const dbLogger = {
  info: (msg: string) => console.log(`[DB] ${msg}`),
  error: (msg: string) => console.error(`[DB ERROR] ${msg}`),
};

// =============================================================================
// TYPES
// =============================================================================

export type TaskStatus = 'UNASSIGNED' | 'PROCESSING' | 'DONE' | 'FAILED';

export type WorkerStatus = 
  | 'QUEUED' 
  | 'SLOT_ASSIGNED' 
  | 'IDLE' 
  | 'WORKING' 
  | 'AWAITING_SUBORDINATES' 
  | 'DONE' 
  | 'ERROR' 
  | 'SHUTDOWN';

export type EventType = 
  | 'TASK_CREATED'
  | 'TASK_CLAIMED'
  | 'TASK_DONE'
  | 'TASK_FAILED'
  | 'WORKER_PROVISIONED'
  | 'WORKER_SPAWNED'
  | 'WORKER_SPAWN_FAILED'
  | 'WORKER_STARTED'
  | 'WORKER_HEARTBEAT'
  | 'WORKER_DONE'
  | 'WORKER_ERROR'
  | 'WORKER_SHUTDOWN'
  | 'SLOT_ASSIGNED'
  | 'SLOT_RELEASED'
  | 'PROJECT_STARTED'
  | 'PROJECT_STOPPED';

export interface Task {
  id: number;
  layer: number;
  payload: string | null;
  status: TaskStatus;
  assigned_worker: string | null;
  result_path: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

export interface Worker {
  uid: string;
  folder_name: string;
  folder_path: string;
  role: string;
  layer: number;
  parent_uid: string | null;
  status: WorkerStatus;
  slot_id: number | null;
  last_heartbeat: number | null;
  tasks_completed: number;
  tasks_failed: number;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  current_task_id: number | null;
  error_message: string | null;
}

export interface Event {
  id: number;
  timestamp: number;
  event_type: EventType;
  worker_uid: string | null;
  task_id: number | null;
  details: string | null;
}

export interface DashboardStats {
  total_workers: number;
  workers_by_status: Record<WorkerStatus, number>;
  total_tasks: number;
  tasks_done: number;
  tasks_processing: number;
  tasks_pending: number;
  tasks_failed: number;
  slots_used: number;
  slots_total: number;
  unresponsive_workers: string[];
}

// =============================================================================
// SCHEMA
// =============================================================================

const SCHEMA = `
-- Enable WAL mode for concurrent access
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    layer INTEGER NOT NULL,
    payload TEXT,
    status TEXT NOT NULL DEFAULT 'UNASSIGNED'
        CHECK(status IN ('UNASSIGNED','PROCESSING','DONE','FAILED')),
    assigned_worker TEXT,
    result_path TEXT,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Workers table
CREATE TABLE IF NOT EXISTS workers (
    uid TEXT PRIMARY KEY,
    folder_name TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    role TEXT NOT NULL,
    layer INTEGER NOT NULL,
    parent_uid TEXT,
    status TEXT NOT NULL DEFAULT 'QUEUED'
        CHECK(status IN ('QUEUED','SLOT_ASSIGNED','IDLE','WORKING','AWAITING_SUBORDINATES','DONE','ERROR','SHUTDOWN')),
    slot_id INTEGER,
    last_heartbeat INTEGER,
    tasks_completed INTEGER DEFAULT 0,
    tasks_failed INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    started_at INTEGER,
    completed_at INTEGER,
    current_task_id INTEGER,
    error_message TEXT,
    FOREIGN KEY (current_task_id) REFERENCES tasks(id)
);

-- Slots table
CREATE TABLE IF NOT EXISTS slots (
    slot_id INTEGER PRIMARY KEY,
    worker_uid TEXT,
    assigned_at INTEGER,
    FOREIGN KEY (worker_uid) REFERENCES workers(uid)
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    worker_uid TEXT,
    task_id INTEGER,
    details TEXT,
    FOREIGN KEY (worker_uid) REFERENCES workers(uid),
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Project metadata
CREATE TABLE IF NOT EXISTS project (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_layer_status ON tasks(layer, status);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_parent ON workers(parent_uid);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_worker ON events(worker_uid);
`;

// =============================================================================
// DATABASE CLASS
// =============================================================================

/**
 * SQLite database wrapper for ADG-Parallels runtime.
 * 
 * Uses sqlite3 CLI for portability (no native modules required).
 */
export class RuntimeDatabase {
  private dbPath: string;
  private initialized: boolean = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Get database file path
   */
  public getPath(): string {
    return this.dbPath;
  }

  /**
   * Initialize database with schema
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create schema
    await this.execMultiple(SCHEMA);
    this.initialized = true;
    dbLogger.info(`Initialized: ${this.dbPath}`);
  }

  /**
   * Execute SQL via temp file and return result as JSON
   * Uses temp file approach to avoid command line length limits
   */
  private exec(sql: string): string {
    const tempFile = path.join(path.dirname(this.dbPath), '.query.sql');
    
    // Wrap SQL to output JSON
    const wrappedSql = `.mode json\n${sql}`;
    fs.writeFileSync(tempFile, wrappedSql, 'utf8');
    
    try {
      const cmd = `sqlite3 "${this.dbPath}" < "${tempFile}"`;
      const result = execSync(cmd, { 
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
        shell: 'cmd.exe',
      });
      return result.trim();
    } catch (error: any) {
      dbLogger.error(`SQL error: ${error.message}`);
      dbLogger.error(`SQL: ${sql.substring(0, 200)}...`);
      throw error;
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  /**
   * Execute multiple SQL statements (for schema)
   */
  private async execMultiple(sql: string): Promise<void> {
    // Write SQL to temp file to avoid escaping issues
    const tempFile = path.join(path.dirname(this.dbPath), '.schema.sql');
    fs.writeFileSync(tempFile, sql, 'utf8');
    
    try {
      const cmd = `sqlite3 "${this.dbPath}" < "${tempFile}"`;
      execSync(cmd, { 
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
        shell: 'cmd.exe',
      });
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  /**
   * Execute SQL and return parsed JSON result
   */
  private query<T>(sql: string): T[] {
    const result = this.exec(sql);
    if (!result) return [];
    try {
      return JSON.parse(result) as T[];
    } catch {
      return [];
    }
  }

  /**
   * Execute SQL without returning results
   */
  private run(sql: string): void {
    this.exec(sql);
  }

  /**
   * Get current Unix timestamp
   */
  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  // ===========================================================================
  // TASK OPERATIONS
  // ===========================================================================

  /**
   * Create a new task
   */
  public createTask(layer: number, payload?: string): number {
    const now = this.now();
    const payloadSql = payload !== undefined ? `'${payload.replace(/'/g, "''")}'` : 'NULL';
    
    const result = this.query<{id: number}>(`
      INSERT INTO tasks (layer, payload, status, created_at, updated_at)
      VALUES (${layer}, ${payloadSql}, 'UNASSIGNED', ${now}, ${now})
      RETURNING id
    `);
    
    const taskId = result[0]?.id ?? 0;
    
    this.logEvent('TASK_CREATED', null, taskId);
    return taskId;
  }

  /**
   * Bulk create tasks
   */
  public createTasks(layer: number, payloads: string[]): number[] {
    const ids: number[] = [];
    for (const payload of payloads) {
      ids.push(this.createTask(layer, payload));
    }
    return ids;
  }

  /**
   * Atomically claim next available task for a worker
   */
  public claimTask(workerUid: string, layer?: number): Task | null {
    const now = this.now();
    const layerFilter = layer !== undefined ? `AND layer = ${layer}` : '';
    
    // Atomic claim with RETURNING
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
    
    const result = this.query<Task>(sql);
    const task = result[0] ?? null;
    
    if (task) {
      this.logEvent('TASK_CLAIMED', workerUid, task.id);
      // Update worker's current task
      this.run(`
        UPDATE workers 
        SET current_task_id = ${task.id}, status = 'WORKING', updated_at = ${now}
        WHERE uid = '${workerUid}'
      `);
    }
    
    return task;
  }

  /**
   * Mark task as done
   */
  public completeTask(taskId: number, resultPath?: string): void {
    const now = this.now();
    const resultSql = resultPath ? `'${resultPath.replace(/'/g, "''")}'` : 'NULL';
    
    this.run(`
      UPDATE tasks 
      SET status = 'DONE', result_path = ${resultSql}, updated_at = ${now}
      WHERE id = ${taskId}
    `);
    
    // Get worker and update stats
    const tasks = this.query<Task>(`SELECT assigned_worker FROM tasks WHERE id = ${taskId}`);
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

  /**
   * Mark task as failed
   */
  public failTask(taskId: number, errorMessage: string): void {
    const now = this.now();
    const errorSql = errorMessage.replace(/'/g, "''");
    
    this.run(`
      UPDATE tasks 
      SET status = 'FAILED', error_message = '${errorSql}', updated_at = ${now}
      WHERE id = ${taskId}
    `);
    
    const tasks = this.query<Task>(`SELECT assigned_worker FROM tasks WHERE id = ${taskId}`);
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

  /**
   * Get task by ID
   */
  public getTask(taskId: number): Task | null {
    const result = this.query<Task>(`SELECT * FROM tasks WHERE id = ${taskId}`);
    return result[0] ?? null;
  }

  /**
   * Get all tasks
   */
  public getAllTasks(): Task[] {
    return this.query<Task>(`SELECT * FROM tasks ORDER BY id`);
  }

  /**
   * Get tasks by status
   */
  public getTasksByStatus(status: TaskStatus): Task[] {
    return this.query<Task>(`SELECT * FROM tasks WHERE status = '${status}' ORDER BY id`);
  }

  /**
   * Get pending task count for a layer
   */
  public getPendingTaskCount(layer?: number): number {
    const layerFilter = layer !== undefined ? `AND layer = ${layer}` : '';
    const result = this.query<{count: number}>(`
      SELECT COUNT(*) as count FROM tasks WHERE status = 'UNASSIGNED' ${layerFilter}
    `);
    return result[0]?.count ?? 0;
  }

  // ===========================================================================
  // WORKER OPERATIONS
  // ===========================================================================

  /**
   * Register a new worker
   */
  public registerWorker(
    uid: string,
    folderName: string,
    folderPath: string,
    role: string,
    layer: number,
    parentUid?: string
  ): void {
    const now = this.now();
    const parentSql = parentUid ? `'${parentUid}'` : 'NULL';
    
    this.run(`
      INSERT INTO workers (uid, folder_name, folder_path, role, layer, parent_uid, created_at)
      VALUES ('${uid}', '${folderName}', '${folderPath.replace(/'/g, "''")}', '${role}', ${layer}, ${parentSql}, ${now})
    `);
    
    this.logEvent('WORKER_SPAWNED', uid);
  }

  /**
   * Update worker status
   */
  public updateWorkerStatus(uid: string, status: WorkerStatus, errorMessage?: string): void {
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
    
    const eventType = status === 'ERROR' ? 'WORKER_ERROR' : 
                      status === 'DONE' ? 'WORKER_DONE' :
                      status === 'SHUTDOWN' ? 'WORKER_SHUTDOWN' : null;
    if (eventType) {
      this.logEvent(eventType, uid, null, errorMessage);
    }
  }

  /**
   * Record worker heartbeat
   */
  public heartbeat(uid: string): void {
    const now = this.now();
    this.run(`UPDATE workers SET last_heartbeat = ${now} WHERE uid = '${uid}'`);
  }

  /**
   * Get worker by UID
   */
  public getWorker(uid: string): Worker | null {
    const result = this.query<Worker>(`SELECT * FROM workers WHERE uid = '${uid}'`);
    return result[0] ?? null;
  }

  /**
   * Get all workers
   */
  public getAllWorkers(): Worker[] {
    return this.query<Worker>(`SELECT * FROM workers ORDER BY layer, uid`);
  }

  /**
   * Get workers by status
   */
  public getWorkersByStatus(status: WorkerStatus): Worker[] {
    return this.query<Worker>(`SELECT * FROM workers WHERE status = '${status}' ORDER BY layer, uid`);
  }

  /**
   * Get children of a worker
   */
  public getChildren(parentUid: string): Worker[] {
    return this.query<Worker>(`SELECT * FROM workers WHERE parent_uid = '${parentUid}' ORDER BY uid`);
  }

  /**
   * Get unresponsive workers (no heartbeat for N seconds)
   */
  public getUnresponsiveWorkers(thresholdSeconds: number = 90): Worker[] {
    const cutoff = this.now() - thresholdSeconds;
    return this.query<Worker>(`
      SELECT * FROM workers 
      WHERE status NOT IN ('DONE', 'SHUTDOWN', 'ERROR', 'QUEUED')
        AND last_heartbeat IS NOT NULL
        AND last_heartbeat < ${cutoff}
      ORDER BY last_heartbeat
    `);
  }

  // ===========================================================================
  // SLOT OPERATIONS
  // ===========================================================================

  /**
   * Initialize slots
   */
  public initSlots(count: number): void {
    for (let i = 1; i <= count; i++) {
      this.run(`INSERT OR IGNORE INTO slots (slot_id) VALUES (${i})`);
    }
    this.setProjectMeta('max_slots', count.toString());
  }

  /**
   * Assign a slot to a worker
   */
  public assignSlot(workerUid: string): number | null {
    const now = this.now();
    
    // Find free slot
    const slots = this.query<{slot_id: number}>(`
      SELECT slot_id FROM slots WHERE worker_uid IS NULL ORDER BY slot_id LIMIT 1
    `);
    
    if (slots.length === 0) return null;
    
    const slotId = slots[0].slot_id;
    
    this.run(`
      UPDATE slots SET worker_uid = '${workerUid}', assigned_at = ${now}
      WHERE slot_id = ${slotId}
    `);
    
    this.run(`
      UPDATE workers SET slot_id = ${slotId}, status = 'SLOT_ASSIGNED'
      WHERE uid = '${workerUid}'
    `);
    
    this.logEvent('SLOT_ASSIGNED', workerUid, null, `slot_id: ${slotId}`);
    return slotId;
  }

  /**
   * Release a slot
   */
  public releaseSlot(slotId: number): void {
    const slots = this.query<{worker_uid: string}>(`
      SELECT worker_uid FROM slots WHERE slot_id = ${slotId}
    `);
    const workerUid = slots[0]?.worker_uid;
    
    this.run(`UPDATE slots SET worker_uid = NULL, assigned_at = NULL WHERE slot_id = ${slotId}`);
    
    if (workerUid) {
      this.run(`UPDATE workers SET slot_id = NULL WHERE uid = '${workerUid}'`);
      this.logEvent('SLOT_RELEASED', workerUid, null, `slot_id: ${slotId}`);
    }
  }

  /**
   * Get slot usage
   */
  public getSlotUsage(): { used: number; total: number } {
    const used = this.query<{count: number}>(`
      SELECT COUNT(*) as count FROM slots WHERE worker_uid IS NOT NULL
    `);
    const total = this.query<{count: number}>(`SELECT COUNT(*) as count FROM slots`);
    
    return {
      used: used[0]?.count ?? 0,
      total: total[0]?.count ?? 0,
    };
  }

  // ===========================================================================
  // EVENT LOGGING
  // ===========================================================================

  /**
   * Log an event
   */
  public logEvent(
    eventType: EventType,
    workerUid?: string | null,
    taskId?: number | null,
    details?: string
  ): void {
    const now = this.now();
    const workerSql = workerUid ? `'${workerUid}'` : 'NULL';
    const taskSql = taskId ? taskId : 'NULL';
    const detailsSql = details ? `'${details.replace(/'/g, "''")}'` : 'NULL';
    
    this.run(`
      INSERT INTO events (timestamp, event_type, worker_uid, task_id, details)
      VALUES (${now}, '${eventType}', ${workerSql}, ${taskSql}, ${detailsSql})
    `);
  }

  /**
   * Get recent events
   */
  public getRecentEvents(limit: number = 50): Event[] {
    return this.query<Event>(`SELECT * FROM events ORDER BY timestamp DESC LIMIT ${limit}`);
  }

  /**
   * Get events for a worker
   */
  public getWorkerEvents(workerUid: string, limit: number = 50): Event[] {
    return this.query<Event>(`
      SELECT * FROM events WHERE worker_uid = '${workerUid}'
      ORDER BY timestamp DESC LIMIT ${limit}
    `);
  }

  // ===========================================================================
  // PROJECT METADATA
  // ===========================================================================

  /**
   * Set project metadata
   */
  public setProjectMeta(key: string, value: string): void {
    this.run(`
      INSERT OR REPLACE INTO project (key, value) VALUES ('${key}', '${value.replace(/'/g, "''")}')
    `);
  }

  /**
   * Get project metadata
   */
  public getProjectMeta(key: string): string | null {
    const result = this.query<{value: string}>(`SELECT value FROM project WHERE key = '${key}'`);
    return result[0]?.value ?? null;
  }

  /**
   * Get all project metadata
   */
  public getAllProjectMeta(): Record<string, string> {
    const rows = this.query<{key: string; value: string}>(`SELECT * FROM project`);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  // ===========================================================================
  // DASHBOARD STATS
  // ===========================================================================

  /**
   * Get dashboard statistics
   */
  public getDashboardStats(): DashboardStats {
    const workers = this.getAllWorkers();
    const tasks = this.getAllTasks();
    const slots = this.getSlotUsage();
    const unresponsive = this.getUnresponsiveWorkers();
    
    const workersByStatus: Record<WorkerStatus, number> = {
      QUEUED: 0,
      SLOT_ASSIGNED: 0,
      IDLE: 0,
      WORKING: 0,
      AWAITING_SUBORDINATES: 0,
      DONE: 0,
      ERROR: 0,
      SHUTDOWN: 0,
    };
    
    for (const w of workers) {
      workersByStatus[w.status]++;
    }
    
    return {
      total_workers: workers.length,
      workers_by_status: workersByStatus,
      total_tasks: tasks.length,
      tasks_done: tasks.filter(t => t.status === 'DONE').length,
      tasks_processing: tasks.filter(t => t.status === 'PROCESSING').length,
      tasks_pending: tasks.filter(t => t.status === 'UNASSIGNED').length,
      tasks_failed: tasks.filter(t => t.status === 'FAILED').length,
      slots_used: slots.used,
      slots_total: slots.total,
      unresponsive_workers: unresponsive.map(w => w.uid),
    };
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Close database (cleanup WAL files)
   */
  public close(): void {
    this.run('PRAGMA wal_checkpoint(TRUNCATE)');
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let _db: RuntimeDatabase | null = null;

/**
 * Get or create the runtime database instance
 */
export function getRuntimeDatabase(ceoFolderPath: string): RuntimeDatabase {
  if (!_db) {
    const dbPath = path.join(ceoFolderPath, 'runtime.db');
    _db = new RuntimeDatabase(dbPath);
  }
  return _db;
}

/**
 * Reset database instance (for testing)
 */
export function resetRuntimeDatabase(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
