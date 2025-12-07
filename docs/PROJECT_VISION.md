# 🚀 ADG-Parallels - Project Vision

## ✅ POC STATUS: COMPLETE & PRODUCTION-TESTED

> **December 7, 2025** - v0.3.0 Released
> 
> **v0.3.0 Major Changes:**
> - 🔄 **XML + XSD** - All config files migrated from JSON to validated XML
> - 🔧 **Pipeline Adapters** - Adapters define complete multi-stage pipelines
> - 🎯 **Descriptive Tags** - Human-readable instructions, not Mustache templates
> - 🤖 **Per-Stage Executors** - Each stage specifies its own model (gpt-4o, claude-sonnet)
> - 📊 **Allowed Lists + CUSTOM** - Extensible enums with always-available CUSTOM option
> - 👔 **TeamLeader Role** - Full documentation and support
> - 🎨 **Sidebar UI** - Activity Bar panel with responsive WebView controls
> - 🧙 **Project Wizard** - Multi-step GUI wizard replacing CLI dialogs
> 
> **Capabilities demonstrated (v0.2.0):**
> - Parallel workers executing tasks autonomously via VS Code LM API
> - Multiple AI agents coordinated through shared task queue
> - Task continuation ("continue") working - workers pick up new tasks after completion
> - **Tested: 4 workers × 10 tasks = Reddit launch campaign generated in parallel!**
> - Workers create `finished.flag.xml` for graceful shutdown detection
> - Health monitoring with auto-recovery (respawn crashed workers)
> - Task audit system for quality verification
> 
> Ready for Phase 2: Dashboard & Control or Phase 8: Polish & Release

---

## Project Name
**ADG-Parallels** (ADG = AI Delegation Grid)

## Motto
*"Many Ejajkas, One Goal"*

(Note: "Ejajka" is a humorous Polish name for AI, derived from pronouncing "AI" in Polish: A-I → Ej-Aj → Ejajka 🥚)

---

## 📋 What is this?

ADG-Parallels is a VS Code extension that enables **parallel task processing through multiple GitHub Copilot instances** organized in a corporate-like hierarchy.

Imagine having your own AI corporation:
- **You** are the CEO 🧑
- **Claude Opus** is your Manager 👔
- **Claude Sonnet** are your Team Leaders 👨‍💼
- **GPT-4o** workers do the actual work 👷

All running in parallel. All coordinated automatically. All using your existing Copilot subscription.

**Key Features:**
- 🔌 **Modularity** - Adapter system for different task types
- 🪓 **Auto-splitting** - Mega-tasks automatically divided into smaller ones
- 💓 **Self-healing** - Automatic detection and restart of unresponsive workers
- 🏢 **Hierarchy** - From CEO through Managers to Team Leaders and Workers

---

## 🎯 The Problem We Solve

1. **Single session limitation**: GitHub Copilot can only work on one task at a time per window
2. **Manual management**: With many tasks, you need to manually copy prompts, track statuses, collect outputs
3. **No coordination**: There's no native way to coordinate multiple Copilot sessions
4. **Wasted subscription potential**: Paying for Copilot, you can have 8+ parallel sessions, but managing them is painful
5. **No fault tolerance**: When a session hangs, the task is lost
6. **No scalability**: No way to say "here's WHAT I want" and let the system figure out HOW

---

## 💡 The Solution

An extension that:
1. **Automatically opens multiple VS Code windows** as "workers"
2. **Coordinates tasks** through shared XML files (validated with XSD)
3. **Automatically starts and resumes Copilot** in each window
4. **Tracks progress** and reports status to the "manager"
5. **Supports hierarchy** - from simple workers to Team Leaders managing their own teams
6. **Uses pipeline adapters** - complete workflow definitions for different task types
7. **Splits mega-tasks** - CEO says "write 100 articles", system organizes the work
8. **Monitors health** - heartbeat (60s configurable), auto-restart, task reassignment

---

## 🏛️ Conceptual Architecture

### Roles in the System

| Role | Description | Who/What |
|------|-------------|----------|
| 🧑 **CEO** | Human defining tasks and overseeing the process | You |
| 👔 **Manager** | Ejajka managing the project, delegating tasks | Claude Opus / Sonnet |
| 👨‍💼 **Team Leader** | Hybrid Ejajka - executes AND delegates | Claude Sonnet |
| 👷 **Worker** | Ejajka executing specific tasks | GPT-4o / GPT-4o-mini |

### File Structure (v0.3.0)

