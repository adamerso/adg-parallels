# 🥚 ADG-Parallels v0.5.0

### _AI Delegation Grid — Because one AI is never enough._

---

## 🎉 POC COMPLETE!

**Version 0.5.0 marks the completion of the Proof of Concept phase.**

The extension is now **fully functional in pre-production** and successfully demonstrates its core vision: coordinating multiple AI agents (ejajki) working in parallel on distributed tasks.

> ⚠️ **End of v0.x Line**: This version concludes the rapid prototyping phase. The next major version (v1.0.0) will bring a complete codebase refactoring with improved architecture, better error handling, and production-ready quality — while preserving all the proven techniques and patterns developed here.

---

## 🚀 What is ADG-Parallels?

ADG-Parallels is a **fully functional VS Code extension** that transforms your editor into a **distributed AI workforce** with hierarchy, automation, self-healing, and file-based communication.

Think of it as:

- **Kubernetes, but for Copilot sessions**
- A tiny AI startup inside your VS Code windows
- A company where you are the **CEO** and all employees are polite little AI agents  
  (internally known as *Ejajki* 🥚)

The extension:
- Coordinates multiple VS Code windows running AI sessions
- Delegates work using XML-based task queues
- Monitors workers via heartbeat system
- Auto-restarts frozen or unresponsive workers
- Supports hierarchical delegation (Manager → TeamLeader → Worker)

---

## ✨ Key Features (v0.5.0)

### ✅ Working & Tested
- **Project Wizard** — 4-step interactive project setup with layer configuration
- **Multi-Ejajka Spawning** — Automatically opens N VS Code windows as workers
- **XML Task Queue** — All tasks managed in `tasks.xml` with atomic updates
- **Direct Task Mapping** — Form fields map directly to task XML (no abstraction layers)
- **Heartbeat System** — Workers send "I'm alive" pings every 30 seconds
- **Health Monitoring** — Detects frozen workers and restarts them
- **Hierarchical Roles** — CEO (human), Manager, TeamLeader, Worker (up to 99 layers)
- **Sidebar UI** — Real-time monitoring panel with controls
- **Continuation Prompts** — "Poganiacz" to nudge stuck ejajki
- **Start Processing Button** — Clean separation between project creation and worker launch
- **Upward Reporting** — Workers report status to managers via XML files

### 📋 Field Mapping (Form → XML)
| Form Field | XML Tag |
|------------|---------|
| Project Name | `<project_name>` |
| Layers Count | `<layers_count>` |
| Task Description | `<your_assigned_task>` |
| Output Directory | `<move_completed_task_artifact_to>` |
| Input Description | `<resources_description>` |
| Input Files | `<list_of_additional_resources>` |
| Continuation Prompt | `<continuation_prompt>` |
| Reporting | `<reporting_instructions>` |

---

## 🧠 Roles in This AI Corporation

| Role | Emoji | Model | Description |
|------|-------|-------|-------------|
| **CEO** | 🧑 | Human | You. Supreme overlord. Defines goals. |
| **Manager** | 👔 | Claude Opus | High-level AI. Delegates tasks downward. |
| **Team Leader** | 👨‍💼 | Hybrid | Works AND delegates. Middle management. |
| **Worker** | 👷 | GPT-4o | Workhorse doing individual tasks. |

---

## 🏗️ Architecture

```
CEO (You)
    │
    ▼
Manager AI (Claude Opus)
    │
    ├── Team Leader AI(s)
    │       │
    │       └── Worker 1…N (VS Code windows)
    │
    └── Worker Pool (GPT-4o, 4o-mini)
```

All communication happens through **XML files** in the project folder:
- `tasks.xml` — Task queue with statuses
- `worker.xml` — Worker configuration
- `heartbeat.xml` — Health status pings
- `finished.flag.xml` — Completion signals

---

## 📦 Project Structure

```
root_of_project_{name}/
├── project-spec.xml           # Project configuration (layers, resources)
├── tasks.xml                  # Task list with statuses (one per worker!)
├── hierarchy-config.xml       # Delegation limits
├── .gitignore
├── input/                     # Input files for processing
├── workdir/                   # Working directory (per layer)
├── output/                    # Generated outputs
├── logs/                      # Execution logs
├── prompts/
│   └── layer_*_prompt.md      # Auto-generated prompts per layer
└── workers/
    ├── worker-L1-1/           # Worker folder (pre-provisioned)
    │   ├── worker.xml         # Worker config & paths
    │   ├── heartbeat.xml      # Health status
    │   └── instructions.md    # Task instructions
    ├── worker-L1-2/
    └── worker-L1-N/
```

---

## 🎮 How to Use

### 1. Open ADG-Parallels Sidebar
Click the 🥚 icon in VS Code Activity Bar

### 2. Create a New Project
- Click **"Create New Project"** to open the 4-step wizard:
  1. **Name** — Enter project codename
  2. **Layers** — Choose how many workforce layers (1-99)
  3. **Resources** — Add input files/folders, describe them, set output directory
  4. **Configure** — For each layer: set type, workforce size, task description, continuation prompt

### 3. Start Processing
- After wizard completes, click **"Start Processing"** in sidebar
- Workers spawn automatically (one VS Code window per ejajka)
- Each worker has its own task from `tasks.xml`

### 4. Watch the Magic
- Workers execute tasks in parallel
- Monitor progress via sidebar
- Results appear in output directory

---

## 💓 Heartbeat & Self-Healing

Every worker writes a heartbeat file every **60 seconds**:

```xml
<heartbeat>
  <worker-id>worker-L1-1</worker-id>
  <timestamp>2026-01-16T22:30:00.000Z</timestamp>
  <status>working</status>
</heartbeat>
```

If a worker stops responding:
1. Manager detects timeout (no heartbeat > 120s)
2. Marks worker as unresponsive
3. Task can be reassigned

---

## 🔮 What's Next: v1.0.0

The upcoming major version will bring:

- 🏗️ **Complete Code Refactoring** — Clean architecture, better separation of concerns
- 📝 **Improved Documentation** — Full API docs, tutorials, examples
- 🧪 **Test Coverage** — Unit and integration tests
- 🎨 **Better UI/UX** — Dashboard, progress visualization
- 🔌 **Plugin System** — Custom adapters and extensions
- 🚀 **Performance** — Optimized spawning and communication

The refactoring will preserve all working patterns and techniques from v0.x while elevating the codebase to production quality.

---

## 🧪 Project Status

> **🟢 POC Complete — Pre-production Ready**

Version 0.5.0 (January 2026):
- ✅ Full wizard-based project creation
- ✅ Multi-worker spawning (tested with 6+ ejajki)
- ✅ Task execution via Language Model API
- ✅ XML-based communication
- ✅ Heartbeat monitoring
- ✅ Clean Start Processing flow

---

## 📚 Documentation

- [PROJECT_VISION.md](docs/PROJECT_VISION.md) — Long-term vision
- [PROJECT_ROADMAP.md](docs/PROJECT_ROADMAP.md) — Development roadmap
- [CORPORATE_STATUTE.md](docs/CORPORATE_STATUTE.md) — AI employee rules 🥚

---

## 🤝 Contributing

Contributions, ideas, and feedback are welcome!

- Open an issue to discuss ideas
- Star the repo to show support ⭐
- PRs welcome for bug fixes and features

---

## 📜 License

AGPL-3.0-or-later — See [LICENSE](LICENSE)

---

## ⭐ If you like the project, consider starring the repo.

Ejajki get very excited when they see stars.  
Many Ejajkas, One Goal! 🥚
