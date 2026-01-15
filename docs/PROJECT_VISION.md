# 🚀 ADG-Parallels - Project Vision

**Current Version: v0.4.4**  
**Status: Alpha - Functional with Active Development**

---

## Project Name
**ADG-Parallels** (ADG = AI Delegation Grid)

## Motto
*"Many Ejajkas, One Goal"*

(Note: "Ejajka" is a humorous Polish name for AI, derived from pronouncing "AI" in Polish: A-I → Ej-Aj → Ejajka 🥚)

---

## 📋 What is this?

ADG-Parallels is a **fully functional VS Code extension** that enables **parallel task processing through multiple AI instances** organized in a corporate-like hierarchy.

Imagine having your own AI corporation:
- **You** are the CEO 🧑
- **Claude Opus** is your Manager 👔
- **Claude Sonnet** are your Team Leaders 👨‍💼
- **GPT-4o** workers do the actual work 👷

All running in parallel. All coordinated automatically. All using file-based XML communication.

**Core Features (v0.4.x):**
- 🔌 **Adapter System** - XML-based workflow definitions (optional)
- 💫 **Self-healing** - Heartbeat monitoring, auto-restart of frozen workers
- 🏢 **Hierarchy** - CEO → Manager → TeamLeader → Worker (up to 99 layers)
- 📊 **Sidebar UI** - Real-time monitoring and control
- 🧙 **ProjectSpec Wizard** - 4-step guided project setup with layer configuration
- 🧱 **Layer-based Workforce** - Define workforce per layer with custom prompts

---

## 🎯 The Problem We Solve

1. **Single session limitation**: AI assistants work on one task at a time per window
2. **Manual management**: With many tasks, you need to manually track statuses, collect outputs
3. **No coordination**: No native way to coordinate multiple AI sessions
4. **No fault tolerance**: When a session hangs, the task is lost
5. **No scalability**: No way to say "here's WHAT I want" and let the system organize work

---

## 💡 The Solution

An extension that:
1. **Automatically opens multiple VS Code windows** as "workers"
2. **Coordinates tasks** through shared XML files
3. **Uses vscode.lm API** to communicate with language models
4. **Tracks progress** via heartbeat system
5. **Supports hierarchy** - from Workers to Team Leaders managing their own teams
6. **Uses pipeline adapters** - complete workflow definitions
7. **Monitors health** - heartbeat (30s), auto-restart, task reassignment

---

## 🏛️ Architecture

### Roles in the System

| Role | Description | Model |
|------|-------------|-------|
| 🧑 **CEO** | Human defining tasks and overseeing | You |
| 👔 **Manager** | AI managing the project, delegating | Claude Opus |
| 👨‍💼 **Team Leader** | Hybrid AI - executes AND delegates | Claude Sonnet |
| 👷 **Worker** | AI executing specific tasks | GPT-4o / GPT-4o-mini |

### File Structure

```
📁 root_of_project_{name}/
├── project-spec.xml          ← Project configuration (layers, resources)
├── tasks.xml                 ← Task queue with statuses
├── hierarchy-config.xml      ← Hierarchy limits
├── finished.flag.xml         ← Created when all done
│
├── 📁 input/                 ← Source materials
├── 📁 workdir/               ← Working directory (per layer)
├── 📁 output/                ← Generated outputs
├── 📁 logs/                  ← Execution logs
│
├── 📁 prompts/
│   └── layer_*_prompt.md     ← Generated prompts per layer
│
└── 📁 workers/
    └── 📁 worker-L{layer}-{N}/ ← Each worker's workspace
        ├── worker.xml        ← Worker configuration
        ├── heartbeat.xml     ← Health status
        └── instructions.md   ← Task instructions
```

### Role Detection

```
workers/ folder exists + worker.xml?   → WORKER
management/ folder exists?             → MANAGER
Both exist?                            → TEAM LEADER
Neither?                               → CEO (main window)
```

---

## 🔌 Adapter System (Pipeline Paradigm)

Adapters are **complete pipeline definitions** - self-describing workflow specifications in XML.

| Adapter | Stages | Use Case |
|---------|--------|----------|
| `article-with-audit` | 8 | Writing → Proofreading → Audit |
| `translation` | 7 | Translation with review |
| `code-generation` | 7 | Code with tests and review |
| `research-report` | 7 | Research with synthesis |
| `adapter-generator` | 7 | Meta-adapter for creating adapters |

Each adapter defines:
- **Stages** - custom status names (e.g., `during_article_writing`)
- **Executors** - specific model per stage
- **Task-to-fulfill** - human-readable instructions
- **Inputs/Outputs** - with named references
- **Routing** - conditional logic
- **Forbidden patterns** - for audit stages

