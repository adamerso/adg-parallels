# TaskManager Module Documentation

> **Source File:** `src/core/task-manager.ts`  
> **Purpose:** Manages task lifecycle, assignment, and pipeline operations for ADG-Parallels

---

## Overview

The `TaskManager` class is the central component for managing tasks in the ADG-Parallels system. It provides:

- **Task CRUD operations** - Create, read, update, and delete tasks
- **Task claiming and assignment** - Workers can claim available tasks
- **Pipeline stage management** - Multi-stage task workflows with audit support
- **Dual format support** - Both XML and JSON task file formats
- **Concurrency safety** - File locking for safe multi-worker access
- **Statistics tracking** - Real-time task progress monitoring

---

## Table of Contents

1. [Class: TaskManager](#class-taskmanager)
2. [Core Methods](#core-methods)
3. [Task Claiming Operations](#task-claiming-operations)
4. [Task Completion Operations](#task-completion-operations)
5. [Pipeline Stage Operations](#pipeline-stage-operations)
6. [Audit Operations](#audit-operations)
7. [Utility Functions](#utility-functions)
8. [Types and Interfaces](#types-and-interfaces)

---

## Class: TaskManager

```typescript
class TaskManager {
  constructor(tasksFilePath: string, adapter?: ProjectAdapter)
}
```

### Constructor Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tasksFilePath` | `string` | Yes | Path to the tasks file (XML or JSON format) |
| `adapter` | `ProjectAdapter` | No | Optional adapter for pipeline stage definitions |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `tasksFilePath` | `string` | Path to the tasks data file |
| `isXmlFormat` | `boolean` | Whether the file uses XML format (determined by extension) |
| `adapter` | `ProjectAdapter \| undefined` | Pipeline configuration adapter |

---

## Core Methods

### `getAllTasks()`

Retrieves all tasks from the project.

```typescript
async getAllTasks(): Promise<Task[]>
```

**Returns:** Array of all tasks in the project.

**Example:**
```typescript
const manager = new TaskManager('/path/to/tasks.xml');
const tasks = await manager.getAllTasks();
console.log(`Found ${tasks.length} tasks`);
```

---

### `getTasksByStatus(status)`

Retrieves tasks filtered by their status.

```typescript
async getTasksByStatus(status: TaskStatus): Promise<Task[]>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | `TaskStatus` | Status to filter by (`pending`, `processing`, `task_completed`, etc.) |

**Returns:** Array of tasks matching the specified status.

---

### `getTask(taskId)`

Retrieves a specific task by its ID.

```typescript
async getTask(taskId: number): Promise<Task | null>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `taskId` | `number` | Unique identifier of the task |

**Returns:** The task object or `null` if not found.

---

### `addTask(task)`

Adds a new task to the project.

```typescript
async addTask(task: Omit<Task, 'id' | 'retryCount'>): Promise<Task | null>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `task` | `Omit<Task, 'id' \| 'retryCount'>` | Task data without auto-generated fields |

**Returns:** The created task with assigned ID, or `null` on failure.

**Example:**
```typescript
const newTask = await manager.addTask({
  type: 'documentation',
  title: 'Document API',
  description: 'Create API documentation for module X',
  status: 'pending',
  maxRetries: 3
});
```

---

### `addTasks(tasks)`

Adds multiple tasks in a single operation (bulk insert).

```typescript
async addTasks(tasks: Array<Omit<Task, 'id' | 'retryCount'>>): Promise<Task[]>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tasks` | `Array<Omit<Task, 'id' \| 'retryCount'>>` | Array of task data |

**Returns:** Array of created tasks with assigned IDs.

---

### `updateTaskStatus(taskId, status, workerId?)`

Updates the status of a task.

```typescript
async updateTaskStatus(
  taskId: number,
  status: TaskStatus,
  workerId?: string
): Promise<boolean>
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | `number` | Yes | ID of the task to update |
| `status` | `TaskStatus` | Yes | New status value |
| `workerId` | `string` | No | If provided, verifies task ownership |

**Returns:** `true` on success, `false` on failure.

---

## Task Claiming Operations

### `claimNextTask(workerId)`

Finds and claims the first available pending task for a worker.

```typescript
async claimNextTask(workerId: string): Promise<Task | null>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `workerId` | `string` | Unique identifier of the claiming worker |

**Returns:** The claimed task or `null` if no tasks are available.

**Behavior:**
1. Uses file locking to prevent race conditions
2. Finds the first task with `pending` status
3. Updates status to `processing`
4. Sets `assignedWorker` to the claiming worker
5. Records `startedAt` timestamp

**Example:**
```typescript
const task = await manager.claimNextTask('worker-001');
if (task) {
  console.log(`Claimed task: ${task.title}`);
  // Process the task...
}
```

---

### `releaseTask(taskId, workerId)`

Releases a claimed task back to the pending queue.

```typescript
async releaseTask(taskId: number, workerId: string): Promise<boolean>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `taskId` | `number` | ID of the task to release |
| `workerId` | `string` | Worker releasing the task (must match assignee) |

**Returns:** `true` on success, `false` on failure.

**Note:** Only the assigned worker can release a task.

---

### `releaseWorkerTasks(workerId)`

Releases all tasks assigned to a worker (useful for cleanup on crash).

```typescript
async releaseWorkerTasks(workerId: string): Promise<number>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `workerId` | `string` | Worker ID to release tasks from |

**Returns:** Number of tasks released.

---

### `getWorkerTasks(workerId)`

Gets all tasks assigned to a specific worker.

```typescript
async getWorkerTasks(workerId: string): Promise<Task[]>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `workerId` | `string` | Worker ID to filter by |

**Returns:** Array of tasks assigned to the worker.

---

## Task Completion Operations

### `completeTask(taskId, workerId, outputFile?)`

Marks a task as successfully completed.

```typescript
async completeTask(
  taskId: number,
  workerId: string,
  outputFile?: string
): Promise<boolean>
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | `number` | Yes | ID of the task to complete |
| `workerId` | `string` | Yes | Worker completing the task (must match assignee) |
| `outputFile` | `string` | No | Path to the output file produced |

**Returns:** `true` on success, `false` on failure.

**Behavior:**
- Sets status to `task_completed`
- Records `completedAt` timestamp
- Stores optional output file path

---

### `failTask(taskId, workerId, error)`

Marks a task as failed with an error message.

```typescript
async failTask(
  taskId: number,
  workerId: string,
  error: string
): Promise<boolean>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `taskId` | `number` | ID of the task that failed |
| `workerId` | `string` | Worker reporting the failure |
| `error` | `string` | Error message describing the failure |

**Returns:** `true` on success, `false` on failure.

**Behavior:**
- Increments `retryCount`
- If retries remaining and `retryOnFailed` is enabled:
  - Status set to `pending` (for retry)
  - Worker assignment cleared
- Otherwise:
  - Status set to `audit_failed`
  - `completedAt` timestamp recorded

---

## Pipeline Stage Operations

These methods support multi-stage task workflows (v0.3.0+).

### `getPipelineTask(taskId)`

Gets a task with its pipeline stage information.

```typescript
async getPipelineTask(taskId: number): Promise<PipelineTask | null>
```

**Returns:** Task with `currentStageId`, `stageHistory`, and `stageOutputs`.

---

### `claimNextStage(workerId)`

Claims the next available claimable stage from any task.

```typescript
async claimNextStage(workerId: string): Promise<PipelineTask | null>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `workerId` | `string` | Worker claiming the stage |

**Returns:** Task with claimed stage, or `null` if none available.

**Requirements:** Requires an adapter to be set for pipeline stage definitions.

---

### `advanceToNextStage(taskId, workerId, nextStageId, stageOutput?)`

Advances a task to the next pipeline stage.

```typescript
async advanceToNextStage(
  taskId: number,
  workerId: string,
  nextStageId: string,
  stageOutput?: string
): Promise<boolean>
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | `number` | Yes | Task ID |
| `workerId` | `string` | Yes | Worker ID (must own task) |
| `nextStageId` | `string` | Yes | ID of the next stage |
| `stageOutput` | `string` | No | Output produced by current stage |

**Behavior:**
- Updates stage history with completion timestamp
- Saves stage output if provided
- If next stage is terminal: marks task completed/failed
- If next stage is claimable: worker continues
- If next stage is wait stage: releases task

---

### `getTasksAtStage(stageId)`

Gets all tasks currently at a specific pipeline stage.

```typescript
async getTasksAtStage(stageId: string): Promise<PipelineTask[]>
```

---

### `getStageOutput(taskId, stageId)`

Retrieves the output from a specific stage of a task.

```typescript
async getStageOutput(taskId: number, stageId: string): Promise<string | null>
```

---

### `setAuditFeedback(taskId, feedback, restartStageId)`

Sets audit feedback and restarts task from a specific stage.

```typescript
async setAuditFeedback(
  taskId: number,
  feedback: string,
  restartStageId: string
): Promise<boolean>
```

---

### `clearAuditFeedback(taskId)`

Clears audit feedback when a task is picked up for retry.

```typescript
async clearAuditFeedback(taskId: number): Promise<boolean>
```

---

## Audit Operations

### `createAuditTask(originalTaskId, outputContent?)`

Creates an audit task for a completed task.

```typescript
async createAuditTask(
  originalTaskId: number,
  outputContent?: string
): Promise<Task | null>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `originalTaskId` | `number` | ID of the task to audit |
| `outputContent` | `string` | Optional output content to include (truncated to 5000 chars) |

**Returns:** The created audit task, or `null` on failure.

---

### `processAuditResult(auditTaskId, passed, reason?)`

Processes the result of an audit and updates the original task.

```typescript
async processAuditResult(
  auditTaskId: number,
  passed: boolean,
  reason?: string
): Promise<boolean>
```

---

### `getTasksReadyForAudit()`

Gets all tasks that are completed but not yet audited.

```typescript
async getTasksReadyForAudit(): Promise<Task[]>
```

---

## Subtask Operations

### `getSubtasks(parentTaskId)`

Gets all subtasks for a parent task.

```typescript
async getSubtasks(parentTaskId: number): Promise<Task[]>
```

---

### `areSubtasksComplete(parentTaskId)`

Checks if all subtasks of a parent are completed.

```typescript
async areSubtasksComplete(parentTaskId: number): Promise<boolean>
```

---

### `getSubtaskOutputs(parentTaskId)`

Gets output paths from all completed subtasks.

```typescript
async getSubtaskOutputs(parentTaskId: number): Promise<string[]>
```

---

### `linkSubtasksToParent(parentTaskId, subtaskIds)`

Links subtask IDs to a parent task.

```typescript
async linkSubtasksToParent(
  parentTaskId: number,
  subtaskIds: number[]
): Promise<boolean>
```

---

## Statistics Methods

### `getStats()`

Gets project statistics.

```typescript
async getStats(): Promise<TaskStats | null>
```

**Returns:**
```typescript
{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}
```

---

### `getConfig()`

Gets project configuration.

```typescript
async getConfig(): Promise<ProjectConfig | null>
```

---

### `isAllCompleted()`

Checks if all tasks are completed.

```typescript
async isAllCompleted(): Promise<boolean>
```

---

### `hasPendingTasks()`

Checks if there are any pending tasks.

```typescript
async hasPendingTasks(): Promise<boolean>
```

---

## Utility Functions

### `findTasksFile(managementDir)`

Finds a tasks file in a directory.

```typescript
function findTasksFile(managementDir: string): string | null
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `managementDir` | `string` | Directory to search in |

**Returns:** Path to the tasks file, or `null` if not found.

**Search Order:**
1. `tasks.xml` in the directory
2. Any file matching `project_*_tasks.xml`

---

### `createProjectTasks(filePath, projectCodename, config, initialTasks?)`

Creates a new project tasks file.

```typescript
function createProjectTasks(
  filePath: string,
  projectCodename: string,
  config: Partial<ProjectConfig>,
  initialTasks?: Array<Omit<Task, 'id' | 'retryCount' | 'maxRetries'>>
): boolean
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filePath` | `string` | Yes | Path where file will be created |
| `projectCodename` | `string` | Yes | Project identifier |
| `config` | `Partial<ProjectConfig>` | Yes | Project configuration |
| `initialTasks` | `Array<...>` | No | Initial tasks to add |

**Returns:** `true` on success, `false` on failure.

---

## Types and Interfaces

### TaskStatus

```typescript
type TaskStatus = 
  | 'pending'
  | 'processing'
  | 'task_completed'
  | 'audit_in_progress'
  | 'audit_passed'
  | 'audit_failed';
```

### Task

```typescript
interface Task {
  id: number;
  type: string;
  title: string;
  description?: string;
  status: TaskStatus;
  layer?: number;
  outputDir?: string;
  resourcesDescription?: string;
  continuationPrompt?: string;
  maxContinuationAttempts?: number;
  reportingInstructions?: string;
  assignedWorker?: string;
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  outputFile?: string;
  parentTaskId?: number;
  subtaskIds?: number[];
  params?: Record<string, unknown>;
}
```

### PipelineTask

```typescript
interface PipelineTask extends Task {
  currentStageId: string;
  stageHistory: StageHistoryEntry[];
  stageOutputs: Record<string, string>;
  auditFeedback?: string;
}
```

### StageHistoryEntry

```typescript
interface StageHistoryEntry {
  stageId: string;
  stageName: string;
  workerId: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}
```

### TaskStats

```typescript
interface TaskStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}
```

### ProjectConfig

```typescript
interface ProjectConfig {
  workerCount: number;
  statuses: string[];
  completedStatuses: string[];
  failedStatuses: string[];
  retryOnFailed: boolean;
  outputPattern: string;
}
```

---

## XML Format Support

The TaskManager supports saving tasks in XML format with the following field mappings (v0.4.5+):

| JSON Field | XML Element |
|------------|-------------|
| `description` | `<your_assigned_task>` |
| `outputDir` | `<move_completed_task_artifact_to>` |
| `resourcesDescription` | `<resources_description>` |
| `continuationPrompt` | `<continuation_prompt>` |
| `reportingInstructions` | `<reporting_instructions>` |

---

## Thread Safety

All write operations use file locking via `withLock()` to ensure safe concurrent access from multiple workers. This prevents race conditions when:

- Multiple workers claim tasks simultaneously
- Tasks are completed/failed at the same time
- Statistics are updated concurrently

---

## Usage Example

```typescript
import { TaskManager, createProjectTasks } from './core/task-manager';

// Create a new project
createProjectTasks('/path/to/tasks.xml', 'my-project', {
  workerCount: 4,
  retryOnFailed: true
});

// Initialize manager
const manager = new TaskManager('/path/to/tasks.xml');

// Worker flow
async function workerLoop(workerId: string) {
  while (await manager.hasPendingTasks()) {
    const task = await manager.claimNextTask(workerId);
    if (!task) break;
    
    try {
      // Process the task...
      const output = await processTask(task);
      await manager.completeTask(task.id, workerId, output);
    } catch (error) {
      await manager.failTask(task.id, workerId, error.message);
    }
  }
}
```

---

*Documentation generated by ADG-Parallels Worker U00003*
