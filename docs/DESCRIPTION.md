# ADG-Parallels - Complete Project Description

**Version:** 1.0.0 (Target Architecture)  
**Date:** 2026-01-17  
**Status:** Design Document for Refactoring

---

## 1. Executive Summary

ADG-Parallels is a VS Code extension that enables **hierarchical, parallel AI task processing** through multiple instances of GitHub Copilot. Users can orchestrate complex projects by delegating tasks to autonomous AI agents ("ejajki" 🥚) organized in a corporate-like hierarchy.

### Core Concept

```
Human CEO → AI Executives → AI Managers → AI Workers → Output
     ↓           ↓              ↓            ↓
  "Create    "Split into    "Assign to   "Write the
encyclopedia"  departments"   teams"      articles"
```

---

## 2. Architecture Overview

### 2.1 Hierarchical Structure

The system uses a folder-based hierarchy where each folder name encodes the agent's capabilities:

```
.adg-parallels_{ROLE}_W{workers}_S{sibling}_U{uid}/
              │       │          │          │
              │       │          │          └── Unique ID (global)
              │       │          └── Sibling index (position among peers)
              │       └── Max subordinates (hiring limit)
              └── Role code (unique per hierarchy depth, see 2.2)
```

### 2.2 Role Hierarchy
2.2.1. Rola pomiając CEO są uniknalne per długość drabiny i wskazują warstwę w naszej "korporacji"

# 1 WARSTWA ZAWSZE
CEO     | Chief Egg Officer
# 2 WARSTWY
CEO     | Chief Egg Officer
EXECOPS | Execution Operations Associate
# 3 WARSTWY
CEO     | Chief Egg Officer
PROCCTL | Process Control Manager
TASKENG | Task Execution Specialist
# 4 WARSTWY
CEO     | Chief Egg Officer
STRATOP | Strategic Operations Director
DELIVCO | Delivery Coordination Lead
EXESUPP | Execution Support Agent

2.2.2. Warstwa 5 i kolejne, aż do max doopuszczalnej 16 warstwy opisane są w pliku docs\CHAIN_OF_COMMAND_xD.md


### 2.3 Example Folder Structure

```
workspace/
└── .adg-parallels_CEO_W10_S0_U00001/                      ← CEO - Chief Egg Officer (Layer 0)
    ├── SOURCES/                                            ← Input materials
    ├── OUTPUT/                                             ← Final deliverables
    ├── TEMP/                                               ← CEO's workspace
    ├── corporate-statute.md                                ← Company constitution
    ├── project-config.xml                                  ← Mission + hardlimits
    ├── watch-policy.xml                                    ← IO monitoring config
    ├── population.db                                       ← SQLite state database
    │
    ├── .adg-parallels_STRATOP_W5_S1_U00002/                ← Strategic Operations Director (Layer 1)
    │   ├── my-orders.xml                                   ← Orders from CEO
    │   ├── TEMP/                                           ← STRATOP's workspace
    │   │
    │   ├── .adg-parallels_DELIVCO_W3_S1_U00010/            ← Delivery Coordination Lead (Layer 2)
    │   │   ├── my-orders.xml                               ← Orders from STRATOP
    │   │   ├── TEMP/                                       ← DELIVCO's workspace
    │   │   │
    │   │   ├── .adg-parallels_EXESUPP_W0_S1_U00025/        ← Execution Support Agent (Layer 3) 🥚
    │   │   │   ├── my-orders.xml                           ← Orders from DELIVCO
    │   │   │   └── TEMP/                                   ← EXESUPP's workspace
    │   │   │
    │   │   └── .adg-parallels_EXESUPP_W0_S2_U00026/        ← Execution Support Agent (Layer 3) 🥚
    │   │       ├── my-orders.xml
    │   │       └── TEMP/
    │   │
    │   └── .adg-parallels_DELIVCO_W3_S2_U00011/            ← Delivery Coordination Lead (Layer 2)
    │       ├── my-orders.xml
    │       └── TEMP/
    │
    └── .adg-parallels_STRATOP_W5_S2_U00003/                ← Strategic Operations Director (Layer 1)
        ├── my-orders.xml
        ├── TEMP/
        └── ...
```

