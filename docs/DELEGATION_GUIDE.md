# 🥚 Delegation Guide - Jak delegować pracę innym Ejajkom

**Wersja:** 1.0  
**Data:** 2026-01-17  
**Autor:** ADG-Parallels Team

---

## 🎯 Cel

Ten dokument opisuje, jak AI (Ty) może delegować zadania kolejnym instancjom AI (Ejajkom) przy użyciu narzędzi MCP.

---

## 📋 Quick Start - Delegacja w 3 krokach

### Krok 1: Upewnij się, że projekt jest zainicjowany

```typescript
// Sprawdź status projektu
mcp_adg-parallels_adg_status

// Jeśli projekt nie istnieje, zainicjuj go
mcp_adg-parallels_adg_init_project
Parameters:
  ceoPath: "d:/path/to/.adg-parallels_CEO_..."
  maxSlots: 4
  projectName: "My Project"
```

### Krok 2: Stwórz zadania

```typescript
// Stwórz listę zadań jako JSON array
mcp_adg-parallels_adg_create_tasks
Parameters:
  layer: 1
  payloads: '["Implement feature X", "Write tests for Y", "Document Z"]'
```

### Krok 3: Provision i uruchom workerów

```typescript
// Provision pierwszego workera
mcp_adg-parallels_adg_provision_worker
Parameters:
  layer: 1
  role: "STRATOP"  // opcjonalny
  taskInstructions: "You are responsible for implementing features."
  autoSpawn: true  // automatycznie otworzy nowe okno VS Code
```

---

## 🛠️ Szczegółowy Flow Pracy

### Scenariusz: Masz dużą listę zadań i chcesz je rozproszyć na N workerów

**Twoja sytuacja:**
- Musisz przerobić 50 plików (np. review kodu, generowanie dokumentacji)
- Chcesz, żeby pracowało nad tym 5 Ejajek równolegle

**Akcja:**

#### 1. Przygotuj listę zadań

```typescript
// Przykład: każdy plik to osobne zadanie
const tasks = [
  "Review src/file1.ts and suggest improvements",
  "Review src/file2.ts and suggest improvements",
  // ... 48 more
];

// Stwórz je w bazie
mcp_adg-parallels_adg_create_tasks
Parameters:
  layer: 1
  payloads: JSON.stringify(tasks)
```

**Output:**
```json
{
  "success": true,
  "data": {
    "created": 50,
    "taskIds": [1, 2, 3, ..., 50]
  }
}
```

#### 2. Provision 5 workerów

```typescript
// Worker #1
mcp_adg-parallels_adg_provision_worker
Parameters:
  layer: 1
  taskInstructions: "You are a code reviewer. Read the file, analyze it, and suggest improvements."
  autoSpawn: true

// Worker #2
mcp_adg-parallels_adg_provision_worker
Parameters:
  layer: 1
  autoSpawn: true

// ... repeat 3 more times
```

**Co się stanie:**
- Każdy worker dostanie:
  - Własny folder `.adg-parallels_STRATOP_W1_S1_U00002` (itd.)
  - `worker.xml` z konfiguracją
  - `.github/copilot-instructions.md` z instrukcjami
  - Nowe okno VS Code zostanie otwarte automatycznie

#### 3. Monitoruj progress

```typescript
// Co 30s sprawdzaj dashboard
mcp_adg-parallels_adg_get_dashboard

// Output:
{
  "success": true,
  "data": {
    "total_tasks": 50,
    "tasks_pending": 35,
    "tasks_processing": 5,
    "tasks_done": 10,
    "tasks_failed": 0,
    "total_workers": 5,
    "workers_by_status": {
      "WORKING": 5
    },
    "slots_used": 5,
    "slots_total": 10
  }
}
```

#### 4. Zbierz wyniki

Gdy wszystkie zadania są `DONE`:

```typescript
// Lista wszystkich zadań
mcp_adg-parallels_adg_list_tasks
Parameters:
  status: "DONE"

// Sprawdź output każdego workera
// Pliki będą w .adg-parallels_STRATOP_*_*/output/
```

---

## 🔧 Development Flow - Zmiana w Extension

**Scenariusz:** Zmieniłeś kod extension i chcesz, żeby workerzy używali nowej wersji.

### 1. Build + Package VSIX

```typescript
mcp_adg-parallels_adg_build_extension
Parameters:
  packageVsix: true
```

**Output:**
```json
{
  "success": true,
  "data": {
    "compiled": true,
    "vsixPath": "d:/path/to/adg-parallels-0.5.1.vsix",
    "message": "Extension compiled and packaged: ..."
  }
}
```

### 2. Install VSIX

```typescript
mcp_adg-parallels_adg_install_vsix
Parameters:
  force: true  // wymusza reinstall
```

**Output:**
```json
{
  "success": true,
  "data": {
    "vsixPath": "...",
    "installed": true,
    "message": "⚠️ IMPORTANT: Window reload is needed..."
  }
}
```

### 3. ⚠️ STOP - Nie reload automatycznie!

**Zamiast wywoływać `adg_reload_window`, po prostu napisz:**

```
✅ Extension zainstalowane pomyślnie!

⚠️ **UWAGA**: Wymagany reload okna, ale NIE MOGĘ go wykonać automatycznie,
bo to zepsuje obecny czat (permanentnie).

Proszę wykonaj reload MANUALNIE:
  • Naciśnij Ctrl+Shift+P
  • Wpisz "Developer: Reload Window"
  • Potwierdź

Po reload trzeba będzie rozpocząć NOWY czat.
```

