# 🗺️ ADG-Parallels - Roadmap

## ✅ POC COMPLETE - December 7, 2025

> **Proof of Concept validated. Production-ready for simple workflows!**
> 
> **Core functionality working:**
> - Multiple VS Code windows spawning as workers
> - Extension auto-loads via .vsix installation
> - Workers auto-claim tasks from shared queue
> - LM API integration with Copilot models
> - Parallel task execution (tested: 4 workers × 10 tasks = Reddit launch campaign!)
> - Task continuation - workers auto-claim next tasks after completion
> - Output collected in shared folder
> - Workers create `finished.flag.xml` when done (prevents infinite respawn)
> - Health monitoring stops when all tasks completed
> 
> **v0.3.0 Updates:**
> - 🔄 XML + XSD validation (replacing JSON)
> - 🔧 Pipeline adapter paradigm (complete workflow definitions)
> - 🎯 Descriptive tags (replacing Mustache templates)
> - 🤖 Per-stage executor assignment
> - 📊 Allowed lists with CUSTOM option
> - 🎨 **Sidebar UI** - Activity Bar panel with responsive controls
> - 🧙 **Project Wizard** - Multi-step webview wizard for project creation
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
- ✅ Finding first claimable stage task
- ✅ Stage updates with timestamps
- ✅ Race condition handling (file locking)
- 🟨 Migration to XML format (v0.3.0)

### 1.4 Worker Lifecycle
- ✅ Automatic LM execution via vscode.lm API (lm-client.ts)
- ✅ Task completion detection via criteria + signal parsing
- ✅ Continue prompt support (renderTaskContinuePrompt)
- ✅ Auto-close worker windows (workerAutoClose setting)
- ✅ Heartbeat updates (every 60s - configurable)
- ✅ Health monitoring (every 15s)
- ✅ Worker provisioning and spawning
- ✅ `finished.flag.xml` creation when worker completes
- ✅ Graceful shutdown detection (flag vs crash)

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

### 2.0 Sidebar UI (DONE ✅)
- ✅ Activity Bar panel with custom icon (🥚)
- ✅ Processing ON/OFF toggle (always available)
- ✅ Provision New Project button → opens Wizard
- ✅ Progress Dashboard button
- ✅ Stop/Resume/Kill processing controls
- ✅ Current role display with badge
- ✅ Tasks processed counter
- ✅ Help and About webview panels
- ✅ Responsive CSS with `clamp()` sizing
- ✅ WebviewViewProvider implementation

### 2.0.1 Project Wizard (DONE ✅)
- ✅ Multi-step webview wizard (4 steps)
- ✅ Step 1: Project Info (codename, output format)
- ✅ Step 2: Worker Configuration (count slider, health monitoring)
- ✅ Step 3: Task Type (radio cards, pipeline selection)
- ✅ Step 4: Review & Create (preview, validation)
- ✅ Smooth CSS animations (fade-in, bounce)
- ✅ Real-time validation
- ✅ Auto-start processing after creation if enabled
- ✅ Folder structure preview

### 2.1 Dashboard (Webview)
- ⬜ Command: `ADG: Show Dashboard`
- ⬜ Task list with status colors and **pipeline stage names**
- ⬜ Worker list with their current tasks and **current stage**
- ⬜ Auto-refresh every N seconds
- ⬜ Overall progress bar
- ⬜ Stage distribution chart (how many tasks per stage)
- ⬜ Model usage stats per stage

### 2.2 Process Control
- ✅ Sidebar: Stop/Resume/Kill buttons
- ⬜ Command: `ADG: Pause All Workers`
- ⬜ Command: `ADG: Resume Workers`
- ⬜ Command: `ADG: Abort Project`
- ⬜ `pause.flag.xml` file as pause signal

### 2.3 Model Configuration
- ⬜ UI for model selection (per-stage in adapter, not global!)
- ⬜ Adapter editor (webview for XML editing?)
- ⬜ XSD validation in editor

---

## 📍 Phase 3: Adapter System → UPGRADED to Pipeline Paradigm (v0.3.0) ✅

**Goal**: Complete workflow definitions for different task types

### 3.1 XML + XSD Migration (NEW v0.3.0)
- 🟨 XSD schemas for all config files
- 🟨 `xml-loader.ts` - XML parsing with validation
- ⬜ Migration scripts (JSON → XML)
- ⬜ XSD validation on load

### 3.2 Pipeline Adapter Format (NEW v0.3.0)
- ✅ Multi-stage pipeline definitions
- ✅ Custom stage names (e.g., `during_article_writing`)
- ✅ Per-stage executor (specific model name)
- ✅ `<task-to-fulfill>` descriptive tags
- ✅ `<input>` with source references
- ✅ `<output><instructions>` descriptive format
- ✅ `<next-stage><routing>` conditional logic
- ✅ `<forbidden-patterns>` for audit stages
- ✅ `<audit-result>` with pass/fail routing

### 3.3 Allowed Lists Pattern (NEW v0.3.0)
- ✅ `<allowed-*>` lists before values
- ✅ CUSTOM option in all lists
- ✅ `<custom-*-description>` for CUSTOM values

### 3.4 Built-in Adapters (Upgraded)
- ✅ `generic.adapter.xml` - 3 stages
- ✅ `article-with-audit.adapter.xml` - 8 stages
- ✅ `translation.adapter.xml` - 5 stages
- ✅ `task-splitter.adapter.xml` - 4 stages
- ⬜ `multi-model-research.adapter.xml` - 6 stages