---

## 3. Operating Modes

### 3.1 Extension States

The extension operates in different modes based on folder detection:

| Mode | Condition | Capabilities |
|------|-----------|--------------|
| **Inactive** | No `.adg-parallels_*` folder | UI only, no processing |
| **CEO** | Has `.adg-parallels_CEO_*` folder | Full control, can spawn all |
| **Executive** | Has `VP`, `DIR`, or `MGR` folder | Can delegate within limits |
| **Worker** | Has `WRK`, `JR`, or `INT` folder | Execute tasks only |

### 3.2 Global Switches

Two-level control system for IO and processing:

```
┌─────────────────────────────────────────────────────────────────────┐
│  UI LAYER                                    [Always ON]            │
│  • Sidebar displays                                                 │
│  • Buttons work                                                     │
│  • Zero IO, zero background processing                              │
├─────────────────────────────────────────────────────────────────────┤
│  🔘 WATCH MODE (Global Switch)               [ON/OFF per window]    │
│  • fs.watch() on control files                                      │
│  • Polling for folder detection                                     │
│  • Cross-window state sync                                          │
│  • IO: low-medium (read only, event-driven)                         │
├─────────────────────────────────────────────────────────────────────┤
│  🚀 PROCESSING MODE (Project Switch)         [ON/OFF per project]   │
│  • Workers execute tasks                                            │
│  • Spawning new windows                                             │
│  • Writing outputs                                                  │
│  • IO: high (read + write)                                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Configuration Files

### 4.1 Project Configuration (CEO only)

**`project-config.xml`** - Mission and global constraints (read-only for subordinates):

```xml
<project-config version="1.0">
  <!-- Hard limits (enforced by system) -->
  <hard-limits>
    <max-depth>4</max-depth>
    <max-total-workers>50</max-total-workers>
    <max-workers-per-manager>10</max-workers-per-manager>
    <max-concurrent-slots>20</max-concurrent-slots>
  </hard-limits>
  
  <!-- Mission statement (visible to all) -->
  <mission>
    Create a comprehensive animal encyclopedia.
    Each article: minimum 1000 words, encyclopedic style.
    Include: history, characteristics, habitat, behavior.
  </mission>
  
  <!-- Resource paths -->
  <paths>
    <sources>./SOURCES/</sources>
    <output>./OUTPUT/</output>
  </paths>
</project-config>
```

### 4.2 Watch Policy

**`watch-policy.xml`** - IO monitoring configuration:

```xml
<watch-policy version="1.0">
  <!-- Folder detection -->
  <global-project-folder-check interval-ms="1000" />
  
  <!-- Folder content monitoring -->
  <project-folder-content-watch interval-ms="2000" />
  
  <!-- File reading strategy -->
  <project-files-auto-read active="true" frequency-ms="500" />
  <project-files-metadata-monitor active="true" />
  <project-files-reader-cooldown active="true" time-ms="100" />
  
  <!-- Optional: explicit file list (mutually exclusive with auto-read) -->
  <project-closed-filelist active="false">
    <file pattern="tasks.xml" interval-ms="500" />
    <file pattern="*.trigger" interval-ms="200" />
  </project-closed-filelist>
  
  <!-- Blacklist -->
  <project-files-blacklist>
    <pattern>*.log</pattern>
    <pattern>*.tmp</pattern>
    <pattern>backup-*</pattern>
  </project-files-blacklist>
</watch-policy>
```

### 4.3 Worker Configuration

**`my-limits.xml`** - Delegation constraints (created by parent, read-only):

```xml
<my-limits>
  <layer>2</layer>
  <role>DIR</role>
  <depth-remaining>2</depth-remaining>
  <max-subordinates>5</max-subordinates>
  <can-hire>true</can-hire>
</my-limits>
```

**`my-orders.xml`** - Task assignment (created by parent, read-only):

```xml
<my-orders>
  <objective>
    Manage the MAMMALS department.
    Ensure comprehensive coverage of all major species.
    Quality standard: encyclopedic, factual, well-researched.
  </objective>
  
  <deadline>2026-01-20T18:00:00Z</deadline>
  
  <guidelines>
    <guideline>Priority: domestic animals first</guideline>
    <guideline>Avoid: controversial topics</guideline>
    <guideline>Include: conservation status</guideline>
  </guidelines>
