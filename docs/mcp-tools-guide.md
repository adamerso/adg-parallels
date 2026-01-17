# ADG-Parallels MCP Tools - User Guide

## Overview

The ADG-Parallels MCP (Model Context Protocol) tools enable GitHub Copilot to interact with the ADG parallel processing system. These tools allow workers to claim tasks, report completion, monitor status, and manage the distributed workflow.

**All MCP tools are prefixed with `mcp_adg-parallels_` when calling them.**

---

## 📋 Core Task Management Tools

### `adg_claim_task`
**Atomically claims the next available task for a worker.**

This is the primary tool workers use to get their next assignment. The operation is thread-safe and ensures no two workers claim the same task.

**Parameters:**
- `workerUid` (required) - Your unique worker identifier (e.g., "U00002")
- `ceoPath` (optional) - Path to CEO folder (auto-detected if in workspace)
- `layer` (optional) - Only claim tasks from a specific layer

**Returns:** Task object with ID, payload, and status, or null if no tasks available

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_claim_task
Parameters:
  workerUid: "U00002"
  ceoPath: "d:/project/.adg-parallels_CEO"
  layer: 1
```

**Returned task structure:**
```json
{
  "id": 42,
  "layer": 1,
  "payload": "Analyze src/core/runtime-database.ts",
  "status": "PROCESSING",
  "assigned_worker": "U00002",
  "result_path": null,
  "error_message": null,
  "created_at": 1234567890,
  "updated_at": 1234567890
}
```

---

### `adg_complete_task`
**Marks a task as successfully completed.**

Call this after finishing your task work. Optionally provide the path to your output file for reference.

**Parameters:**
- `taskId` (required) - ID of the completed task
- `ceoPath` (optional) - Path to CEO folder
- `resultPath` (optional) - Path to your output file (e.g., "output/docs.md")

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_complete_task
Parameters:
  taskId: 42
  resultPath: "output/runtime-database-docs.md"
  ceoPath: "d:/project/.adg-parallels_CEO"
```

---

### `adg_fail_task`
**Marks a task as failed with an error message.**

Use this when you encounter an error that prevents task completion. Provide a clear error message explaining what went wrong.

**Parameters:**
- `taskId` (required) - ID of the failed task
- `errorMessage` (required) - Description of the failure
- `ceoPath` (optional) - Path to CEO folder

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_fail_task
Parameters:
  taskId: 42
  errorMessage: "Source file not found: src/missing-file.ts"
  ceoPath: "d:/project/.adg-parallels_CEO"
```

---

### `adg_create_tasks`
**Creates multiple tasks in bulk.**

Typically used by the CEO or coordinator to populate the task queue. Tasks are created at a specific layer and available for workers to claim.

**Parameters:**
- `layer` (required) - Hierarchy layer (1 = first subordinate level)
- `payloads` (required) - JSON array of task instruction strings
- `ceoPath` (optional) - Path to CEO folder

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_create_tasks
Parameters:
  layer: 1
  payloads: '["Document file A.ts", "Document file B.ts", "Document file C.ts"]'
  ceoPath: "d:/project/.adg-parallels_CEO"
```

**Returns:**
```json
{
  "created": 3,
  "taskIds": [1, 2, 3]
}
```

---

### `adg_list_tasks`
**Lists all tasks with optional filtering.**

View all tasks in the system, optionally filtered by status or layer. Useful for monitoring task progress.

**Parameters:**
- `ceoPath` (optional) - Path to CEO folder
- `status` (optional) - Filter by status: `UNASSIGNED`, `PROCESSING`, `DONE`, `FAILED`
- `layer` (optional) - Filter by layer number (0 = CEO, 1 = subordinates)
- `limit` (optional) - Maximum results to return (default: 50)

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_list_tasks
Parameters:
  status: "UNASSIGNED"
  layer: 1
  limit: 10