---

## 📊 Monitorowanie i Debugging

### Sprawdź status projektu

```typescript
mcp_adg-parallels_adg_status
```

**Zwraca:**
- Informacje o projekcie (nazwa, ścieżka)
- Statystyki workerów (ile aktywnych, ile nieresponsywnych)
- Statystyki zadań (pending, processing, done, failed)
- Progress (%)

### Lista workerów

```typescript
mcp_adg-parallels_adg_list_workers
```

**Opcjonalne filtry:**
- `status: "WORKING"` - tylko pracujące
- `parentUid: "U00001"` - tylko dzieci danego workera

### Lista zadań

```typescript
mcp_adg-parallels_adg_list_tasks
Parameters:
  status: "FAILED"  // pokaż tylko failed
  layer: 1
  limit: 20
```

### Historia zdarzeń (audit log)

```typescript
mcp_adg-parallels_adg_get_events
Parameters:
  workerUid: "U00002"  // opcjonalnie, dla konkretnego workera
  limit: 50
```

**Zwraca:**
- Timestamp
- Typ eventu (TASK_CLAIMED, TASK_COMPLETED, WORKER_PROVISIONED, itd.)
- Worker UID
- Task ID
- Opis

---

## 🧪 Przykładowe Scenariusze

### Scenariusz A: Code Review w Parallelu

```typescript
// 1. Init project
mcp_adg-parallels_adg_init_project
Parameters:
  ceoPath: "d:/projects/code-review-project/.adg-parallels_CEO_1"
  projectName: "Mass Code Review"

// 2. Znajdź pliki do review
// (załóżmy masz listę 100 plików TypeScript)

// 3. Stwórz zadania
const files = [...]; // 100 plików
const tasks = files.map(f => `Review ${f} and provide feedback in output/${f}.review.md`);

mcp_adg-parallels_adg_create_tasks
Parameters:
  layer: 1
  payloads: JSON.stringify(tasks)

// 4. Provision 10 workerów
for (let i = 0; i < 10; i++) {
  mcp_adg-parallels_adg_provision_worker
  Parameters:
    layer: 1
    taskInstructions: "You are a senior code reviewer. Focus on: security, performance, readability."
    autoSpawn: true
}

// 5. Wait for completion
// (check status co 30s)

// 6. Zbierz wyniki
// Wszystkie review będą w output/ folderach workerów
```

### Scenariusz B: Dokumentacja API (hierarchia)

```typescript
// 1. CEO (Ty) stwórz zadania dla managerów (Layer 1)
mcp_adg-parallels_adg_create_tasks
Parameters:
  layer: 1
  payloads: '["Document module A", "Document module B", "Document module C"]'

// 2. Provision 3 managerów
// Każdy manager dostanie 1 moduł

for (let i = 0; i < 3; i++) {
  mcp_adg-parallels_adg_provision_worker
  Parameters:
    layer: 1
    role: "STRATOP"
    autoSpawn: true
}

// 3. Managerowie mogą sami provisjonować workerów (Layer 2)
// (w ich copilot-instructions będzie info jak to zrobić)
```

---

## 🚨 Ważne Uwagi

### ⚠️ Nie reload podczas czatu!

**Problem:** Reload okna VS Code podczas czatu powoduje, że czat zostaje **permanentnie zepsuty**.

**Rozwiązanie:**
- Narzędzie `adg_reload_window` zostało zmienione - **NIE wykonuje reloadu**
- Zamiast tego zwraca instrukcje dla usera
- **ZAWSZE** pisz userowi, że musi zrobić reload MANUALNIE i rozpocząć NOWY czat

### 🔒 Race Conditions

Task queue jest chroniony lock-filem (`proper-lockfile`), więc nie ma ryzyka,
że dwa workery claimną to samo zadanie.

### 📁 Worker Folder Structure

Każdy worker dostaje:
```
.adg-parallels_STRATOP_W1_S1_U00002/
├── worker.xml                    # Konfiguracja
├── output/                       # Tu zapisuje wyniki
└── .github/
    └── copilot-instructions.md   # Instrukcje dla AI
```

### 🎯 Task Payloads

Payload zadania to **zwykły string** - może zawierać:
- Ścieżkę do pliku: `"Review src/file.ts"`
- JSON: `'{"file": "src/file.ts", "action": "review"}'`
- Markdown: `"# Task\n\nDo something..."`

Worker dostanie ten payload w `task.payload` i musi go zinterpretować.

---

## 🏁 Checklist przed delegacją

- [ ] Projekt zainicjowany (`adg_init_project`)
- [ ] Zadania stworzone (`adg_create_tasks`)
- [ ] Workerzy provision'owani (`adg_provision_worker`)
- [ ] Workerzy otrzymali jasne instrukcje (`taskInstructions`)
- [ ] Monitoring uruchomiony (sprawdzaj `adg_status` co 30s)
- [ ] Plan na zbieranie wyników (gdzie są output files?)

---

## 📚 Powiązane Dokumenty

- [FLOW.md](./FLOW.md) - Szczegółowy flow systemu
- [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md) - Roadmap projektu
- [CORPORATE_STATUTE.md](./CORPORATE_STATUTE.md) - Hierarchia ról
- [../src/mcp/mcp-tools.ts](../src/mcp/mcp-tools.ts) - Implementacja narzędzi

---

**Powodzenia w delegacji, CEO! 🎩🥚**

*"Many Ejajkas, One Goal"*