</my-orders>
```

---

## 5. Population Control

### 5.1 Slot Management

Limited concurrent windows to prevent resource exhaustion:

```
Available slots: 20
Potential agents: 3 × 5 × 10 = 150

Solution: Queue + Slot Manager
```

**Priority rules for slot assignment:**
1. Higher layers first (must delegate before workers can start)
2. `AWAITING_SUBORDINATES` before `QUEUED` (will free slot faster)
3. FIFO within same priority

### 5.2 SQLite Database — Runtime Hub

**`runtime.db`** - Single source of truth for all runtime state (WAL mode enabled):

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- TASKS: Central task queue with atomic claiming
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    layer INTEGER NOT NULL,
    payload TEXT,                    -- Task data (JSON or plain text)
    status TEXT NOT NULL DEFAULT 'UNASSIGNED'
        CHECK(status IN ('UNASSIGNED','PROCESSING','DONE','FAILED')),
    assigned_worker TEXT,            -- Worker UID that claimed this task
    result_path TEXT,                -- Path to output file
    error_message TEXT,
    created_at INTEGER NOT NULL,     -- Unix timestamp
    updated_at INTEGER NOT NULL
);

-- Atomic task claim pattern:
-- UPDATE tasks SET status='PROCESSING', assigned_worker=?, updated_at=strftime('%s','now')
-- WHERE id = (SELECT id FROM tasks WHERE status='UNASSIGNED' AND layer=? LIMIT 1)
-- RETURNING *;

-- ═══════════════════════════════════════════════════════════════════════════
-- WORKERS: Registry + Heartbeat (replaces heartbeat.xml per worker)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE workers (
    uid TEXT PRIMARY KEY,            -- e.g., 'U00011'
    folder_name TEXT NOT NULL,       -- e.g., '.adg-parallels_DELIVCO_W0_S2_U00011'
    folder_path TEXT NOT NULL,       -- Full path to worker folder
    role TEXT NOT NULL,              -- e.g., 'DELIVCO'
    layer INTEGER NOT NULL,
    parent_uid TEXT,                 -- NULL for CEO
    
    status TEXT NOT NULL DEFAULT 'QUEUED'
        CHECK(status IN ('QUEUED','SLOT_ASSIGNED','IDLE','WORKING','AWAITING_SUBORDINATES','DONE','ERROR','SHUTDOWN')),
    
    slot_id INTEGER,                 -- Assigned slot (NULL if queued)
    last_heartbeat INTEGER,          -- Unix timestamp of last heartbeat
    tasks_completed INTEGER DEFAULT 0,
    tasks_failed INTEGER DEFAULT 0,
    
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    
    current_task_id INTEGER,         -- FK to tasks.id
    error_message TEXT,
    
    FOREIGN KEY (current_task_id) REFERENCES tasks(id)
);

-- Health check query:
-- SELECT uid, role, (strftime('%s','now') - last_heartbeat) as seconds_since_heartbeat
-- FROM workers WHERE status NOT IN ('DONE','SHUTDOWN','ERROR')
-- AND last_heartbeat < strftime('%s','now') - 90;

-- ═══════════════════════════════════════════════════════════════════════════
-- SLOTS: Concurrent window allocation (limited resource)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE slots (
    slot_id INTEGER PRIMARY KEY,
    worker_uid TEXT,
    assigned_at INTEGER,
    FOREIGN KEY (worker_uid) REFERENCES workers(uid)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- EVENTS: Audit log for dashboard and debugging
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,      -- Unix timestamp
    event_type TEXT NOT NULL,        -- TASK_CLAIMED, TASK_DONE, HEARTBEAT, ERROR, SPAWN, etc.
    worker_uid TEXT,
    task_id INTEGER,
    details TEXT,                    -- JSON payload for extra data
    
    FOREIGN KEY (worker_uid) REFERENCES workers(uid),
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PROJECT: Key-value store for project metadata
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE project (
    key TEXT PRIMARY KEY,
    value TEXT
);
-- Examples:
-- ('project_name', 'encyclopedia')
-- ('started_at', '2026-01-17T12:00:00Z')
-- ('wizard_completed', 'true')
-- ('project_started', 'true')
-- ('max_slots', '20')
-- ('max_depth', '4')

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES for common queries
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_layer_status ON tasks(layer, status);
CREATE INDEX idx_workers_status ON workers(status);
CREATE INDEX idx_workers_parent ON workers(parent_uid);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_events_worker ON events(worker_uid);
```