```

---

## 📊 Status & Monitoring Tools

### `adg_status`
**Gets comprehensive project status overview.**

This is the first tool you should call to understand the current state. Shows workers, tasks, slots, and progress.

**Parameters:**
- `ceoPath` (optional) - Path to CEO folder (auto-detected)

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_status
```

**Returns:**
```json
{
  "project": {
    "name": "Code Documentation Sprint",
    "created_at": "1234567890",
    "max_slots": "4"
  },
  "workers": {
    "total": 3,
    "byStatus": {
      "IDLE": 1,
      "WORKING": 2,
      "DONE": 0
    },
    "unresponsive": []
  },
  "tasks": {
    "total": 10,
    "pending": 5,
    "processing": 2,
    "done": 3,
    "failed": 0,
    "progressPercent": 30
  },
  "slots": {
    "used": 2,
    "total": 4
  }
}
```

---

### `adg_get_dashboard`
**Gets detailed dashboard statistics.**

More detailed than `adg_status`, includes full breakdown of workers by each status type.

**Parameters:**
- `ceoPath` (optional) - Path to CEO folder

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_get_dashboard
```

**Returns:**
```json
{
  "total_workers": 5,
  "workers_by_status": {
    "QUEUED": 0,
    "SLOT_ASSIGNED": 1,
    "IDLE": 2,
    "WORKING": 2,
    "AWAITING_SUBORDINATES": 0,
    "DONE": 0,
    "ERROR": 0,
    "SHUTDOWN": 0
  },
  "total_tasks": 20,
  "tasks_done": 8,
  "tasks_processing": 4,
  "tasks_pending": 7,
  "tasks_failed": 1,
  "slots_used": 3,
  "slots_total": 4,
  "unresponsive_workers": []
}
```

---

### `adg_get_events`
**Retrieves recent events from the audit log.**

See what happened recently in the project. Useful for debugging and understanding the workflow timeline.

**Parameters:**
- `ceoPath` (optional) - Path to CEO folder
- `workerUid` (optional) - Filter events for a specific worker
- `limit` (optional) - Maximum events to return (default: 50)

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_get_events
Parameters:
  workerUid: "U00002"
  limit: 20
```

**Event types:**
- `TASK_CREATED`, `TASK_CLAIMED`, `TASK_DONE`, `TASK_FAILED`
- `WORKER_SPAWNED`, `WORKER_STARTED`, `WORKER_DONE`, `WORKER_ERROR`
- `SLOT_ASSIGNED`, `SLOT_RELEASED`
- `PROJECT_STARTED`, `PROJECT_STOPPED`

---

## 👷 Worker Management Tools

### `adg_list_workers`
**Lists all workers with their status and stats.**

View all workers in the hierarchy, optionally filtered by status or parent.

**Parameters:**
- `ceoPath` (optional) - Path to CEO folder
- `status` (optional) - Filter by worker status
- `parentUid` (optional) - Show only children of specific worker

**Worker statuses:**
- `QUEUED` - Created, waiting for slot
- `SLOT_ASSIGNED` - Slot allocated, not yet started
- `IDLE` - Active but not processing
- `WORKING` - Currently executing a task
- `AWAITING_SUBORDINATES` - Waiting for child workers
- `DONE` - Completed successfully
- `ERROR` - Failed with error
- `SHUTDOWN` - Terminated

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_list_workers
Parameters:
  status: "WORKING"
```

---

### `adg_worker_heartbeat`
**Sends a heartbeat signal to indicate worker is alive.**

Workers should send heartbeats regularly (every 30-60 seconds) to avoid being marked as unresponsive.

**Parameters:**
- `workerUid` (required) - Your worker UID
- `ceoPath` (optional) - Path to CEO folder

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_worker_heartbeat
Parameters:
  workerUid: "U00002"
```

**Best practice:** Set up periodic heartbeats in long-running workers.

---

### `adg_register_worker`
**Registers a new worker in the project database.**

Used during worker provisioning to add a worker to the registry.