```
📁 Project/
└── 📁 .adg-parallels/
    ├── 📁 management/           ← Manager files
    │   ├── project_*_tasks.xml  ← Task list (XML)
    │   ├── hierarchy-config.xml ← Hierarchy limits (XML)
    │   └── attachments/         ← Source materials
    │
    ├── 📁 worker/               ← Worker files
    │   ├── .heartbeat.xml       ← Worker health status (XML)
    │   └── finished.flag.xml    ← Graceful exit signal (XML)
    │
    ├── 📁 adapters/             ← Pipeline adapter definitions (XML)
    │   ├── article-with-audit.adapter.xml
    │   ├── translation.adapter.xml
    │   ├── code-audit.adapter.xml
    │   └── task-splitter.adapter.xml
    │
    ├── 📁 schemas/              ← XSD validation schemas (NEW v0.3.0)
    │   ├── tasks.xsd
    │   ├── adapter.xsd
    │   ├── hierarchy-config.xsd
    │   └── heartbeat.xsd
    │
    ├── 📁 teamleaders/          ← TeamLeader workspaces (NEW)
    │
    └── 📁 jobs/
        └── 📁 worker_{N}/       ← Each worker's workspace
```

### Role Detection

```
.adg-parallels/management/ exists? → MANAGER
.adg-parallels/worker/ exists?     → WORKER
Both exist?                        → TEAM LEADER
Neither?                           → CEO (main window)
```

---

## 🔌 Adapter System - Pipeline Paradigm (v0.3.0)

> **MAJOR CHANGE**: Adapters are no longer prompt templates!
> They are **COMPLETE PIPELINE DEFINITIONS** - self-describing workflow specifications.

Adapters define the entire lifecycle of a task:

| Adapter | Pipeline Stages | Use Case |
|---------|-----------------|----------|
| `article-with-audit` | 8 stages | Writing → Proofreading → Audit |
| `translation` | 5 stages | Translation with review |
| `code-audit` | 4 stages | Code review and audit |
| `task-splitter` | 4 stages | Meta-adapter for splitting tasks |
| `multi-model-research` | 6 stages | Research using different models |

Each adapter defines:
- **Stages** - custom status names (e.g., `during_article_writing`, `awaiting_audit`)
- **Executors** - specific model per stage (gpt-4o, claude-sonnet, NOT tiers!)
- **Task-to-fulfill** - descriptive, human-readable instructions
- **Inputs/Outputs** - with named references and descriptions
- **Routing** - conditional logic (IF/THEN/ELSE)
- **Forbidden patterns** - for audit stages

**Philosophy**: Extension = "dumb executor". All business logic in adapters.

```xml
<!-- Example stage from adapter -->
<stage id="2" name="during_article_writing">
    <task-to-fulfill>
        Napisz artykuł na temat określony w tytule i opisie zadania.
        Artykuł powinien być wyczerpujący, dobrze ustrukturyzowany.
    </task-to-fulfill>
    <executor>gpt-4o</executor>
    <input>
        <source name="task-definition" stage="initial">
            <description>Tytuł i opis zadania</description>
        </source>
    </input>
    <next-stage>
        <routing>Po zakończeniu → awaiting_proofreading</routing>
    </next-stage>
</stage>
```

---

## 🪓 Task Splitting (Mega-tasks)

CEO can assign one large task, and the system splits it automatically:

```
CEO: "Write 100 cooking articles"
         │
         ▼
    ┌─────────────┐
    │  MANAGER    │ ← Uses task-splitter adapter
    │  Splits to  │
    │  100 tasks  │
    └─────────────┘
         │
    ┌────┴────┐
    ▼         ▼
 Worker    Worker  ... (x8)
```

---

## 💓 Heartbeat & Self-Healing

Every worker saves its status (heartbeat) every 60s (configurable per project). Manager monitors:

- **Unresponsive** (>120s without heartbeat) → Restart worker, reassign task
- **Faulty** (3+ consecutive failures) → Disable worker, alert CEO
- **Healthy** → Continue working

This ensures **high availability** and fault tolerance.

---

## ✨ Key Features by Phase

### MVP (Phase 1) ✅ COMPLETE!
- [x] Project provisioning - creating directory structure
- [x] Opening N VS Code windows as workers
- [x] Automatic AI task execution via LM API
- [x] Task completion detection and criteria checking
- [x] Status management in XML (migrated from JSON in v0.3.0)
- [x] Worker auto-start with Copilot Chat
- [x] Parallel task processing (multiple workers)
- [x] Shared output directory
- [x] `finished.flag.xml` for graceful shutdown detection

### Phase 2: Dashboard
- [x] Sidebar UI panel (Activity Bar)
- [x] Project Wizard (multi-step webview)
- [x] Processing ON/OFF control
- [x] Stop/Resume/Kill buttons
- [ ] Live status dashboard (webview)
- [ ] Pipeline stage visualization
- [ ] Per-stage model usage stats

