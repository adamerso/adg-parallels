# 🗺️ ADG-Parallels - Roadmap

**Current Version: v0.5.0 — POC COMPLETE** 🎉  
**Last Updated: January 2026**

---

## 🎉 MILESTONE: Proof of Concept Complete!

Version 0.5.0 marks the successful completion of the POC phase. The extension demonstrates:

- ✅ Multi-ejajka parallel task execution
- ✅ Wizard-based project creation
- ✅ XML-based task queue with direct field mapping
- ✅ Worker spawning via "Start Processing" button
- ✅ Heartbeat monitoring
- ✅ Task completion detection

### 🔮 What's Next: v1.0.0 — Full Refactoring

The v0.x line is now concluded. Version 1.0.0 will bring a **complete codebase refactoring** with:

- Clean architecture (proper separation of concerns)
- Comprehensive test coverage
- Production-ready error handling
- Improved documentation and tutorials
- Dashboard for visual monitoring
- Performance optimizations

All proven techniques and patterns from v0.x will be preserved and enhanced.

---

## Status Legend
- ⬜ To do
- 🟨 In progress
- ✅ Done
- 🎯 v1.0 Target

---

## 📍 Phase 0: Preparation ✅

### 0.1 Documentation and Planning
- ✅ Project vision (PROJECT_VISION.md)
- ✅ Roadmap (PROJECT_ROADMAP.md)
- ✅ Corporate Statute (corporate-statute.ts + CORPORATE_STATUTE.md)
- ✅ Internal API definition (types/index.ts)
- ✅ Adapter format specification (TaskAdapter interface)

### 0.2 Project Scaffold
- ✅ VS Code Extension initialization
- ✅ TypeScript configuration (tsconfig.json)
- ✅ src/ directory structure
- ✅ package.json with commands and contribution points

---

## 📍 Phase 1: MVP - Core Functionality ✅

**Goal**: Working prototype with one hierarchy level (Manager → Workers)

**STATUS**: ✅ Complete and tested

### 1.1 Core - Role Detection ✅
- ✅ `role-detector.ts` - detecting CEO/Manager/Worker/TeamLead
- ✅ Checking for `.adg-parallels/management/` and `/worker/` directories

### 1.2 Project Provisioning ✅
- ✅ Command: `ADG: Provision New Project`
- ✅ Dialog: project name, worker count, task type
- ✅ Creating directory structure
- ✅ Generating `tasks.xml`
- ✅ Generating `hierarchy-config.xml`

### 1.3 Task Manager ✅
- ✅ `task-manager.ts` - CRUD on tasks
- ✅ Atomic updates (lock file)
- ✅ Finding first claimable stage task
- ✅ Stage updates with timestamps
- ✅ Race condition handling (file locking)
- ✅ **XML format (v0.4.0)**

### 1.4 Worker Lifecycle ✅
- ✅ Automatic LM execution via vscode.lm API (lm-client.ts)
- ✅ Task completion detection via criteria + signal parsing
- ✅ Continue prompt support (renderTaskContinuePrompt)
- ✅ Auto-close worker windows (workerAutoClose setting)
- ✅ Heartbeat updates (every 30s - configurable)
- ✅ Health monitoring (every 15s)
- ✅ Worker provisioning and spawning
- ✅ `finished.flag.xml` creation when worker completes
- ✅ Graceful shutdown detection (flag vs crash)
- ✅ **Improved spawn delays and verification (v0.4.2)**

### 1.5 Worker Launching ✅
- ✅ Command: `ADG: Start Workers`
- ✅ Opening N new VS Code windows
- ✅ Each window opens `workers/worker_{id}/` folder
- ✅ **Spawn verification with retries (v0.4.2)**

### 1.6 Status Bar ✅
- ✅ Showing current role (CEO/Manager/Worker) with emoji

---

## 📍 Phase 2: Dashboard and Control 🟨

**Goal**: Visual control over the process

### 2.0 Sidebar UI ✅
- ✅ Activity Bar panel with custom icon (🥚)
- ✅ Processing ON/OFF toggle
- ✅ Provision New Project button → opens Wizard
- ✅ Progress Dashboard button
- ✅ Stop/Resume/Kill processing controls
- ✅ Current role display with badge
- ✅ Tasks processed counter
- ✅ Help and About webview panels
- ✅ Responsive CSS with `clamp()` sizing
- ✅ WebviewViewProvider implementation

### 2.0.1 Project Wizard ✅
- ✅ Multi-step webview wizard (4 steps)
- ✅ Step 1: Project Info (codename, output format)
- ✅ Step 2: Worker Configuration (count slider, health monitoring)
- ✅ Step 3: Task Type (radio cards, pipeline selection)
- ✅ Step 4: Review & Create (preview, validation)
- ✅ Smooth CSS animations (fade-in, bounce)
- ✅ Real-time validation
- ✅ Auto-start processing after creation if enabled
- ✅ Folder structure preview