### 3.5 Pipeline Engine (NEW v0.3.0)
- ⬜ `pipeline-engine.ts` - stage execution logic
- ⬜ Stage input gathering (from previous stages)
- ⬜ Stage output saving
- ⬜ Routing logic execution
- ⬜ Forbidden pattern validation

### 3.6 DEPRECATED (v0.2.0 → removed)
- ~~Mustache template rendering~~
- ~~Prompt templates with `{{task.xxx}}`~~
- ~~Completion criteria checking~~ (replaced by stage transitions)

---

## 📍 Phase 4: Audit Flow → Integrated into Pipeline (v0.3.0) ✅

**Goal**: Tasks can go through verification via audit stages

### 4.1 Audit Stages (v0.3.0)
- ✅ `is-audit="true"` attribute on stage
- ✅ `<forbidden-patterns>` with reason attribute
- ✅ `<audit-result>` with `<pass-criteria>`
- ✅ `<on-pass>` and `<on-fail>` routing
- ✅ Feedback to previous stage on failure

### 4.2 Audit Flow
- ✅ Audit stages in pipeline definition
- ✅ Forbidden pattern detection
- ✅ Pass/fail based on criteria
- ✅ Auto-routing on failure (back to previous stage)
- ⬜ Retry count per stage (not just per task)

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
- ✅ Concatenate outputs (output-aggregator.ts)
- ✅ Markdown sections merge
- ✅ JSON array merge
- ✅ ADG: Aggregate Subtask Outputs command

---

## 📍 Phase 6: Health Monitoring & Self-Healing (DONE ✅)

**Goal**: Fault-tolerant system with auto-recovery

### 6.1 Heartbeat
- ✅ `.heartbeat.xml` per worker (XML format)
- ✅ Update every 60s (configurable per project)
- ✅ Includes current stage and executor info
- ⬜ Window PID tracking

### 6.2 Health Monitor (Manager)
- ✅ Heartbeat polling every 15s
- ✅ Detecting unresponsive (>120s)
- ✅ Detecting faulty (3+ failures)

### 6.3 Self-Healing
- ✅ Auto-restart unresponsive workers (after 3 failures)
- ✅ Task reassignment to queue (releaseWorkerTasks)
- ✅ `finished.flag.xml` detection (graceful vs crash)
- ✅ Health monitoring auto-stop when all tasks done
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
- ✅ `hierarchy-config.xml` with depth/limits

### 7.2 Hierarchy Limits (Updated v0.3.0)
- ✅ `maxDepth: 5` defined in config
- ✅ `maxSubordinates: 50` per level
- ✅ `emergencyBrake: 100` - max total instances
- ✅ Enforcement in worker spawning

### 7.3 Upward Reporting
- ✅ Worker status reports (status-report.json)
- ✅ Manager report generation
- ✅ Report formatting as Markdown
- ✅ ADG: Generate Status Report command

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
- 💡 Webhooks for events4
- 💡 Priority queues
- 💡 Worker pools (different capabilities)

---

## 🚧 Known Technical Challenges

### XML Parsing & Validation (NEW v0.3.0)
**Problem**: Need reliable XML parsing with XSD validation in Node.js/TypeScript.
**Possible solutions**:
1. `fast-xml-parser` + custom validation
2. `libxmljs` for full XSD support (native dependency)
3. `xml2js` + JSON Schema converted from XSD

### Pipeline Stage Transitions
**Problem**: Complex routing logic between stages.
**Possible solutions**:
1. Simple string matching on `<routing>` text
2. Formal state machine
3. Expression parser for conditions

### Race conditions on XML
**Problem**: Multiple workers may try to edit the same XML.
**Solution** (implemented): Lock file before editing.

### Per-Stage Executor Resolution
**Problem**: Model names in adapters (gpt-4o, claude-sonnet) need to map to available models.
**Solution**: `model-resolver.ts` with model name → vscode.lm model mapping.

---

## 📅 Estimated Timeline

| Phase | Estimated Time | Status |
|-------|----------------|--------|
| Phase 0 | 1-2 days | ✅ Done |
| Phase 1 | 1-2 weeks | ✅ **POC COMPLETE!** 🎉 |
| Phase 2 | 1 week | ⬜ Dashboard (next priority) |
| Phase 3 | 1 week | 🟨 v0.3.0 Pipeline migration in progress |
| Phase 4 | 3-4 days | ✅ Done → Integrated into Pipeline |
| Phase 5 | 1 week | ✅ ~80% (AI splitting done) |
| Phase 6 | 1 week | ✅ Done (60s heartbeat + health monitoring) |
| Phase 7 | 1-2 weeks | ✅ ~80% (hierarchy + reporting done) |
| Phase 8 | 1 week | ⬜ Documentation & Polish |

**v0.3.0 Focus:**
- XML + XSD migration
- Pipeline engine implementation
- Adapter format finalization

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

### 3. Window Auto-Close ✅ SOLVED
**Status**: RESOLVED via `finished.flag.xml` + `workerAutoClose` setting
**Solution**: 
- Workers create `finished.flag.xml` when no more tasks
- Manager checks flag before respawning (graceful exit ≠ crash)
- Health monitoring auto-stops when all tasks completed
- `workerAutoClose` setting with configurable delay

### 4. JSON Syntax Errors ✅ SOLVED (v0.3.0)
**Status**: RESOLVED via XML + XSD migration
**Problem**: JSON is prone to syntax errors (missing commas, quotes)
**Solution**: XML with XSD validation provides better error messages and IDE support

---

*Last updated: December 7, 2025*
*Version: 0.3.0*

**Status:** v0.3.0 - Pipeline paradigm defined, XML migration planned. Production-tested with 4 workers × 10 tasks.
