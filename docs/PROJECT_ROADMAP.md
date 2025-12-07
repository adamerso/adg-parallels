# 🗺️ ADG-Parallels - Roadmap

## ✅ POC COMPLETE - December 7, 2025

> **Proof of Concept validated.**
> 
> **Core functionality working:**
> - Multiple VS Code windows spawning as workers
> - Extension auto-loads via .vsix installation
> - Workers auto-claim tasks from shared queue
> - LM API integration with Copilot models
> - Parallel task execution (tested: 2 workers × 4 tasks)
> - Task continuation - workers auto-claim next tasks after completion
> - Output collected in shared folder
> 
> **Next focus:** Phase 2 (Dashboard) or Phase 8 (Polish & Release)

---

## Status Legend
- ⬜ To do
- 🟨 In progress
- ✅ Done
- 🔴 Blocked
- 💡 Idea to verify

---

## 📍 Phase 0: Preparation (DONE ✅)

### 0.1 Documentation and Planning
- ✅ Project vision (PROJECT_VISION.md)
- ✅ Roadmap (PROJECT_ROADMAP.md)
- ✅ Corporate Statute (corporate-statute.ts + CORPORATE_STATUTE.md)
- ⬜ Detailed technical specification (deferred to Phase 8)
- ✅ Internal API definition (types/index.ts)
- ✅ Adapter format specification (TaskAdapter interface)

### 0.2 Project Scaffold
- ✅ VS Code Extension initialization
- ✅ TypeScript configuration (tsconfig.json)
- ⬜ ESLint + Prettier (deferred - not critical)
- ✅ src/ directory structure
- ✅ package.json with commands and contribution points

---

## 📍 Phase 1: MVP - Core Functionality (COMPLETE ✅)

**Goal**: Working prototype with one hierarchy level (Manager → Workers)

**STATUS**: Complete. Tested with 2 workers processing 4 tasks. Continue flow validated.

### 1.1 Core - Role Detection
- ✅ `role-detector.ts` - detecting CEO/Manager/Worker/TeamLead
- ✅ Checking for `.adg-parallels/management/` and `/worker/` directories
- ⬜ Unit tests (deferred)

### 1.2 Project Provisioning
- ✅ Command: `ADG: Provision New Project`
- ✅ Dialog: project name, worker count, task type
- ✅ Creating directory structure
- ✅ Generating `project_*_adg-tasks.json`
- ✅ Generating `hierarchy-config.json`
- 🟨 Copying instructions to workers - PARTIAL (needs `.github/copilot-instructions.md`)
- 🟨 Generating prompts (start/continue) - PARTIAL (needs worker-start-prompt.md)

### 1.3 Task Manager
- ✅ `task-manager.ts` - CRUD on tasks
- ✅ Atomic updates (lock file)
- ✅ Finding first `pending` task
- ✅ Status updates with timestamps
- ✅ Race condition handling (file locking)

### 1.4 Worker Lifecycle
- ✅ Automatic LM execution via vscode.lm API (lm-client.ts)
- ✅ Task completion detection via criteria + signal parsing
- ✅ Continue prompt support (renderTaskContinuePrompt)
- ✅ Auto-close worker windows (workerAutoClose setting)
- ✅ Heartbeat updates (every 30s)
- ✅ Health monitoring (every 15s)
- ✅ Worker provisioning and spawning

### 1.5 Worker Launching
- ✅ Command: `ADG: Start Workers`
- ✅ Opening N new VS Code windows
- ✅ Each window opens `workers/worker_{id}/` folder

### 1.6 Status Bar
- ✅ Showing current role (CEO/Manager/Worker) with emoji
- 🟨 Counter: X/Y tasks completed - needs async implementation

---

## 📍 Phase 2: Dashboard and Control

**Goal**: Visual control over the process

### 2.1 Dashboard (Webview)
- ⬜ Command: `ADG: Show Dashboard`
- ⬜ Task list with status colors
- ⬜ Worker list with their current tasks
- ⬜ Auto-refresh every N seconds
- ⬜ Overall progress bar

### 2.2 Process Control
- ⬜ Command: `ADG: Pause All Workers`
- ⬜ Command: `ADG: Resume Workers`
- ⬜ Command: `ADG: Abort Project`
- ⬜ `pause.md` file as pause signal