**Why SQLite WAL mode?**
- Multiple workers can read simultaneously
- One writer doesn't block readers
- Atomic transactions without custom locking
- Cross-platform (Windows/Cygwin/Linux)
- Single file = easy backup/restore

### 5.3 Status Transitions

```
QUEUED → SLOT_ASSIGNED → PROCESSING → AWAITING_SUBORDINATES → DONE
                              ↓                                  ↑
                           (if leaf)────────────────────────────┘
                              ↓
                           ERROR (on failure)
```

---

## 6. MCP Tools (AI Interface)

Ejajki interact with the system through Model Context Protocol tools:

### 6.1 Project Management

```typescript
create_project({ name, description, output_dir })
→ Creates project structure, returns project_id

list_projects()
→ Lists all projects in workspace

get_project_status(project_id)
→ Returns: tasks done/working/pending
```

### 6.2 Workforce Management

```typescript
hire_worker({ 
  role, 
  task, 
  can_hire?, 
  max_subordinates?, 
  depth_remaining? 
})
→ Creates subordinate, returns worker_uid

hire_team({ workers: [...] })
→ Batch hire multiple subordinates

check_team_status()
→ Returns: { total, by_status, all_complete, blocking, errors }

await_subordinates_completion({ timeout_minutes, on_error })
→ Blocks until all children DONE/ERROR
```

### 6.3 Task Execution

```typescript
get_my_orders()
→ Returns current task assignment (read-only)

get_my_limits()
→ Returns delegation constraints (read-only)

get_mission()
→ Returns CEO's mission statement (read-only)

complete_task({ output_file, summary })
→ Marks own task as completed

report_progress({ message, progress_percent })
→ Sends status update to parent
```

### 6.4 Results Collection

```typescript
collect_results({ include_incomplete? })
→ Gathers all subordinate outputs

aggregate_results({ output_file, format })
→ Merges results into single document

get_subordinate_result(uid)
→ Returns specific subordinate's output
```

---

## 7. Dashboard

Real-time visualization of the corporate structure:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🏢 ADG-PARALLELS COMMAND CENTER                           🔴 LIVE (1s)    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  POPULATION              SLOTS (20)                 QUEUE                   │
│  ══════════════          ══════════════════         ══════════════          │
│  Total:      84          ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░      1. U00101 VP (2:34)    │
│  Active:     14          14/20 occupied             2. U00102 DIR (2:12)   │
│  Queued:     23                                     3. U00103 MGR (1:58)   │
│  Done:       45          01: 👔 U00001 CEO          ... +20 more           │
│  Errors:      2          02: 🎩 U00002 VP 78%                              │
│                          03: 📊 U00010 DIR 34%                             │
│  Throughput: 12/min      ...                                               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  HIERARCHY TREE                                                             │
│  ══════════════════════════════════════════════════════════════════════     │
│                                                                             │
│  👔 U00001 CEO [AWAITING] ─────────────────────────────────────────────     │
│  ├── 🎩 U00002 VP Zwierzęta [PROCESSING 78%]                               │
│  │   ├── 📊 U00010 DIR Ssaki [PROCESSING 34%]                              │
│  │   │   ├── 📋 U00025 MGR Drapieżniki [AWAITING]                          │
│  │   │   │   ├── 🎯 U00050 TL Koty [PROCESSING]                            │
│  │   │   │   │   ├── ⭐ U00080 SR [PROCESSING 92%]                         │
│  │   │   │   │   │   ├── ✅ 🥚 U00120 WRK "Koty perskie" [DONE]            │
│  │   │   │   │   │   └── 🥚 U00121 WRK "Koty syjamskie" [PROCESSING]       │
│  │   │   │   │   └── 🐣 U00090 JR [QUEUED]                                 │
│  │   │   └── ✅ 📋 U00026 MGR Roślinożercy [DONE]                          │
│  │   └── ✅ 📊 U00011 DIR Ptaki [DONE]                                     │
│  └── ✅ 🎩 U00003 VP Rośliny [DONE]                                        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  RECENT EVENTS                                                              │
│  ══════════════════════════════════════════════════════════════════════     │
│                                                                             │
│  10:45:32  ✅ U00120 WRK completed "Koty perskie" (1,247 words)            │
│  10:45:18  🚀 U00121 WRK started "Koty syjamskie"                          │
│  10:44:55  📥 U00003 VP collected 12 results                               │
│  10:44:42  🔴 U00004 VP ERROR: Rate limit exceeded                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. User Interface

