# RuntimeDatabase API Documentation

## Overview

The `RuntimeDatabase` class is a SQLite-based runtime state management system for ADG-Parallels. It provides centralized coordination for parallel task execution with concurrent window access using WAL (Write-Ahead Logging) mode.

**Key Features:**
- Atomic task claiming for safe concurrent access
- Worker registry with heartbeat monitoring
- Slot-based concurrency control
- Comprehensive event audit logging
- Project metadata storage

---

## Core Types

### TaskStatus
```typescript
type TaskStatus = 'UNASSIGNED' | 'PROCESSING' | 'DONE' | 'FAILED';
```

### WorkerStatus
```typescript
type WorkerStatus =
  | 'QUEUED'          // Worker created, waiting for slot
  | 'SLOT_ASSIGNED'   // Slot allocated, not yet started
  | 'IDLE'            // Active but not processing a task
  | 'WORKING'         // Currently executing a task
  | 'AWAITING_SUBORDINATES'  // Waiting for child workers
  | 'DONE'            // Completed successfully
  | 'ERROR'           // Failed with error
  | 'SHUTDOWN';       // Terminated
```

### Task Interface
```typescript
interface Task {
  id: number;                    // Unique task identifier
  layer: number;                 // Hierarchy layer (0 = CEO)
  payload: string | null;        // Task instructions
  status: TaskStatus;            // Current status
  assigned_worker: string | null; // Worker UID if claimed
  result_path: string | null;    // Output file path
  error_message: string | null;  // Error details if failed
  created_at: number;            // Unix timestamp
  updated_at: number;            // Unix timestamp
}
```

### Worker Interface
```typescript
interface Worker {
  uid: string;                   // Unique worker identifier
  folder_name: string;           // Worker folder name
  folder_path: string;           // Absolute path to worker folder
  role: string;                  // Worker role (e.g., "STRATOP")
  layer: number;                 // Hierarchy layer
  parent_uid: string | null;     // Parent worker UID
  status: WorkerStatus;          // Current status
  slot_id: number | null;        // Assigned slot ID
  last_heartbeat: number | null; // Last heartbeat timestamp
  tasks_completed: number;       // Count of completed tasks
  tasks_failed: number;          // Count of failed tasks
  created_at: number;            // Creation timestamp
  started_at: number | null;     // First activity timestamp
  completed_at: number | null;   // Completion timestamp
  current_task_id: number | null; // Currently processing task
  error_message: string | null;  // Error details
}
```

---

## Constructor & Initialization

### `constructor(dbPath: string)`
Creates a new RuntimeDatabase instance.

**Parameters:**
- `dbPath` - Absolute path to the SQLite database file

**Example:**
```typescript
const db = new RuntimeDatabase('d:/project/.adg-parallels_CEO/runtime.db');
```

### `async init(): Promise<void>`
Initializes the database schema. Creates all tables, indexes, and enables WAL mode.

**Must be called before any other operations.**

**Example:**
```typescript
await db.init();
```

### `getPath(): string`
Returns the absolute path to the database file.

---

## Task Operations

### `createTask(layer: number, payload?: string): number`
Creates a new task in the queue.

**Parameters:**
- `layer` - Hierarchy layer (0 = CEO, 1 = first level subordinates)
- `payload` - Optional task instructions/data

**Returns:** Task ID

**Events:** Logs `TASK_CREATED` event

**Example:**
```typescript
const taskId = db.createTask(1, 'Analyze src/core/runtime-database.ts');
```

### `createTasks(layer: number, payloads: string[]): number[]`
Bulk creates multiple tasks at once.

**Parameters:**
- `layer` - Hierarchy layer for all tasks
- `payloads` - Array of task instruction strings

**Returns:** Array of created task IDs

**Example:**
```typescript
const ids = db.createTasks(1, [
  'Document file A',
  'Document file B',
  'Document file C'
]);
```

### `claimTask(workerUid: string, layer?: number): Task | null`
Atomically claims the next available task for a worker. This operation is thread-safe.

**Parameters:**
- `workerUid` - Unique identifier of the claiming worker
- `layer` - Optional layer filter (claims only from specified layer)

**Returns:** Task object if available, null if no tasks found

**Side Effects:**
- Updates task status to `PROCESSING`
- Sets task's `assigned_worker`
- Updates worker's `current_task_id`
- Sets worker status to `WORKING`

**Events:** Logs `TASK_CLAIMED` event

**Example:**
```typescript
const task = db.claimTask('U00002', 1);
if (task) {
  console.log(`Claimed task ${task.id}: ${task.payload}`);
}
```

### `completeTask(taskId: number, resultPath?: string): void`
Marks a task as successfully completed.

**Parameters:**
- `taskId` - ID of the task to complete
- `resultPath` - Optional path to result/output file

**Side Effects:**
- Updates task status to `DONE`
- Increments worker's `tasks_completed` counter
- Clears worker's `current_task_id`
- Sets worker status to `IDLE`

**Events:** Logs `TASK_DONE` event

**Example:**
```typescript
db.completeTask(42, './output/runtime-database-docs.md');
```

