# 🥚 ADG-Parallels v0.4.4

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
- **Adapter System** — Task types defined via XML adapters (optional)
- **Hierarchical Roles** — CEO (human), Manager, TeamLeader, Worker (up to 99 layers)
- **Sidebar UI** — Real-time monitoring panel with controls
- **ProjectSpec Wizard** — 4-step interactive project setup
- **Layer-based Workforce** — Configure workforce size and prompts per layer
- **Continuation Prompts** — "Poganiacz" to nudge stuck ejajki
- **Auto-spawn Workers** — Workers launch automatically after project creation
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
├── project-spec.xml           # Project configuration (layers, resources)
├── tasks.xml                  # Task list with statuses
├── hierarchy-config.xml       # Delegation limits
├── finished.flag.xml          # Created when all tasks done
├── input/                     # Input files for processing
├── workdir/                   # Working directory (per layer)
├── output/                    # Generated outputs
├── logs/                      # Execution logs
├── prompts/
│   └── layer_*_prompt.md      # Auto-generated prompts per layer
└── workers/
    ├── worker-L1-1/
    │   ├── worker.xml         # Worker config & state
    │   ├── heartbeat.xml      # Health status
    │   └── instructions.md    # Task instructions
    └── worker-L1-2/
        └── ...
```
```

---

## 🪄 The Adapter System (Optional)

Each task can have a `type` that maps to an **XML adapter**:

| Adapter | Purpose |
|---------|--------|
| `translation` | Translate documents between languages |
| `code-generation` | Generate code from specifications |
| `article-with-audit` | Write articles with fact-checking |
| `research-report` | Research and report generation |
| `adapter-generator` | Create new adapters (meta!) |

**Note**: Adapters are optional. The new ProjectSpec Wizard allows flexible task definitions without rigid adapters - just describe what each layer should do in natural language.

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

### 2. Create a New Project
- Click **"Create New Project"** to open the 4-step wizard:
  1. **Name** - Enter project codename
  2. **Layers** - Choose how many workforce layers (1-99)
  3. **Resources** - Add input files/folders, describe them, set output directory
  4. **Configure** - For each layer: set type (Manager/Teamleader/Worker), workforce size, task description

### 3. Workers Auto-Launch
- After creating the project, workers spawn automatically
- Each worker opens in a new VS Code window
- Workers start executing tasks immediately

### 4. Monitor Progress
Watch the sidebar for real-time status updates

---

## 🔧 Configuration

### project-spec.xml (generated by wizard)
```xml
<project version="1.0">
  <name>my-project</name>
  <workforce_layers>3</workforce_layers>
  
  <resources>
    <description>Each .md file is a separate task</description>
    <output_directory>./output/</output_directory>
  </resources>
  
  <layers>
    <layer number="1">
      <type>manager</type>
      <workforce_size>1</workforce_size>
      <reporting>Report progress to status.md</reporting>
      <task_description>Distribute topics to teamleaders</task_description>
    </layer>
    <layer number="2">
      <type>teamleader</type>
      <workforce_size>4</workforce_size>
      <task_description>Create detailed briefs for workers</task_description>
    </layer>
    <layer number="3">
      <type>worker</type>
      <workforce_size>8</workforce_size>
      <task_description>Write article based on brief</task_description>
    </layer>
  </layers>
</project>
```

### hierarchy-config.xml (auto-generated)
```xml
<hierarchy_config>
  <max_depth>3</max_depth>
  <emergency_brake>
    <max_total_instances>100</max_total_instances>
  </emergency_brake>
  <health_monitoring>
    <enabled>true</enabled>
    <heartbeat_interval_seconds>60</heartbeat_interval_seconds>
  </health_monitoring>
</hierarchy_config>
```

---

## 🧪 Project Status

> **🟢 Alpha — Functional with Active Development**

Version 0.4.3 (January 2026) includes:
- ✅ Working worker spawning with auto-launch
- ✅ XML-based communication (migrated from JSON)
- ✅ Heartbeat monitoring and self-healing
- ✅ Task queue management
- ✅ Adapter system (optional)
- ✅ Sidebar UI with controls
- ✅ ProjectSpec Wizard (4-step layer configuration)
- ✅ Layer-based workforce with custom prompts

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

EggBots™ get very excited when they see stars.  
(It's in their corporate statute. Probably.)