### 2.0.2 Project Spec Wizard ✅
- ✅ **Unified Project Wizard** - 4 kroki tworzenia projektu
- ✅ **Step 1: Project Name** - nazwa projektu (a-zA-Z0-9_-)
- ✅ **Step 2: Workforce Layers** - ilość warstw hierarchii (1-99)
- ✅ **Step 3: Input Resources** - pliki/foldery wejściowe + opis + output
- ✅ **Step 4: Layer Configuration** - konfiguracja każdej warstwy
- ✅ **Auto-spawn workers** - automatyczne tworzenie i uruchamianie workerów
- ✅ **Layer prompts generation** - generowanie promptów per warstwa
- ✅ **shared.ts** - współdzielone utility (getNonce, getBaseStyles)

### 2.1 Dashboard (Webview) ⬜
- ⬜ Command: `ADG: Show Dashboard`
- ⬜ Task list with status colors and pipeline stage names
- ⬜ Worker list with their current tasks
- ⬜ Auto-refresh every N seconds
- ⬜ Overall progress bar

### 2.2 Process Control 🟨
- ✅ Sidebar: Stop/Resume/Kill buttons
- ⬜ Command: `ADG: Pause All Workers`
- ⬜ Command: `ADG: Resume Workers`
- ⬜ `pause.flag.xml` file as pause signal

---

## 📍 Phase 3: Adapter System ✅

**Goal**: Complete workflow definitions for different task types

### 3.1 XML Format ✅ (v0.4.0)
- ✅ All configuration in XML format
- ✅ XSD schemas for validation
- ✅ `xml-loader.ts` - XML parsing with fast-xml-parser
- ✅ **Complete JSON → XML migration (v0.4.2)**

### 3.2 Pipeline Adapter Format ✅
- ✅ Multi-stage pipeline definitions
- ✅ Custom stage names
- ✅ Per-stage executor (specific model name)
- ✅ `<task-to-fulfill>` descriptive tags
- ✅ `<input>` with source references
- ✅ `<output><instructions>` descriptive format
- ✅ `<next-stage><routing>` conditional logic
- ✅ `<forbidden-patterns>` for audit stages
- ✅ `<audit-result>` with pass/fail routing

### 3.3 Allowed Lists Pattern ✅
- ✅ `<allowed-*>` lists before values
- ✅ CUSTOM option in all lists
- ✅ `<custom-*-description>` for CUSTOM values

### 3.4 Built-in Adapters ✅
- ✅ `article-with-audit.adapter.xml` - 8 stages
- ✅ `translation.adapter.xml` - 7 stages
- ✅ `code-generation.adapter.xml` - 7 stages
- ✅ `research-report.adapter.xml` - 7 stages
- ✅ `adapter-generator.adapter.xml` - 7 stages (meta-adapter)

**Note**: Adaptery są opcjonalne - nowy ProjectSpec Wizard pozwala na elastyczne definiowanie zadań bez sztywnego adaptera.

### 3.5 Pipeline Engine 🟨
- ✅ Stage execution logic
- ✅ Stage input gathering
- ⬜ Advanced routing logic execution
- ⬜ Forbidden pattern validation

---

## 📍 Phase 4: Audit Flow ✅

**Goal**: Tasks can go through verification via audit stages

### 4.1 Audit Stages ✅
- ✅ `is-audit="true"` attribute on stage
- ✅ `<forbidden-patterns>` with reason attribute
- ✅ `<audit-result>` with `<pass-criteria>`
- ✅ `<on-pass>` and `<on-fail>` routing
- ✅ Feedback to previous stage on failure

### 4.2 Audit Flow ✅
- ✅ Audit stages in pipeline definition
- ✅ Forbidden pattern detection
- ✅ Pass/fail based on criteria
- ✅ Auto-routing on failure

---

## 📍 Phase 5: Task Splitting (Mega-tasks) 🟨

**Goal**: CEO assigns one large task, system splits it automatically

### 5.1 Meta-task Detection ✅
- ✅ Recognizing `task-splitter` type tasks
- ✅ Split parameter validation in adapter

### 5.2 Split Strategies ✅
- ✅ AI-driven splitting via task-splitter adapter
- ⬜ `per-line` - one task per line
- ⬜ `per-chunk` - splitting into N chunks

### 5.3 Subtask Management ✅
- ✅ Subtask tracking via parentTaskId/subtaskIds
- ✅ Subtasks added to queue (handleMetaTaskOutput)
- ⬜ Progress aggregation

### 5.4 Merge & Aggregate ✅
- ✅ Concatenate outputs (output-aggregator.ts)
- ✅ Markdown sections merge
- ✅ JSON array merge
- ✅ ADG: Aggregate Subtask Outputs command

---

## 📍 Phase 6: Health Monitoring & Self-Healing ✅

**Goal**: Fault-tolerant system with auto-recovery

### 6.1 Heartbeat ✅
- ✅ `heartbeat.xml` per worker (XML format)
- ✅ Update every 30s (configurable)
- ✅ Includes current stage and executor info