### `failTask(taskId: number, errorMessage: string): void`
Marks a task as failed with an error message.

**Parameters:**
- `taskId` - ID of the failed task
- `errorMessage` - Description of the failure

**Side Effects:**
- Updates task status to `FAILED`
- Stores error message
- Increments worker's `tasks_failed` counter
- Clears worker's `current_task_id`
- Sets worker status to `IDLE`

**Events:** Logs `TASK_FAILED` event

**Example:**
```typescript
db.failTask(42, 'Source file not found');
```

### `getTask(taskId: number): Task | null`
Retrieves a task by ID.

**Returns:** Task object or null if not found

### `getAllTasks(): Task[]`
Retrieves all tasks ordered by ID.

### `getTasksByStatus(status: TaskStatus): Task[]`
Retrieves all tasks with a specific status.

**Example:**
```typescript
const pending = db.getTasksByStatus('UNASSIGNED');
console.log(`${pending.length} tasks waiting`);
```

### `getPendingTaskCount(layer?: number): number`
Counts unassigned tasks, optionally filtered by layer.

**Parameters:**
- `layer` - Optional layer filter

**Returns:** Count of pending tasks

---

## Worker Operations

### `registerWorker(uid: string, folderName: string, folderPath: string, role: string, layer: number, parentUid?: string): void`
Registers a new worker in the system.

**Parameters:**
- `uid` - Unique worker identifier (e.g., "U00002")
- `folderName` - Worker folder name
- `folderPath` - Absolute path to worker folder
- `role` - Worker role designation (e.g., "STRATOP")
- `layer` - Hierarchy layer
- `parentUid` - Optional parent worker UID

**Events:** Logs `WORKER_SPAWNED` event

**Example:**
```typescript
db.registerWorker(
  'U00002',
  '.adg-parallels_STRATOP_W0_S1_U00002',
  'd:/project/.adg-parallels_CEO/.adg-parallels_STRATOP_W0_S1_U00002',
  'STRATOP',
  1,
  'U00001'
);
```

### `updateWorkerStatus(uid: string, status: WorkerStatus, errorMessage?: string): void`
Updates a worker's status.

**Parameters:**
- `uid` - Worker UID
- `status` - New status
- `errorMessage` - Optional error message (for ERROR status)

**Side Effects:**
- Updates `last_heartbeat` timestamp
- Sets `started_at` on first activity (SLOT_ASSIGNED or WORKING)
- Sets `completed_at` on termination (DONE or SHUTDOWN)

**Events:** Logs status-specific events (WORKER_ERROR, WORKER_DONE, WORKER_SHUTDOWN)

### `heartbeat(uid: string): void`
Records a heartbeat timestamp for a worker. Used to detect unresponsive workers.

**Recommended:** Call every 30-60 seconds from active workers

**Example:**
```typescript
setInterval(() => db.heartbeat('U00002'), 30000);
```

### `getWorker(uid: string): Worker | null`
Retrieves a worker by UID.

### `getAllWorkers(): Worker[]`
Retrieves all workers ordered by layer and UID.

### `getWorkersByStatus(status: WorkerStatus): Worker[]`
Retrieves all workers with a specific status.

### `getChildren(parentUid: string): Worker[]`
Retrieves all child workers of a parent.

**Example:**
```typescript
const children = db.getChildren('U00001');
console.log(`CEO has ${children.length} subordinates`);
```

### `getUnresponsiveWorkers(thresholdSeconds: number = 90): Worker[]`
Identifies workers that haven't sent a heartbeat recently.

**Parameters:**
- `thresholdSeconds` - Heartbeat timeout threshold (default: 90)

**Returns:** Array of unresponsive workers

---

## Slot Operations

Slots control concurrency by limiting the number of simultaneous active workers.

### `initSlots(count: number): void`
Initializes the slot system with a maximum number of concurrent slots.

**Parameters:**
- `count` - Maximum number of concurrent worker slots

**Example:**
```typescript
db.initSlots(4); // Allow 4 concurrent workers
```

### `assignSlot(workerUid: string): number | null`
Assigns an available slot to a worker.

**Parameters:**
- `workerUid` - Worker requesting a slot

**Returns:** Slot ID if available, null if all slots occupied

**Side Effects:**
- Updates worker's `slot_id`
- Sets worker status to `SLOT_ASSIGNED`

**Events:** Logs `SLOT_ASSIGNED` event

**Example:**
```typescript
const slotId = db.assignSlot('U00002');
if (slotId) {
  console.log(`Assigned slot ${slotId}`);
} else {
  console.log('No slots available, waiting...');
}
```

### `releaseSlot(slotId: number): void`
Releases a slot back to the pool.

**Parameters:**
- `slotId` - Slot to release

**Side Effects:**
- Clears worker's `slot_id`

**Events:** Logs `SLOT_RELEASED` event

### `getSlotUsage(): { used: number; total: number }`
Returns current slot utilization.

**Returns:** Object with `used` and `total` slot counts

**Example:**
```typescript
const { used, total } = db.getSlotUsage();
console.log(`Slots: ${used}/${total}`);
```

---

## Event Logging

All significant operations are logged to the events table for audit trails.

