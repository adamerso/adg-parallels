# 🥚 ADG-Parallels v0.4.2

### _AI Delegation Grid — Because one AI is never enough._

---

## 🚀 What is ADG-Parallels?

ADG-Parallels is a **fully functional VS Code extension** that transforms your editor into a **distributed AI workforce** with hierarchy, automation, self-healing, and file-based communication.

Think of it as:

- **Kubernetes, but for Copilot sessions**
- A tiny AI startup inside your VS Code windows
- A company where you are the **CEO** and all employees are polite little AI agents  
  (internally known as *EggBots™*)

The extension:
- Coordinates multiple VS Code windows running AI sessions
- Delegates work using XML-based task queues
- Monitors workers via heartbeat system
- Auto-restarts frozen or unresponsive workers
- Supports hierarchical delegation (Manager → TeamLeader → Worker)

---

## ✨ Key Features (v0.4.x)

### ✅ Implemented
- **Worker Spawning** — Automatically opens N VS Code windows as workers
- **XML Task Queue** — All tasks managed in `tasks.xml` with atomic updates
- **Heartbeat System** — Workers send "I'm alive" pings every 30 seconds
- **Health Monitoring** — Detects frozen workers and restarts them
- **Adapter System** — Task types defined via XML adapters (translation, code-generation, etc.)
- **Hierarchical Roles** — CEO (human), Manager (Claude), TeamLeader (hybrid), Worker (GPT)
- **Sidebar UI** — Real-time monitoring panel with controls
- **Project Wizard** — Interactive project setup via wizard
- **Upward Reporting** — Workers report status to managers via XML files

### 🔜 Coming Soon
- Dashboard for visual worker monitoring
- Mega-task auto-splitting
- Result aggregation and merging
- External adapter marketplace

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
├── project-spec.xml           # Project configuration
├── tasks.xml                  # Task list with statuses
├── hierarchy-config.xml       # Delegation limits (optional)
├── finished.flag.xml          # Created when all tasks done
├── input/                     # Input files for processing
├── workdir/                   # Working directory
├── output/                    # Generated outputs
├── logs/                      # Execution logs
├── prompts/
│   └── layer_*_prompt.md      # Instructions per layer
└── workers/
    ├── worker-L1-1/
    │   ├── worker.xml         # Worker config & state
    │   ├── heartbeat.xml      # Health status
    │   └── instructions.md    # Task instructions
    └── worker-L1-2/
        └── ...
```

---

## 🪄 The Adapter System

Each task has a `type` that maps to an **XML adapter**:

| Adapter | Purpose |
|---------|---------|
| `translation` | Translate documents between languages |
| `code-generation` | Generate code from specifications |
| `article-with-audit` | Write articles with fact-checking |
| `research-report` | Research and report generation |
| `adapter-generator` | Create new adapters (meta!) |

Adapters define:
- Start prompts (system + user)
- Output rules and formats
- Completion criteria
- File naming conventions
- Validation steps

Built-in adapters are stored in:  
`resources/adapters/*.adapter.xml`

---

## 💓 Heartbeat & Self-Healing

Every worker writes a heartbeat file every **30 seconds**:

```xml
<heartbeat>
  <workerId>worker-L1-1</workerId>
  <timestamp>2025-01-15T10:30:00.000Z</timestamp>
  <status>working</status>
  <currentTask>task-001</currentTask>
  <cpuLoad>25</cpuLoad>
  <memoryUsage>512</memoryUsage>
</heartbeat>
```

If a worker stops responding:
1. Manager detects timeout (no heartbeat > 60s)
2. Marks worker as unresponsive
3. Closes the zombie window
4. Reassigns the task to queue
5. Spawns fresh worker

**Fully automated IT support!**

---

## 🎮 How to Use

### 1. Open ADG-Parallels Sidebar
Click the 🥚 icon in VS Code Activity Bar

### 2. Create or Open a Project
- Use **"Create New Project"** wizard
- Or open an existing `root_of_project_*` folder

### 3. Configure Tasks
Edit `tasks.xml` with your task list:

```xml
<tasks>
  <task id="001" type="translation" status="pending" priority="1">
    <title>Translate README to Polish</title>
    <input>README.md</input>
    <output>README_PL.md</output>
  </task>
</tasks>
```

### 4. Start Processing
Click **"Start Processing"** — workers spawn automatically

### 5. Monitor Progress
Watch the sidebar for real-time status updates

---

## 🔧 Configuration

### hierarchy-config.xml (optional)
```xml
<hierarchyConfig>
  <layer level="1" maxChildren="4" role="Manager" />
  <layer level="2" maxChildren="8" role="Worker" />
</hierarchyConfig>
```

### project-spec.xml
```xml
<projectSpec>
  <name>my-project</name>
  <description>Project description</description>
  <workerCount>4</workerCount>
  <adapterType>translation</adapterType>
  <inputFolder>input</inputFolder>
  <outputFolder>output</outputFolder>
</projectSpec>
```

---

## 🧪 Project Status

> **🟢 Alpha — Functional with Active Development**

Version 0.4.2 includes:
- ✅ Working worker spawning
- ✅ XML-based communication (migrated from JSON)
- ✅ Heartbeat monitoring
- ✅ Task queue management
- ✅ Adapter system
- ✅ Sidebar UI

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

MIT License — See [LICENSE](LICENSE)

---

## ⭐ If you like the project, consider starring the repo.

EggBots™ get very excited when they see stars.  
(It's in their corporate statute. Probably.)