### 8.1 Sidebar Panel

```
┌─────────────────────────────────────────┐
│  ADG-Parallels                     v1.0 │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ 👁️ Watch Mode         [🟢 ACTIVE] │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ 🚀 Processing         [🟡 PAUSED] │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  📊 Current Project: encyclopedia       │
│     Role: 👔 CEO                        │
│     Status: AWAITING_SUBORDINATES       │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  [📁 New Project]  [📋 Dashboard]       │
│  [⚙️ Settings]     [📖 Help]            │
│                                         │
└─────────────────────────────────────────┘
```

### 8.2 Project Wizard (for Humans)

4-step wizard for creating projects:

1. **Project Name** - Identifier and description
2. **Hierarchy Depth** - How many layers allowed
3. **Resources** - Input files/folders, output directory
4. **Initial Task** - First-level delegation setup

### 8.3 MCP Tools (for AI)

AI agents use the same functionality through programmatic tools:
- `create_project()` instead of wizard
- `hire_worker()` instead of manual spawning
- `complete_task()` instead of file creation

---

## 9. Communication Patterns

### 9.1 File-Based Triggers

```
Parent creates:              Child detects:
─────────────────────────    ─────────────────────────
./subordinates/X/            fs.watch triggers
  my-orders.xml              Child reads orders
  my-limits.xml              Child knows limits
```

### 9.2 Completion Notifications

```
Child completes:             Parent detects:
─────────────────────────    ─────────────────────────
UPDATE workers               SQLite change
SET status='DONE'
                             
./notifications/             fs.watch triggers
  for_U00042.trigger         Parent queries SQLite
```

### 9.3 Navigation

Ejajka always knows its position:

```typescript
// From folder name: .adg-parallels_DIR_D4_W3_S2_U00011
const myRole = 'DIR';           // I'm a Director
const maxDepth = 4;             // Project allows 4 layers
const canDelegate = true;       // maxDepth > myLayer
const maxWorkers = 3;           // I can hire 3 subordinates
const myIndex = 2;              // I'm 2nd among siblings
const myUid = 'U00011';         // My unique ID

// Find CEO (always at root)
const pathToCEO = '../'.repeat(myLayer) + '.adg-parallels_CEO_*/';
```

---

## 10. Glossary

| Term | Meaning |
|------|---------|
| **Ejajka** 🥚 | AI agent instance (worker in VS Code window) |
| **CEO** | Root agent with full control (human or AI) |
| **Subordinate** | Agent created by and reporting to another agent |
| **Slot** | Active VS Code window allocation (limited resource) |
| **Queue** | Waiting list for slot assignment |
| **Watch Mode** | File system monitoring for control files |
| **Processing Mode** | Active task execution and spawning |
| **Delegation** | Creating subordinate to handle subtask |
| **Poganiacz** | Continuation prompt for stuck agents |

---

## 11. Design Principles

1. **Folder = Identity** - All agent metadata encoded in folder name
2. **Files = Communication** - XML files for orders, triggers, results
3. **SQLite = Truth** - Central database for state and aggregation
4. **Dashboard = Visibility** - Real-time monitoring of entire hierarchy
5. **Tools = Interface** - Same functionality for humans (GUI) and AI (MCP)
6. **Limits = Safety** - Hardcoded constraints prevent runaway spawning

---

*This document describes the target architecture for ADG-Parallels v1.0.0.*









