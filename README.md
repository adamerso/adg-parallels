# 🥚 ADG-Parallels  

### READ RELEASE DESCRIPTION FOR MORE ACTUAL DETAILS :)




### _AI Delegation Grid — Because one AI is never enough._

---

## 🚀 What is ADG-Parallels?

ADG-Parallels is a VS Code extension concept that turns your editor into a  
**distributed AI workforce** with hierarchy, automation, self-healing, and  
a hint of corporate nonsense.

Think of it as:

- Kubernetes, but for Copilot.
- A tiny startup inside your VS Code windows.
- A company where you are the CEO and all employees are polite little AI agents  
  (internally known as *EggBots™*, formerly “Ejajkas”).

It coordinates multiple AI sessions, delegates work, splits mega-tasks, and watches over workers like a very overcaffeinated project manager.

This repository currently contains the **vision**, **roadmap**, and **corporate statute** of this… organization.

Yes, we wrote a statute for AI employees. And yes, they follow it.  
We live in the future.

---

## ✨ Why Does This Exist?

Because Copilot (and every other LLM assistant) can:

- solve one task at a time,  
- in one window,  
- with one brain cell.

…while you are paying for **8+ parallel sessions** that just sit there doing nothing.

We fix that.

ADG-Parallels aims to:

- spawn multiple VS Code windows (“workers”)  
- delegate tasks between them  
- auto-start and auto-continue Copilot  
- detect when they finish or hang  
- restart zombie workers  
- and allow a Manager AI to coordinate everything

Basically:  
**Copilot Swarm → but make it corporate and cute.**

---

## 🧠 Roles in This AI Corporation

Inside ADG-Parallels, every VS Code window becomes a character in our little corporate sitcom:

| Role | Emoji | Description |
|------|-------|-------------|
| **CEO** | 🧑 | You. Supreme overlord. Defines goals. Drinks coffee. |
| **Manager** | 👔 | High-level AI (e.g., Claude Opus). Delegates tasks downward. |
| **Team Leader** | 👨‍💼 | Hybrid AI — works AND delegates. Middle management energy. |
| **Worker** | 👷 | GPT-powered workhorse doing individual tasks. |

Workers behave.  
Managers gossip.  
Team Leaders pretend they know what's going on.  
CEO wonders why everything is taking so long.

Corporate realism at its finest.

---

## 🏗️ High-Level Architecture (Simple Version)
```
CEO (You)
│
▼
Manager AI (Claude Opus)
│
├── Team Leader AI(s)
│ │
│ └── Worker 1…N (VS Code windows)
│
└── Worker Pool (GPT-4o, 4o-mini, etc.)
```


All communication happens through a shared folder:  
`.adg-parallels/` — the secret underground HQ of all EggBots™.

---

## 🔧 Key Features (Concept Phase)

### MVP
- Automatic project provisioning
- Spawn N workers in separate VS Code windows
- Auto-start Copilot with start prompts
- Auto-resume work when Copilot finishes
- JSON task queue with statuses
- “No tasks left → close worker window gracefully”

### Next Phases
- Dashboard for monitoring workers
- Pause/Resume entire workforce
- Adapter system (task plugins)
- Mega-task splitting (“write 100 articles” → auto-generated subtasks)
- Heartbeat & self-healing (detecting frozen workers)
- Hierarchical delegation (Team Leaders managing sub-workers)

Full details in:

- [PROJECT_VISION.md](docs/PROJECT_VISION.md)  
- [PROJECT_ROADMAP.md](docs/PROJECT_ROADMAP.md)  
- [CORPORATE_STATUTE.md](docs/CORPORATE_STATUTE.md) (yes, we have a statute) 🥚

---

## 🪄 The Adapter System (aka: “Teach Workers New Tricks”)

Each task has a `type`, e.g.:

- `article-generation`
- `translation`
- `code-audit`
- `task-splitter`
- `generic`

Adapters define:

- start prompts  
- output rules  
- completion criteria  
- how to save files  
- retries & validation  

Workers simply follow orders like good little digital employees.

---

## 🪓 Mega-Task Splitting

The CEO can say:

> “Write 100 cooking articles.”

And the Manager AI will:

- detect mega-task  
- split into 100 subtasks  
- assign them to workers  
- collect results  
- merge everything back

This is basically project management, except nobody complains about meetings.

---

## 💓 Heartbeat & Worker Self-Healing

Every worker sends a small “I’m alive” ping every 30 seconds.

If a worker doesn’t ping:

- Manager marks it as unresponsive  
- Closes the window  
- Reassigns the task  
- Launches a fresh worker  

A fully automated “IT guy walking around restarting computers”.

---

## 📦 File Structure Overview

```
.adg-parallels/
management/
project_tasks.json
hierarchy-config.json
attachments/

worker/
worker-config.json
worker-start-prompt.md
worker-continue-prompt.md
.heartbeat.json

adapters/
article-generation.adapter.json
translation.adapter.json
code-audit.adapter.json
task-splitter.adapter.json

jobs/
worker_1/
worker_2/
worker_3/
```

Workers are literally launched into their own tiny universe (folder).  
It’s adorable.

---

## 🎯 Target Audience

- AI power users  
- Copilot Pro users who want more than “one tab at a time”  
- Content creators  
- Agencies requiring mass automation  
- Developers doing parallel refactoring / audits  
- People who enjoy yelling “GO LITTLE WORKERS, GO!” at their monitor  

---

## 🧪 Status of the Project

> **🟡 Concept Phase — Implementation Begins Soon**  
This repository currently contains documentation, architecture and early planning.

Once the scaffolding is ready, the real fun begins (worker orchestration, dashboards, adapters, hierarchy…).

---

## 🤝 Contributing

Contributions, ideas, and feedback are welcome!  
Especially from humans (EggBots™ are not allowed to contribute to the repo yet — HR said no).

If you find this concept interesting, want to collaborate, or just want to say hi:

- Open an issue to discuss ideas  
- Star the repo to show support ⭐  
- Watch for updates — implementation is coming soon!

We're building this fast, but good ideas are always welcome.

---

## 📜 License

TBD — likely MIT or AGPL.

---

## ⭐ If you like the project, consider starring the repo.

EggBots™ get very excited when they see stars.  
(It’s in their corporate statute. Probably.)