**Parameters:**
- `uid` (required) - Unique worker identifier (e.g., "U00003")
- `folderName` (required) - Worker folder name
- `folderPath` (required) - Absolute path to worker folder
- `role` (required) - Worker role (CEO, STRATOP, DELIVCO, EXESUPP)
- `layer` (required) - Hierarchy layer (0 = CEO, 1+ = subordinates)
- `parentUid` (optional) - Parent worker UID
- `ceoPath` (optional) - Path to CEO folder

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_register_worker
Parameters:
  uid: "U00003"
  folderName: ".adg-parallels_STRATOP_W0_S2_U00003"
  folderPath: "d:/project/.adg-parallels_CEO/.adg-parallels_STRATOP_W0_S2_U00003"
  role: "STRATOP"
  layer: 1
  parentUid: "U00001"
```

---

### `adg_update_worker_status`
**Updates a worker's status.**

Change a worker's state in the database. Used for lifecycle management.

**Parameters:**
- `workerUid` (required) - Worker UID to update
- `status` (required) - New status (see status list above)
- `errorMessage` (optional) - Error details if status is ERROR
- `ceoPath` (optional) - Path to CEO folder

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_update_worker_status
Parameters:
  workerUid: "U00002"
  status: "DONE"
```

---

## 🚀 Project Initialization & Management

### `adg_init_project`
**Initializes a new ADG-Parallels project.**

Creates the runtime database, sets up slots, and configures project metadata. Must be called before any other operations.

**Parameters:**
- `ceoPath` (required) - Path to CEO folder (will be created if needed)
- `projectName` (optional) - Human-readable project name
- `maxSlots` (optional) - Maximum concurrent workers (default: 4)

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_init_project
Parameters:
  ceoPath: "d:/my-project/.adg-parallels_CEO"
  projectName: "Code Review Sprint"
  maxSlots: 4
```

**Creates:**
- `runtime.db` - SQLite database
- Project metadata entries
- Slot allocation table

---

### `adg_provision_worker`
**Provisions a new worker: folder, config, registration, and optional spawn.**

Complete worker setup in one operation. Creates folder structure, generates config files, registers in database, and optionally opens a new VS Code window.

**Parameters:**
- `ceoPath` (optional) - Path to CEO folder (auto-detected)
- `layer` (required) - Worker layer (1+)
- `role` (optional) - Worker role (defaults based on layer)
- `parentUid` (optional) - Parent worker UID (auto-detected)
- `taskInstructions` (optional) - Custom task instructions for worker
- `autoSpawn` (optional) - Open VS Code window automatically (default: true)

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_provision_worker
Parameters:
  layer: 1
  role: "STRATOP"
  taskInstructions: "You are a documentation specialist. Read source files and create comprehensive docs."
  autoSpawn: true
```

**Creates:**
- Worker folder: `.adg-parallels_STRATOP_W0_S1_U00002/`
- `output/` subdirectory
- `worker.xml` configuration
- `.github/copilot-instructions.md` with personalized instructions
- Database registration
- (Optional) New VS Code window

---

### `adg_spawn_worker_window`
**Opens a new VS Code window for a worker folder.**

Manually spawn a VS Code window for an existing worker.

**Parameters:**
- `workerFolderPath` (required) - Absolute path to worker folder

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_spawn_worker_window
Parameters:
  workerFolderPath: "d:/project/.adg-parallels_CEO/.adg-parallels_STRATOP_W0_S1_U00002"
```

---

## 🔧 Development & Extension Tools

### `adg_build_extension`
**Compiles the ADG-Parallels extension and optionally packages VSIX.**

Used for extension development and deployment.

**Parameters:**
- `projectPath` (optional) - Extension project path (auto-detected)
- `packageVsix` (optional) - Also create VSIX package (default: false)

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_build_extension
Parameters:
  packageVsix: true
```