---

WIZARD UX SPEC
Integrated v1.0 + TASKLIST modes
Version: 1.0
Scope: Wizard UI/UX behavior (no XML schema here)
Target: VS Code extension webview (CEO only)

Legend:
() radio button
(*) default
[] checkbox
{label}[constraints] input
[browse...] path picker
[edit] manual edit
[LOAD QUEUE] parse tasklist + show result

============================================================
1. Global UI rules
============================================================

1.1. Navigation
1.1.1. Each screen has: PREVIOUS, NEXT
1.1.2. Screen 0 uses: CANCEL, NEXT
1.1.3. Final screen uses: PREVIOUS, FINISH, CREATE/START
1.1.4. FINISH sets wizard_completed=true and exits (no runtime start)
1.1.5. CREATE/START sets wizard_completed=true, project_started=true and starts runtime

1.2. Autosave to GENERAL_TASK_PROPERTIES.xml
1.2.1. Any PREVIOUS/NEXT/FINISH/CREATE triggers:
1.2.1.1. Screen-level validation (format only)
1.2.1.2. Write current form state into XML (even if incomplete)
1.2.1.3. Clearing a field + leaving the step clears XML value (mirror behavior)

1.3. Validation modes
1.3.1. Soft validation (per step):
1.3.1.1. Inline red highlight + tooltip
1.3.1.2. NEXT allowed unless required (*) field invalid on this step
1.3.2. Hard validation (final):
1.3.2.1. Blocks CREATE/START if any blocking errors exist
1.3.2.2. Shows error list with jump-to-step links
1.3.3. Warning validation:
1.3.3.1. Never blocks CREATE/START
1.3.3.2. Shows yellow warnings in Summary/Validation

1.4. Path standard
1.4.1. User chooses path_standard: Windows | Cygwin
1.4.2. All paths displayed + saved in chosen standard (normalized)
1.4.3. UI may show both (readonly) as preview when useful

1.5. CEO vs Worker guard
1.5.1. On wizard open, scan workspace/ for directories:
1.5.1.1. If any workspace/.adg-parallels_* exists AND is not _CEO:
      Abort wizard with a dedicated error screen:
      "Worker workspace detected. This wizard can only run in CEO workspace."
      Include list of found worker dirs for clarity.
1.5.2. If workspace/.adg-parallels_CEO/ exists:
1.5.2.1. Load XML and decide whether to show Welcome or Resume/Started flow

============================================================
2. Screen 0: WELCOME / RESUME / STARTED
============================================================

2.1. Entry conditions
2.1.1. If CEO folder does not exist:
      Mode: NEW PROJECT
2.1.2. If CEO folder exists:
2.1.2.1. If project_started=false:
        Mode: RESUME WIZARD
2.1.2.2. If project_started=true:
        Mode: PROJECT ALREADY STARTED (danger prompt)

2.2. NEW PROJECT view
2.2.1. Help text: what wizard does, what CEO/worker are, data is saved continuously
2.2.2. Optional UI preference:
      [ ] Show advanced options by default
2.2.3. Buttons:
2.2.3.1. CANCEL (label: "Anuluj i usuń")
2.2.3.2. NEXT

2.3. RESUME WIZARD view
2.3.1. Text: "Project folder exists. Load settings and continue editing?"
2.3.2. Buttons:
2.3.2.1. CANCEL (close wizard)
2.3.2.2. NEXT (loads XML into UI and proceeds to Screen 1)

2.4. PROJECT ALREADY STARTED view
2.4.1. Text (main):
      "Projekt już istnieje i został rozpoczęty.
       Czy mimo tego chcesz go modyfikować?
       Zatrzyma to procesowanie i zrestartuje pracę workerów."
2.4.2. Radio:
      () Tak
      (*) Nie
2.4.3. NEXT behavior:
2.4.3.1. If "Nie": close wizard
2.4.3.2. If "Tak": show 2-step confirm modal:
      (1) "Stop processing now?"
      (2) "Delete worker workspaces and reset workers?"
      If confirmed:
        - stop runtime
        - close processing windows (if any)
        - delete worker workspaces
        - load XML into UI and continue to Screen 1