### Phase 3: Adapters ✅ → Upgraded to Pipeline Paradigm (v0.3.0)
- [x] Adapter loading system (adapter-loader.ts)
- [x] XML + XSD validation (replacing JSON + Mustache)
- [x] Built-in adapters: generic, article-with-audit, task-splitter
- [x] Custom adapter support (.adapter.xml files)
- [x] Multi-stage pipelines with custom status names
- [x] Per-stage executor (model) assignment
- [x] Descriptive task-to-fulfill (not templates!)
- [x] Allowed lists with CUSTOM option
- [ ] Pipeline engine implementation

### Phase 4: Audit Flow ✅ DONE → Upgraded (v0.3.0)
- [x] Audit stages in pipeline (is-audit="true")
- [x] Forbidden patterns checking
- [x] Pass/fail routing
- [x] Auto-retry with feedback to previous stage

### Phase 5: Task Splitting
- [x] Meta-tasks and task-splitter adapter
- [ ] Split strategies (per-line, per-chunk, AI-driven)
- [ ] Merge & aggregate results

### Phase 6: Health Monitoring ✅ DONE
- [x] Heartbeat per worker (60s configurable)
- [x] Health monitoring (worker-lifecycle.ts)
- [x] Faulty worker detection with auto-respawn
- [x] `finished.flag.xml` detection
- [ ] CEO alerts (future enhancement)

### Phase 7: Hierarchy
- [x] Team Leaders role detection
- [x] Delegation depth limits (hierarchy-config.xml) - maxDepth=5, maxSubordinates=50
- [x] Emergency brake (100 total instances)
- [ ] Upward reporting in hierarchy

### Phase 8+ (Future)
- [ ] Web dashboard (outside VS Code)
- [ ] External API integration (Notion, Jira)
- [ ] Metrics and analytics
- [ ] Multi-machine support

---

## 🛠️ Tech Stack

- **Language**: TypeScript
- **Platform**: VS Code Extension API
- **UI**: VS Code Webview (dashboard)
- **Storage**: XML files with XSD validation (no external database)
- **Communication**: File-based (file watchers)
- **Config Validation**: XML Schema Definition (XSD)

---

## 🎨 Naming and Branding

### "Ejajka" / "Ejajeczka" 🥚
A humorous Polish name for AI, derived from pronouncing "AI" in Polish (Ej-Aj).
Adds levity to the project while maintaining professional functionality.

### ADG = AI Delegation Grid
Acronym describing the project's essence - a grid for delegating tasks to AI.

---

## 👥 Target Audience

1. **GitHub Copilot power users** - people with paid subscription wanting to maximize its value
2. **Content creators** - mass generation of articles, descriptions, translations
3. **Developers** - parallel code review, test generation, documentation
4. **Agencies** - scaling AI work

---

## 📜 Corporate Statute

The project includes a "Corporate Statute of ADG-Parallels" - a document defining the rules of Ejajka collaboration in the hierarchy. It's automatically attached to the first prompt of each Ejajka.

See: `src/constants/corporate-statute.ts`

(Yes, we have a corporate statute for our AI employees. Yes, it's legally binding in the Ejajka jurisdiction. 😄)

---

## 🌍 Language

- **Code and comments**: English (GitHub publication)
- **Statute and Ejajka communication**: Polish (native version) / English
- **README and docs**: English

---

## 📄 License

TBD. Proposals:
- MIT (maximum openness)
- AGPL-3.0 (enforces open source for modifications)

---

## 🤝 Contributors

- **CEO**: Human with a vision 😄
- **Chief Architect**: Claude Opus (Senior Ejajeczka)
- **Architecture Consultant**: GPT-5.1 (Creative Ejajeczka)
- **Future contributors**: Welcome!

---

*Document created: December 7, 2025*
*Version: 0.3.0*

**Milestones achieved:**
- First autonomous parallel AI task execution
- Task continuation validated (workers auto-claim next tasks)
- Multi-task queue processing (4 tasks / 2 workers) - initial POC
- **Production test: 4 workers × 10 tasks = Reddit launch campaign!**
- Graceful shutdown with `finished.flag.xml` mechanism
- Health monitoring auto-recovery (respawn crashed workers)

**v0.3.0 Additions:**
- Complete migration from JSON to XML + XSD validation
- Pipeline adapter paradigm (adapters define complete workflows)
- Descriptive tags replacing Mustache templates
- Per-stage executor assignment
- Allowed lists with CUSTOM option pattern
- TeamLeader role full documentation
- New limits: maxDepth=5, maxSubordinates=50, emergencyBrake=100
- Configurable heartbeat interval (60s default)
- **Sidebar UI** - WebviewViewProvider in Activity Bar
- **Project Wizard** - 4-step GUI wizard with animations
- **Responsive CSS** - clamp() sizing for all screen sizes
- **Help & About panels** - Webview documentation