**Actions:**
1. Runs `npm run compile`
2. If `packageVsix=true`, runs `npm run vsix`
3. Returns path to generated VSIX file

---

### `adg_install_vsix`
**Installs or updates the ADG-Parallels extension from VSIX.**

Install a VSIX package into VS Code using the CLI.

**Parameters:**
- `vsixPath` (optional) - Path to VSIX file (auto-detects newest if omitted)
- `force` (optional) - Force reinstall even if same version (default: false)

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_install_vsix
Parameters:
  force: true
```

**Important:** After installation, you must manually reload the window:
1. Press Ctrl+Shift+P
2. Type "Developer: Reload Window"
3. Press Enter

**Note:** Auto-reload is disabled because it breaks the chat session permanently.

---

### `adg_reload_window`
**Returns instructions for manually reloading VS Code window.**

**No parameters required.**

This tool does NOT automatically reload (to preserve chat session). Instead, it provides instructions for manual reload.

**Example:**
```
Use MCP tool: mcp_adg-parallels_adg_reload_window
```

**Returns instructions:**
```
⚠️ RELOAD REQUIRED - but DO NOT use auto-reload!

Please reload the window MANUALLY:
1. Press Ctrl+Shift+P → "Developer: Reload Window"
2. Or press Ctrl+R

After reload, start a NEW chat session.
```

---

## 🎯 Typical Worker Workflow

Here's the standard workflow for an ADG-Parallels worker:

### 1. **Check Status**
```
Use MCP tool: mcp_adg-parallels_adg_status
```

### 2. **Claim Task**
```
Use MCP tool: mcp_adg-parallels_adg_claim_task
Parameters:
  workerUid: "U00002"
```

### 3. **Execute Task**
Read the `payload` field and perform the requested work.

### 4. **Complete Task**
```
Use MCP tool: mcp_adg-parallels_adg_complete_task
Parameters:
  taskId: 42
  resultPath: "output/my-result.md"
```

### 5. **Repeat**
Go back to step 2 until no more tasks are available.

---

## 📌 Parameter Auto-Detection

Many tools support auto-detection of the `ceoPath` parameter:

**Auto-detection searches for:**
1. A folder named `.adg-parallels_CEO_*` in the current workspace
2. Inside any workspace folder
3. Walking up the directory tree (for workers inside CEO folder)

**When to provide ceoPath explicitly:**
- Multiple ADG projects in workspace
- Working outside the workspace folder structure
- Auto-detection fails

---

## 🚨 Error Handling

All MCP tools return a result object:
```json
{
  "success": true,
  "data": { ... }
}
```

On error:
```json
{
  "success": false,
  "error": "Error message explaining what went wrong"
}
```

**Common errors:**
- "No ADG project found" - Provide `ceoPath` or initialize project first
- "workerUid is required" - Must provide your worker UID
- "No tasks available to claim" - Task queue is empty
- "taskId is required" - Must specify which task

---

## 💡 Best Practices

1. **Always check status first** - Use `adg_status` before starting work
2. **One task at a time** - Claim, execute, complete, repeat
3. **Report failures** - Use `adg_fail_task` with clear error messages
4. **Send heartbeats** - Keep the system informed you're alive
5. **Provide result paths** - Help track where outputs are stored
6. **Read payload carefully** - Task instructions contain essential details
7. **Quality over speed** - Do the task well, not just fast

---

## 📖 Related Documentation

- **RuntimeDatabase API** - See `runtime-database-docs.md` for database operations
- **Worker Instructions** - See `.github/copilot-instructions.md` in worker folders
- **Extension Source** - See `src/mcp/mcp-tools.ts` for implementation details

---

## 🐣 Worker Motto

*"Many Ejajkas, One Goal"*

Each worker (Ejajka 🥚) is autonomous but coordinated. Use these MCP tools to claim work, execute tasks, and report results. Together, we achieve parallel processing excellence!

---

*Generated for ADG-Parallels MCP Tools v1.0*