2.5. CANCEL behavior (special)
2.5.1. If CEO folder created during this wizard session and project not started:
      confirm + delete workspace/.adg-parallels_CEO/
2.5.2. Otherwise:
      close wizard without deleting

============================================================
3. Screen 1: BASE SETTINGS
============================================================

3.1. Fields
*3.1.1. {Nazwa projektu:}[0-9a-zA-Z_-]{1..64}
*3.1.2. {Ilość warstw:}[(*) 1 (easy mode) () 2+ (advanced)]
*3.1.3. {MAKSYMALNA ilość agentów AI łącznie:}[1..99]
3.1.4. {Katalog bazowy projektu (Windows):}[readonly] C:\vscode\.adg-parallels_CEO\
3.1.5. {Katalog bazowy projektu (Cygwin):}[readonly] /cygdrive/c/vscode/.adg-parallels_CEO/
*3.1.6. {Standard ścieżek w UI i XML:}(*) Windows () Cygwin

3.2. Behavior
3.2.1. Changing "Ilość warstw"
3.2.1.1. Switching to "1 (easy)":
      - hide steps for layers 2..16
      - mark layers 2..16 as disabled in UI
      - on save, clear XML for layers 2..16 (cascade clear)
3.2.1.2. Switching to "2+ (advanced)":
      - enable layer activation flow for layers 2..16

3.2.2. Changing "Standard ścieżek"
3.2.2.1. Updates display + normalization of all path fields in later steps
3.2.2.2. Stores this choice also as "last_used_default" in extension storage
      (so new projects default to last chosen)

3.3. Step validation (blocking NEXT)
3.3.1. Project name regex must pass
3.3.2. Max agents must be within range

============================================================
4. Screen 2: GLOBAL SETTINGS
============================================================

4.1. Fields
4.1.1. {Repozytorium globalne projektu (optional):}[browse...]
4.1.2. {Komentarz do globalnego repo dla wszystkich agentów (optional):}[multiline]
*4.1.3. {Załadować defaultowy AI instruction pack:}(*) TAK () NIE (niezalecane)
*4.1.4. {Domyślny katalog OUTPUT:}[path + browse...]
      default: {workspace}/.adg-parallels_CEO/OUTPUT/

4.2. Behavior
4.2.1. browse selects a directory; UI normalizes to chosen path standard
4.2.2. Non-existing path shows warning but still saved
4.2.3. If instruction pack set to "NIE" and user presses FINISH or CREATE/START:
      modal confirm:
      "Wybrano brak/usunięcie defaultowych instrukcji AI. To niezalecane. Kontynuować?"
      () Tak  () Nie

4.3. Step validation (blocking NEXT)
4.3.1. OUTPUT path is required and must be non-empty

============================================================
5. Screen 3: LAYER 1 (always enabled)
============================================================

5.1. Fields (basic)
5.1.1. {Nazwa warstwy:}[0-9a-zA-Z_-]{1..32} default=L1
5.1.2. {Ilość agentów w warstwie:}[1..99] default=1
5.1.3. {UID prefix warstwy (auto):}[readonly] L1