### 2.3 Model Configuration
- ⬜ UI for model selection per role
- ⬜ Saving preferences in `hierarchy-config.json`
- ⬜ Passing model info to prompts

---

## 📍 Phase 3: Adapter System (DONE ✅)

**Goal**: Modular system for handling different task types

### 3.1 Adapter Loader
- ✅ `adapter-loader.ts` - loading adapters from JSON files
- ✅ Adapter schema validation
- ✅ Loaded adapter caching

### 3.2 Template Rendering
- ✅ Mustache integration (prompt-renderer.ts)
- ✅ Prompt rendering with `{{task.xxx}}` placeholders
- ✅ Custom helpers (slugify, formatDate, truncate)

### 3.3 Built-in Adapters
- ✅ `generic.adapter.json` - default adapter
- ✅ `article-generation.adapter.json`
- ✅ `task-splitter.adapter.json` (meta-adapter)
- ✅ `translation.adapter.json`
- ✅ `code-audit.adapter.json`

### 3.4 Completion Criteria
- ✅ Checking if output meets criteria
- ✅ Length validation, regex patterns
- ✅ Completion signal parsing ("TASK COMPLETED")

### 3.5 LM Client (NEW)
- ✅ `lm-client.ts` - wrapper for vscode.lm API
- ✅ Model selection by vendor/family
- ✅ Streaming response support
- ✅ Token counting and context window checking
- ✅ Error handling (NoPermissions, NotFound, Blocked)

### 3.6 Worker Executor (NEW)
- ✅ `worker-executor.ts` - full task execution flow
- ✅ Execute single task / Execute all loop
- ✅ Progress callbacks and VS Code integration
- ✅ Output saving and status updates

---

## 📍 Phase 4: Audit Flow

**Goal**: Tasks can go through verification

### 4.1 Audit Statuses
- ✅ Extended statuses: `audit_in_progress`, `audit_failed`, `audit_passed`
- ✅ Configuration of which statuses mean "completed"
- ✅ Auto-retry for `audit_failed` (retryCount/maxRetries)

### 4.2 Auditors
- ⬜ Separate auditor role/pool
- ⬜ Or: same worker audits others' work
- ⬜ Audit rules configuration

---

## 📍 Phase 5: Task Splitting (Mega-tasks)

**Goal**: CEO assigns one large task, system splits it automatically

### 5.1 Meta-task Detection
- ✅ Recognizing `task-splitter` type tasks (adapter.isMeta)
- ✅ Split parameter validation in adapter

### 5.2 Split Strategies
- ✅ AI-driven splitting via task-splitter adapter
- ⬜ `per-line` - one task per line in source file
- ⬜ `per-chunk` - splitting into N chunks

### 5.3 Subtask Management
- ✅ Subtask tracking via parentTaskId/subtaskIds
- ✅ Subtasks added to queue (handleMetaTaskOutput)
- ⬜ Progress aggregation
- ⬜ Failure handling (partial completion)

### 5.4 Merge & Aggregate
- ⬜ Concatenate outputs
- ⬜ Summarize outputs
- ⬜ Custom merge strategies

---

## 📍 Phase 6: Health Monitoring & Self-Healing

**Goal**: Fault-tolerant system with auto-recovery

### 6.1 Heartbeat
- ✅ `heartbeat.json` per worker
- ✅ Update every 30s with timestamp, current task, status
- ⬜ Window PID tracking

### 6.2 Health Monitor (Manager)
- ✅ Heartbeat polling every 15s
- ✅ Detecting unresponsive (>90s)
- ✅ Detecting faulty (3+ failures)

### 6.3 Self-Healing
- ✅ Auto-restart unresponsive workers (after 3 failures)
- ✅ Task reassignment to queue (releaseWorkerTasks)
- ⬜ Kill zombie windows (by PID)
- ✅ Open new worker window (spawnWorker)

### 6.4 Alerting
- ✅ CEO notification on faulty worker (VS Code warning)
- ✅ Log all restarts (logger)
- ⬜ Health report in dashboard

---

## 📍 Phase 7: Hierarchy

**Goal**: Team Leaders can delegate to their own workers

### 7.1 Team Leader Support
- ✅ Team Leader role detection (both directories)
- ⬜ TL can create own workers
- ✅ `hierarchy-config.json` with depth/limits