### `logEvent(eventType: EventType, workerUid?: string | null, taskId?: number | null, details?: string): void`
Manually logs an event.

**Parameters:**
- `eventType` - Event type from EventType enum
- `workerUid` - Optional worker UID
- `taskId` - Optional task ID
- `details` - Optional additional details

**Note:** Most operations automatically log events; manual logging is rarely needed.

### `getRecentEvents(limit: number = 50): Event[]`
Retrieves recent events ordered by timestamp (newest first).

**Parameters:**
- `limit` - Maximum number of events to return (default: 50)

### `getWorkerEvents(workerUid: string, limit: number = 50): Event[]`
Retrieves events for a specific worker.

---

## Project Metadata

Key-value storage for project configuration.

### `setProjectMeta(key: string, value: string): void`
Sets a metadata value.

**Example:**
```typescript
db.setProjectMeta('project_name', 'Code Documentation Sprint');
db.setProjectMeta('created_by', 'ADG-Parallels v1.0');
```

### `getProjectMeta(key: string): string | null`
Retrieves a metadata value by key.

**Returns:** Value string or null if key not found

### `getAllProjectMeta(): Record<string, string>`
Retrieves all metadata as a key-value object.

---

## Dashboard & Statistics

### `getDashboardStats(): DashboardStats`
Computes comprehensive project statistics.

**Returns:** Object containing:
- `total_workers` - Total worker count
- `workers_by_status` - Breakdown by each status
- `total_tasks` - Total task count
- `tasks_done` - Completed task count
- `tasks_processing` - In-progress task count
- `tasks_pending` - Unassigned task count
- `tasks_failed` - Failed task count
- `slots_used` - Currently occupied slots
- `slots_total` - Maximum slots
- `unresponsive_workers` - Array of unresponsive worker UIDs

**Example:**
```typescript
const stats = db.getDashboardStats();
console.log(`Progress: ${stats.tasks_done}/${stats.total_tasks}`);
console.log(`Active workers: ${stats.workers_by_status.WORKING}`);
```

---

## Cleanup

### `close(): void`
Closes the database and truncates WAL files.

**Should be called when shutting down the system.**

**Example:**
```typescript
process.on('exit', () => db.close());
```

---

## Factory Functions

### `getRuntimeDatabase(ceoFolderPath: string): RuntimeDatabase`
Gets or creates a singleton database instance for a CEO folder.

**Parameters:**
- `ceoFolderPath` - Absolute path to CEO folder (database will be at `{ceoFolderPath}/runtime.db`)

**Returns:** RuntimeDatabase instance

**Example:**
```typescript
import { getRuntimeDatabase } from './runtime-database';

const db = getRuntimeDatabase('d:/project/.adg-parallels_CEO');
await db.init();
```

### `resetRuntimeDatabase(): void`
Resets the singleton instance (primarily for testing).

---

## Usage Pattern: Worker Execution Loop

```typescript
import { getRuntimeDatabase } from './runtime-database';

const workerUid = 'U00002';
const ceoPath = 'd:/project/.adg-parallels_CEO';

async function workerLoop() {
  const db = getRuntimeDatabase(ceoPath);
  await db.init();

  while (true) {
    // Claim next task
    const task = db.claimTask(workerUid, 1);
    
    if (!task) {
      console.log('No tasks available, exiting...');
      break;
    }

    console.log(`Processing task ${task.id}: ${task.payload}`);

    try {
      // Execute task logic here
      const result = await executeTask(task);
      
      // Mark complete
      db.completeTask(task.id, result.path);
    } catch (error) {
      // Mark failed
      db.failTask(task.id, error.message);
    }

    // Heartbeat
    db.heartbeat(workerUid);
  }

  // Cleanup
  db.updateWorkerStatus(workerUid, 'DONE');
  db.close();
}

workerLoop();
```

---

## Database Schema

The database uses SQLite with the following tables:

- **tasks** - Task queue with atomic claiming
- **workers** - Worker registry and status tracking
- **slots** - Concurrency control via slot allocation
- **events** - Comprehensive audit log
- **project** - Key-value metadata storage

**Important:** WAL mode is enabled for concurrent read/write access across multiple processes.

---

## Thread Safety

The database is designed for concurrent access:

- **Atomic operations:** Task claiming uses SQLite's RETURNING clause for atomic updates
- **WAL mode:** Allows concurrent readers and one writer
- **Busy timeout:** 5-second timeout prevents lock contention errors
- **No transactions needed:** Individual operations are atomic

**Safe for:** Multiple worker processes accessing the same database simultaneously.

---

## Performance Notes

- Task claiming is O(1) with indexes
- All queries use prepared statements (via JSON output mode)
- Indexes optimize common queries (status, layer, parent lookups)
- Event log grows unbounded - consider periodic archival for long-running projects

---

## Error Handling

All database operations may throw errors:
- File system errors (permissions, disk full)
- SQLite errors (schema violations, constraints)
- SQL syntax errors (escaped strings, invalid queries)

**Recommendation:** Wrap all database calls in try-catch blocks and use `failTask()` to report errors.

---

*Generated for ADG-Parallels Runtime Database v1.0*