*5.1.4. {Tryb uruchamiania zadań w warstwie:}
      (*) Import CSV (;)
          [browse...] [paste CSV window] [LOAD QUEUE]
          status: {QUEUE LOADED: #### tasks} or {ERRORS: #}
      () Stała liczba
          {Task count:}[integer]
      () Custom stop condition
          {Stop condition description:}[multiline]

5.1.5. {Komentarz do trybu uruchamiania:}[multiline]
5.1.6. {Worker lifecycle:}
      () nowa instancja per zadanie
      (*) zachowuj instancje (reuse)

5.2. Fields (advanced section, hidden in easy mode unless toggled)
5.2.1. {Dodatkowy prompt po wykonaniu zadania:}[multiline]
5.2.2. {Repozytorium warstwy (optional):}[browse...]
5.2.3. {Komentarz do GLOBAL repo dla tej warstwy (optional):}[multiline]
5.2.4. {Pomiń kopiowanie repo GLOBAL dla tej warstwy:}() TAK (*) NIE
5.2.5. {Edytuj XML warstwy ręcznie:}[edit]

5.3. LOAD QUEUE behavior (CSV mode)
5.3.1. Source preference:
      - if pasted CSV content is non-empty, parse pasted
      - else parse file from browse path
5.3.2. Parse result UI:
      - show tasks count
      - show detected headers
      - show delimiter confirmation (;)
      - show up to 10 errors + "show more"
5.3.3. Persist parse summary into XML on LOAD QUEUE and also on NEXT/PREV/FINISH

5.4. Validation rules
5.4.1. Required: task mode selected
5.4.2. If CSV mode selected:
      - NEXT allowed even if not loaded (soft), BUT:
      - CREATE/START blocked until queue successfully loaded (hard)

============================================================
6. Screens 4..16: LAYER 2..N (advanced only)
============================================================

6.1. Step visibility conditions
6.1.1. Only visible if "2+ (advanced)" selected in Base Settings
6.1.2. Layer Li step is visible only if layer Li-1 is enabled (for i>2)

6.2. Fields (same as Layer 1, plus activation)
6.2.1. {AKTYWUJ WARSTWĘ:} []
6.2.2. If unchecked:
      - all other fields disabled (greyed)
6.2.3. If checked:
      - enable fields
      - defaults:
        layer name: Li (e.g., L2, L3...)
        uid prefix: Li (readonly)
6.2.4. When user unchecks AKTYWUJ and presses NEXT/PREV/FINISH:
      show confirm modal:
      "Wyłączenie warstwy Li usunie dane Li..L16 i ich workspace. Kontynuować?"
      () Tak  () Nie
      If "Tak":
        - clear layer Li..L16 values in UI + XML
        - delete worker workspaces for Li..L16 (if exist)
        - navigation adjusts: steps above Li disappear

============================================================
7. Screen N+1: SUMMARY (read-only preview)
============================================================

7.1. Sections
7.1.1. CEO root structure preview (paths, output)
7.1.2. Layers table:
      Layer | Enabled | Agents | Task mode | Queue size/finite | Output path
7.1.3. Global repo summary (path + comment)
7.1.4. Instruction pack: enabled/disabled
7.1.5. TASKLIST mode:
      - per-layer (recommended) OR global (advanced)

7.2. Edit links
7.2.1. Each section provides "Edit" button that jumps to the relevant step

============================================================
8. Screen N+2: VALIDATION + ACTIONS (may be merged with SUMMARY)
============================================================

8.1. Blocking errors list (blocks CREATE/START)
8.1.1. Format:
      - error title
      - field reference
      - [Go to step] action
8.1.2. Typical blocking errors:
      - missing required fields (*)
      - invalid ranges
      - CSV mode selected but queue not loaded successfully

8.2. Warnings list (never blocks)
8.2.1. Example warnings:
      - agents_max_total < sum(agents_per_layer)
      - skip_global_repo_copy=true AND no layer_repo set
      - reuse_worker_instance=false with huge task count

8.3. Final actions
8.3.1. FINISH
      - set wizard_completed=true
      - create missing folders (OUTPUT, etc.)
      - apply instruction pack choice (create or remove, with confirm)
      - exit wizard
8.3.2. CREATE/START
      - set wizard_completed=true
      - set project_started=true
      - create CEO + worker folder structures
      - initialize runtime (sqlite/queues/locks)
      - optionally switch to Processing Dashboard UI (if implemented)

============================================================
9. Minimal message catalog (copy-ready)
============================================================

9.1. Worker workspace detected:
"To okno jest uruchomione w workspace workera (.adg-parallels_*).
Wizard może działać tylko w workspace CEO (.adg-parallels_CEO)."

9.2. Disable layer cascade confirm:
"Wyłączenie warstwy {Lx} spowoduje usunięcie konfiguracji warstw {Lx}..L16
oraz ich katalogów workspace. Kontynuować?"

9.3. Instruction pack disable confirm:
"Wybrano brak/usunięcie defaultowych instrukcji AI.
To niezalecane. Kontynuować?"

9.4. Project started edit warning:
"Projekt został już rozpoczęty.
Modyfikacja ustawień zatrzyma procesowanie i zrestartuje workery."