### 7.2 Hierarchy Limits
- ✅ `maxDepth` defined in config
- ✅ `maxSubordinates` per level
- ✅ `emergencyBrake` - max total instances
- ✅ Enforcement in worker spawning

### 7.3 Upward Reporting
- ⬜ Worker reports to TL
- ⬜ TL aggregates and reports to Manager
- ⬜ Manager reports to CEO

---

## 📍 Phase 8: Polish & Release

**Goal**: Ready for publication

### 8.1 Documentation
- ⬜ README.md (English)
- ⬜ README.pl.md (Polish)
- ⬜ CONTRIBUTING.md
- ⬜ Example projects / tutorials
- ⬜ Adapter documentation

### 8.2 Quality
- ⬜ Full test coverage
- ⬜ Error handling
- ⬜ Logging
- ⬜ Telemetry (opt-in)

### 8.3 Release
- ⬜ Logo and branding
- ⬜ VS Code Marketplace listing
- ⬜ GitHub repo public
- ⬜ Demo video

---

## 📍 Phase 9+: Future Ideas 💡

- 💡 Web dashboard (outside VS Code)
- 💡 REST API for integrations
- 💡 Notion/Jira integration
- 💡 Multi-machine support (distributed workers)
- 💡 Cost tracking (token usage)
- 💡 Adapter marketplace
- 💡 Scheduling (cron-like)
- 💡 Webhooks for events
- 💡 Priority queues
- 💡 Worker pools (different capabilities)

---

## 🚧 Known Technical Challenges

### Detecting "Copilot finished"
**Problem**: No official API to detect when Copilot finished responding.
**Possible solutions**:
1. Polling every X seconds if chat is idle
2. Copilot calls our `adg_complete` tool
3. File watcher - Copilot saves file = finished
4. Time heuristic (no changes for N seconds)

### Race conditions on JSON
**Problem**: Multiple workers may try to edit the same JSON.
**Possible solutions**:
1. Lock file before editing
2. Separate file per task (`tasks/001.json`)
3. Worker-specific task queue

### Automatic Copilot launch
**Problem**: How to programmatically open chat and send prompt?
**Solution**: `workbench.action.chat.open` with parameters (to investigate)

### Heartbeat reliability
**Problem**: How to ensure heartbeat is updated even when Copilot is working?
**Possible solutions**:
1. Separate timer in extension (doesn't depend on Copilot)
2. File watcher on output directory as activity proxy

---

## 📅 Estimated Timeline

| Phase | Estimated Time | Status |
|-------|----------------|--------|
| Phase 0 | 1-2 days | ✅ Done |
| Phase 1 | 1-2 weeks | ✅ **POC COMPLETE!** 🎉 |
| Phase 2 | 1 week | ⬜ (nice to have) |
| Phase 3 | 1 week | ✅ Done |
| Phase 4 | 3-4 days | 🟨 ~50% (statuses done, audit flow TODO) |
| Phase 5 | 1 week | 🟨 ~30% (task-splitter adapter done) |
| Phase 6 | 1 week | ✅ Done (heartbeat + monitoring) |
| Phase 7 | 1-2 weeks | 🟨 ~30% (role detection done) |
| Phase 8 | 1 week | ⬜ |

*Timeline is tentative and depends on CEO availability and discovered technical challenges.*

---

## ✅ RESOLVED BLOCKERS (December 2025)

### 1. Automatic LM Execution ✅ SOLVED
**Status**: RESOLVED via `vscode.lm` API
**Solution**: Using `vscode.lm.selectChatModels()` and `model.sendRequest()` to programmatically send prompts and receive responses.
**Implementation**: `src/core/lm-client.ts`

### 2. Task Completion Detection ✅ SOLVED
**Status**: RESOLVED via completion criteria
**Solution**: 
- Checking for "TASK COMPLETED" signal in output
- Validation via regex patterns
- Minimum output length checking
**Implementation**: `src/core/prompt-renderer.ts` - `checkCompletionCriteria()`, `parseCompletionSignal()`

## 🔴 REMAINING CHALLENGES

### 1. Window Auto-Close
**Status**: TODO
**Impact**: Worker windows don't auto-close after all tasks done
**Solution**: Implement file watcher for `worker-all-task-disposed.md`

---

*Last updated: December 7, 2025*
*Version: 1.1-POC*

**Status:** Core POC complete. Ready for dashboard or polish phase.
