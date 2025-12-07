# 🗺️ ADG-Parallels - Roadmap

## Status Legend
- ⬜ To do
- 🟨 In progress
- ✅ Done
- 🔴 Blocked
- 💡 Idea to verify

---

## 📍 Phase 0: Preparation (Current)

### 0.1 Documentation and Planning
- ✅ Project vision (PROJECT_VISION.md)
- ✅ Roadmap (PROJECT_ROADMAP.md)
- ✅ Corporate Statute (corporate-statute.ts)
- ⬜ Detailed technical specification
- ⬜ Internal API definition
- ⬜ Adapter format specification

### 0.2 Project Scaffold
- ⬜ VS Code Extension initialization
- ⬜ TypeScript configuration
- ⬜ ESLint + Prettier
- ⬜ src/ directory structure
- ⬜ package.json with commands and contribution points

---

## 📍 Phase 1: MVP - Core Functionality

**Goal**: Working prototype with one hierarchy level (Manager → Workers)

### 1.1 Core - Role Detection
- ⬜ `role-detector.ts` - detecting CEO/Manager/Worker
- ⬜ Checking for `.adg-parallels/management/` and `/worker/` directories
- ⬜ Unit tests

### 1.2 Project Provisioning
- ⬜ Command: `ADG: Provision New Project`
- ⬜ Dialog: project name, worker count
- ⬜ Creating directory structure
- ⬜ Generating `project_*_adg-tasks.json`
- ⬜ Generating `hierarchy-config.json`
- ⬜ Copying instructions to workers (`.github/copilot-instructions.md`)
- ⬜ Generating prompts (start/continue)

### 1.3 Task Manager
- ⬜ `task-manager.ts` - CRUD on tasks
- ⬜ Atomic updates (lock file or per-task files)
- ⬜ Finding first `pending` task
- ⬜ Status updates with timestamps
- ⬜ Race condition handling (multiple workers)

### 1.4 Worker Lifecycle
- ⬜ Automatic Copilot launch on start (if worker)
- ⬜ "Copilot idle" detection (finished responding)
- ⬜ Automatic resume with continue-prompt
- ⬜ `worker-all-task-disposed.md` detection
- ⬜ Window closing after disposed

### 1.5 Worker Launching
- ⬜ Command: `ADG: Start Workers`
- ⬜ Opening N new VS Code windows
- ⬜ Each window opens `jobs/worker_N/` folder

### 1.6 Status Bar
- ⬜ Showing current role (CEO/Manager/Worker)
- ⬜ Counter: X/Y tasks completed

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

## 📍 Phase 3: Adapter System

**Goal**: Modular system for handling different task types

### 3.1 Adapter Loader
- ⬜ `adapter-loader.ts` - loading adapters from JSON files
- ⬜ Adapter schema validation
- ⬜ Loaded adapter caching

### 3.2 Template Rendering
- ⬜ Mustache/Handlebars integration
- ⬜ Prompt rendering with `{{task.xxx}}` placeholders
- ⬜ Custom helpers (date formatting, slugify, etc.)

### 3.3 Built-in Adapters
- ⬜ `generic.adapter.json` - default adapter
- ⬜ `article-generation.adapter.json`
- ⬜ `translation.adapter.json`
- ⬜ `code-audit.adapter.json`

### 3.4 Completion Criteria
- ⬜ Checking if output meets criteria
- ⬜ Length validation, regex, file existence
- ⬜ Auto-retry if not met

---

## 📍 Phase 4: Audit Flow

**Goal**: Tasks can go through verification

### 4.1 Audit Statuses
- ⬜ Extended statuses: `audit_in_progress`, `audit_failed`, `audit_passed`
- ⬜ Configuration of which statuses mean "completed"
- ⬜ Auto-retry for `audit_failed`

### 4.2 Auditors
- ⬜ Separate auditor role/pool
- ⬜ Or: same worker audits others' work
- ⬜ Audit rules configuration

---

## 📍 Phase 5: Task Splitting (Mega-tasks)

**Goal**: CEO assigns one large task, system splits it automatically

### 5.1 Meta-task Detection
- ⬜ Recognizing `task-splitter` type tasks
- ⬜ Split parameter validation

### 5.2 Split Strategies
- ⬜ `per-line` - one task per line in source file
- ⬜ `per-chunk` - splitting into N chunks
- ⬜ `ai-driven` - AI decides how to split

### 5.3 Subtask Management
- ⬜ Subtask tracking in parent task
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
- ⬜ `.heartbeat.json` per worker
- ⬜ Update every 30s with timestamp, current task, status
- ⬜ Window PID tracking

### 6.2 Health Monitor (Manager)
- ⬜ Heartbeat polling every 30s
- ⬜ Detecting unresponsive (>90s)
- ⬜ Detecting faulty (3+ failures)

### 6.3 Self-Healing
- ⬜ Auto-restart unresponsive workers
- ⬜ Task reassignment to queue
- ⬜ Kill zombie windows (by PID)
- ⬜ Open new worker window

### 6.4 Alerting
- ⬜ CEO notification on faulty worker
- ⬜ Log all restarts
- ⬜ Health report in dashboard

---

## 📍 Phase 7: Hierarchy

**Goal**: Team Leaders can delegate to their own workers

### 7.1 Team Leader Support
- ⬜ Team Leader role detection (both directories)
- ⬜ TL can create own workers
- ⬜ `hierarchy-config.json` inheritance with depth increment

### 7.2 Hierarchy Limits
- ⬜ `maxDepth` enforcement
- ⬜ `maxSubordinates` per level
- ⬜ `emergencyBrake` - max total instances

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
| Phase 0 | 1-2 days | 🟨 In progress |
| Phase 1 | 1-2 weeks | ⬜ |
| Phase 2 | 1 week | ⬜ |
| Phase 3 | 1 week | ⬜ |
| Phase 4 | 3-4 days | ⬜ |
| Phase 5 | 1 week | ⬜ |
| Phase 6 | 1 week | ⬜ |
| Phase 7 | 1-2 weeks | ⬜ |
| Phase 8 | 1 week | ⬜ |

*Timeline is tentative and depends on CEO availability and discovered technical challenges.*

---

*Last updated: December 7, 2025*
*Version: 0.2 (with Adapters, Task Splitting, and Heartbeat)*
