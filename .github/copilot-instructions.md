# GitHub Copilot Instructions for ADG-Parallels

## 📋 Versioning Policy (Semantic Versioning)

This project follows **Semantic Versioning** (SemVer). Always update the `version` field in `package.json` according to these rules:

### Version Format: `MAJOR.MINOR.PATCH`

| Change Type | Version Bump | Example | Description |
|-------------|--------------|---------|-------------|
| **Patch** (bugfix) | `+0.0.1` | `0.4.1` → `0.4.2` | Minor bug fixes, typo corrections, small improvements that don't change functionality |
| **Minor** (major bugfix) | `+0.1.0` | `0.4.1` → `0.5.0` | Major bug fixes, significant refactoring, new minor features, breaking changes within minor scope |
| **Major** (feature) | `+1.0.0` | `0.4.1` → `1.0.0` | Major new features, architectural changes, breaking API changes, milestone releases |

### When to Bump Version

- **+0.0.1 (Patch):**
  - Fixing typos in code or documentation
  - Small CSS/UI tweaks
  - Fixing edge case bugs
  - Updating dependencies (non-breaking)
  - Code cleanup without functional changes

- **+0.1.0 (Minor):**
  - Fixing critical bugs that affect core functionality
  - Adding new commands or features
  - Significant refactoring (e.g., JSON → XML migration)
  - Adding new configuration options
  - UI/UX improvements

- **+1.0.0 (Major):**
  - Complete architecture overhaul
  - New major feature set
  - Breaking changes to public API
  - First stable release (1.0.0)
  - Milestone achievements

### 🚨 IMPORTANT REMINDERS

1. **ALWAYS update version** after making changes before committing
2. **Never skip version bumps** - each deployment should have a unique version
3. **Document changes** in commit messages referencing the version
4. **Reset PATCH to 0** when bumping MINOR (e.g., `0.4.5` → `0.5.0`)
5. **Reset MINOR and PATCH to 0** when bumping MAJOR (e.g., `0.9.5` → `1.0.0`)

---

## 🏗️ Project Architecture

### File Formats
- **All configuration files use XML format** (not JSON)
- Adapters: `*.adapter.xml`
- Tasks: `tasks.xml`
- Hierarchy: `hierarchy-config.xml`
- Worker config: `worker.xml`

### Key Directories
- `src/` - TypeScript source code
- `resources/adapters/` - Task adapter templates (XML) - optional
- `resources/schemas/` - XSD schemas for validation
- `docs/` - Project documentation

### Core Components
- `extension.ts` - Entry point
- `src/core/` - Core business logic (pipeline, tasks, workers)
- `src/views/` - Webview UI components (ProjectSpec Wizard, Sidebar)
- `src/commands/` - VS Code command handlers

---

## 🔧 Development Commands

```bash
npm run compile    # Build TypeScript
npm run watch      # Watch mode for development
npm run vsix       # Package extension
```

---

## 📝 Coding Standards

1. Use TypeScript strict mode
2. Prefer XML over JSON for configuration
3. Use `fast-xml-parser` for XML parsing
4. Follow VS Code extension best practices
5. Document public APIs with JSDoc comments

---

## 🥚 The Ejajka Way

Remember: "Many Ejajkas, One Goal!" - Every worker (Ejajka) contributes to the collective success.