### 6.2 Health Monitor (Manager) ✅
- ✅ Heartbeat polling every 15s
- ✅ Detecting unresponsive (>120s)
- ✅ Detecting faulty (3+ failures)

### 6.3 Self-Healing ✅
- ✅ Auto-restart unresponsive workers
- ✅ Task reassignment to queue (releaseWorkerTasks)
- ✅ `finished.flag.xml` detection (graceful vs crash)
- ✅ Health monitoring auto-stop when all tasks done
- ✅ Open new worker window (spawnWorker)

### 6.4 Alerting ✅
- ✅ CEO notification on faulty worker (VS Code warning)
- ✅ Log all restarts (logger)
- ⬜ Health report in dashboard

---

## 📍 Phase 7: Hierarchy ✅

**Goal**: Team Leaders can delegate to their own workers

### 7.1 Team Leader Support ✅
- ✅ Team Leader role detection
- ✅ `hierarchy-config.xml` with depth/limits

### 7.2 Hierarchy Limits ✅
- ✅ `maxDepth: 5` defined in config
- ✅ `maxSubordinates: 50` per level
- ✅ `emergencyBrake: 100` - max total instances
- ✅ Enforcement in worker spawning

### 7.3 Upward Reporting ✅
- ✅ Worker status reports (status-report.xml)
- ✅ Manager report generation
- ✅ Report formatting as Markdown
- ✅ ADG: Generate Status Report command

---

## 📍 Phase 8: Polish & Release 🟨

**Goal**: Ready for publication

### 8.1 Documentation 🟨
- ✅ README.md (English) - updated v0.4.2
- ⬜ README.pl.md (Polish)
- ⬜ CONTRIBUTING.md
- ⬜ Example projects / tutorials
- ⬜ Adapter documentation

### 8.2 Quality ⬜
- ⬜ Full test coverage
- ✅ Error handling
- ✅ Logging
- ⬜ Telemetry (opt-in)

### 8.3 Release ⬜
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

### XML Parsing ✅ (Resolved)
**Solution**: `fast-xml-parser` with custom validation

### Race conditions on XML ✅ (Resolved)
**Solution**: Lock file before editing (atomic operations)

### Per-Stage Executor Resolution ✅ (Resolved)
**Solution**: `model-resolver.ts` with model name → vscode.lm model mapping

### Worker Spawning Timing ✅ (Resolved v0.4.2)
**Problem**: Workers not spawning reliably.
**Solution**: Increased spawn delays (2000ms), added verification before spawning.

---

## 📅 Version History

| Version | Date | Major Changes |
|---------|------|---------------|
| **v0.5.0** | **Jan 2026** | **🎉 POC COMPLETE** — Fixed multi-worker spawning, Start Processing flow, direct XML mapping |
| v0.4.4 | Jan 2026 | Task queue XML improvements |
| v0.4.2 | Jan 2026 | New ProjectSpec Wizard, layer-based workforce, auto-spawn |
| v0.4.1 | Jan 2025 | Bug fixes, XML heartbeat |
| v0.4.0 | Jan 2025 | XML format migration |
| v0.3.x | Dec 2024 | Pipeline adapters, wizards |
| v0.2.x | Dec 2024 | Sidebar UI, health monitoring |
| v0.1.x | Dec 2024 | Initial MVP |

---

## 📅 Phase Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Preparation | ✅ Done | Documentation, scaffold |
| Phase 1: MVP | ✅ Done | Core functionality |
| Phase 2: Dashboard | ✅ 90% | Sidebar done, full dashboard → v1.0 |
| Phase 3: Adapters | ✅ Done | XML adapters |
| Phase 4: Audit | ✅ Done | Audit stages |
| Phase 5: Splitting | ✅ Done | Task splitting |
| Phase 6: Health | ✅ Done | Self-healing |
| Phase 7: Hierarchy | ✅ Done | Multi-layer support |
| Phase 8: Polish | 🎯 v1.0 | Full refactoring planned |

---

## 🚀 v1.0.0 Roadmap (Next Major Version)

### Architecture Refactoring
- 🎯 Clean separation: Core / UI / Commands / Services
- 🎯 Dependency injection
- 🎯 Event-driven communication
- 🎯 State management improvements

### Quality
- 🎯 Full test coverage (unit + integration)
- 🎯 Error handling improvements
- 🎯 Logging standardization
- 🎯 Performance profiling

### Features
- 🎯 Visual Dashboard (worker grid, progress charts)
- 🎯 Adapter marketplace
- 🎯 Cost tracking (token usage)
- 🎯 Multi-machine support

### Documentation
- 🎯 Full API documentation
- 🎯 Tutorial: First Project
- 🎯 Tutorial: Custom Adapters
- 🎯 Video walkthrough

---

*Last updated: January 2026*
*Version: 0.5.0 — POC Complete*

**Status:** 🟢 Pre-production Ready — Refactoring phase begins