**Philosophy**: Extension = "dumb executor". All business logic in adapters.

```xml
<!-- Example stage from adapter -->
<stage id="2" name="during_article_writing">
    <task-to-fulfill>
        Write an article on the topic defined in title and description.
        Article should be comprehensive and well-structured.
    </task-to-fulfill>
    <executor>gpt-4o</executor>
    <input>
        <source name="task-definition" stage="initial">
            <description>Title and task description</description>
        </source>
    </input>
    <next-stage>
        <routing>On completion → awaiting_proofreading</routing>
    </next-stage>
</stage>
```

---

## 💓 Heartbeat & Self-Healing

Every worker writes a heartbeat file every **30 seconds**. Manager monitors:

- **Healthy** (heartbeat < 60s) → Continue working
- **Unresponsive** (>120s without heartbeat) → Restart worker, reassign task
- **Faulty** (3+ consecutive failures) → Alert CEO, disable worker

This ensures **high availability** and fault tolerance.

---

## ✨ Features by Phase

### ✅ Phase 1: Core (Complete)
- Project provisioning
- Worker spawning (N VS Code windows)
- Task execution via vscode.lm API
- Task completion detection
- XML-based task management
- `finished.flag.xml` for graceful shutdown

### ✅ Phase 2: UI (Complete)
- Sidebar panel (Activity Bar)
- ProjectSpec Wizard (4-step: Name → Layers → Resources → Configure)
- Processing ON/OFF control
- Stop/Resume/Kill buttons
- Layer-based workforce configuration
- Continuation prompts ("poganiacz") per layer
- Auto-spawn workers after project creation

### ✅ Phase 3: Adapters (Complete - Optional)
- XML adapter format
- Built-in adapters (5 types)
- Custom adapter support
- Multi-stage pipelines
- Per-stage model assignment

**Note**: Adapters are now optional. The new ProjectSpec Wizard allows flexible task definitions without rigid adapters.

### ✅ Phase 4: Audit Flow (Complete)
- Audit stages in pipeline
- Forbidden pattern checking
- Pass/fail routing

### 🟨 Phase 5: Task Splitting (80%)
- Meta-tasks via task-splitter adapter
- AI-driven splitting
- Output aggregation

### ✅ Phase 6: Health Monitoring (Complete)
- Heartbeat per worker (30s)
- Auto-restart frozen workers
- Task reassignment
- `finished.flag.xml` detection

### ✅ Phase 7: Hierarchy (Complete)
- Team Leader role
- Delegation limits (maxDepth=5, maxSubordinates=50)
- Emergency brake (100 total instances)
- Upward reporting

### 🟨 Phase 8: Polish (In Progress)
- Documentation updates
- Example projects

### 💡 Future Ideas
- Web dashboard
- External API integration (Notion, Jira)
- Multi-machine support
- Adapter marketplace

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript |
| Platform | VS Code Extension API |
| AI Communication | vscode.lm API |
| UI | VS Code Webview |
| Storage | XML files (file-based) |
| XML Parsing | fast-xml-parser |
| Config Validation | XSD schemas |

---

## 🎨 Naming and Branding

### "Ejajka" / "Ejajeczka" 🥚
A humorous Polish name for AI, derived from pronouncing "AI" in Polish (Ej-Aj).
Adds levity to the project while maintaining professional functionality.

### ADG = AI Delegation Grid
Acronym describing the project's essence - a grid for delegating tasks to AI.

---

## 👥 Target Audience

1. **AI power users** - maximize value from AI subscriptions
2. **Content creators** - mass generation of articles, translations
3. **Developers** - parallel code review, test generation
4. **Agencies** - scaling AI work

---

## 📜 Corporate Statute

The project includes a "Corporate Statute of ADG-Parallels" - rules for Ejajka collaboration in the hierarchy. Automatically attached to prompts.

See: [CORPORATE_STATUTE.md](CORPORATE_STATUTE.md)

(Yes, we have a corporate statute for AI employees. Yes, it's legally binding in the Ejajka jurisdiction. 😄)

---

## 📄 License

MIT License

---

## 🤝 Contributors

- **CEO**: Human with a vision 😄
- **Chief Architect**: Claude Opus
- **Future contributors**: Welcome!

---

*Last updated: January 2026*  
*Version: 0.4.3*

**Milestones achieved:**
- ✅ v0.1.x - Initial MVP
- ✅ v0.2.x - Sidebar UI, health monitoring
- ✅ v0.3.x - Pipeline adapters, wizards
- ✅ v0.4.x - Complete XML migration, ProjectSpec Wizard, layer-based workforce
