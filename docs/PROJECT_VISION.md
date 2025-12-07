# 🚀 ADG-Parallels - Project Vision

## 🎉 POC STATUS: COMPLETE & WORKING! 🎉

> **December 7, 2025** - Historic milestone achieved!
> Parallel Ejajka workers successfully executing tasks via VS Code LM API.
> Multiple AI agents working simultaneously, coordinated through shared task queue.
> *The future of AI workforce is HERE!* 🥚🥚🥚

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
2. **Coordinates tasks** through shared JSON files
3. **Automatically starts and resumes Copilot** in each window
4. **Tracks progress** and reports status to the "manager"
5. **Supports hierarchy** - from simple workers to Team Leaders managing their own teams
6. **Uses adapters** - plugin system for handling different task types
7. **Splits mega-tasks** - CEO says "write 100 articles", system organizes the work
8. **Monitors health** - heartbeat, auto-restart, task reassignment

---

## 🏛️ Conceptual Architecture

### Roles in the System

| Role | Description | Who/What |
|------|-------------|----------|
| 🧑 **CEO** | Human defining tasks and overseeing the process | You |
| 👔 **Manager** | Ejajka managing the project, delegating tasks | Claude Opus / Sonnet |
| 👨‍💼 **Team Leader** | Hybrid Ejajka - executes AND delegates | Claude Sonnet |
| 👷 **Worker** | Ejajka executing specific tasks | GPT-4o / GPT-4o-mini |

### File Structure

```
📁 Project/
└── 📁 .adg-parallels/
    ├── 📁 management/           ← Manager files
    │   ├── project_*_tasks.json ← Task list
    │   ├── hierarchy-config.json← Hierarchy limits
    │   └── attachments/         ← Source materials
    │
    ├── 📁 worker/               ← Worker files
    │   ├── worker-config.json   ← Configuration
    │   ├── worker-start-prompt.md
    │   ├── worker-continue-prompt.md
    │   └── .heartbeat.json      ← Worker health status
    │
    ├── 📁 adapters/             ← Task adapter definitions
    │   ├── article-generation.adapter.json
    │   ├── translation.adapter.json
    │   ├── code-audit.adapter.json
    │   └── task-splitter.adapter.json
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

## 🔌 Adapter System (Task Adapters)

Adapters are a plugin system for handling different task types:

| Adapter | Use Case |
|---------|----------|
| `article-generation` | Writing articles, posts, descriptions |
| `translation` | Text translations |
| `code-audit` | Code review and audit |
| `transcription` | Audio/video transcriptions |
| `task-splitter` | Meta-adapter for splitting large tasks |

Each adapter defines:
- **Start prompt** with templates (e.g., `{{task.title}}`)
- **Completion criteria** - when to consider task done
- **Output processing** - how to save and process results
- **Status flow** - what statuses the task goes through

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

Every worker saves its status (heartbeat) every 30s. Manager monitors:

- **Unresponsive** (>90s without heartbeat) → Restart worker, reassign task
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
- [x] Status management in JSON
- [x] Worker auto-start with Copilot Chat
- [x] Parallel task processing (multiple workers)
- [x] Shared output directory
- [ ] "No tasks" signaling and window closing (polish)

### Phase 2: Dashboard
- [ ] Live status dashboard (webview)
- [ ] Pause/Resume all workers
- [ ] Configurable model per role

### Phase 3: Adapters ✅
- [x] Adapter loading system (adapter-loader.ts)
- [x] Template rendering for prompts (Mustache)
- [x] Built-in adapters: generic, article-generation, task-splitter
- [x] Custom adapter support (.adapter.json files)
- [x] Completion criteria checking

### Phase 4: Audit Flow
- [x] Extended audit statuses (in types)
- [x] Auto-retry for failed tasks (task-manager.ts)
- [ ] Audit rules configuration

### Phase 5: Task Splitting
- [x] Meta-tasks and task-splitter adapter
- [ ] Split strategies (per-line, per-chunk, AI-driven)
- [ ] Merge & aggregate results

### Phase 6: Health Monitoring
- [x] Heartbeat per worker
- [x] Health monitoring (worker-lifecycle.ts)
- [x] Faulty worker detection
- [ ] CEO alerts

### Phase 7: Hierarchy
- [x] Team Leaders role detection
- [x] Delegation depth limits (hierarchy-config.json)
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
- **Storage**: JSON files (no external database)
- **Communication**: File-based (file watchers)
- **Templating**: Mustache/Handlebars (for adapters)

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
*Version: 1.0-POC 🎉 (PROOF OF CONCEPT COMPLETE!)*

**Milestone achieved**: First fully autonomous parallel AI task execution!
