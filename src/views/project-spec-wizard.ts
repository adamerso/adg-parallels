/**
 * ADG-Parallels Project Spec Wizard
 * 
 * New wizard for creating project configuration XML.
 * 
 * WIZARD FLOW:
 *   Step 1: Project Name (a-zA-Z0-9_-)
 *   Step 2: Number of Workforce Layers (1-99 with up/down buttons)
 *   Step 3: Input Resources (files/folders + description + output directory)
 *   Step 4.1...4.N: Layer Configuration (one sub-step per layer)
 * 
 * OUTPUT: project_{projectName}.xml in root_of_project_{projectName}/
 * 
 * Philosophy:
 * - All text fields are interpreted by ejajka (AI)
 * - Minimal structure, maximum flexibility
 * - Examples shown as hints, not as form values
 * 
 * v1.0.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getNonce, getBaseStyles, getHeadScript } from './shared';
import { ensureDir, pathExists } from '../utils/file-operations';
import { logger } from '../utils/logger';
import { getSidebarProvider } from './sidebar-webview';
import { 
  loadProjectSpec, 
  getTotalWorkerCount, 
  getSpawningLayers,
  generateLayerPrompt,
  ProjectSpec 
} from '../core/project-spec-loader';

// =============================================================================
// HELPER: Write Worker XML
// =============================================================================

function writeWorkerXml(filePath: string, config: any): void {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<worker>
  <worker_id>${config.workerId}</worker_id>
  <role>${config.role}</role>
  <parent_role>${config.parentRole}</parent_role>
  <layer>${config.layer}</layer>
  <project_spec>${config.projectSpec}</project_spec>
  <paths>
    <project_root>${config.paths.projectRoot}</project_root>
    <worker_root>${config.paths.workerRoot}</worker_root>
    <output_dir>${config.paths.outputDir}</output_dir>
    <prompt_file>${config.paths.promptFile}</prompt_file>
    <tasks_file>${config.paths.tasksFile}</tasks_file>
  </paths>
  <created_at>${config.createdAt}</created_at>
  <instructions_version>${config.instructionsVersion}</instructions_version>
</worker>
`;
  fs.writeFileSync(filePath, xml, 'utf8');
}

// =============================================================================
// TYPES
// =============================================================================

/** Input file/folder resource */
interface InputFile {
  path: string;
  copyToLayers: string; // e.g., "1,2,4" or empty
}

/** Resource visibility per layer */
interface LayerResource {
  path: string;
  use: boolean;          // "use this resource" checkbox
  readonly: boolean;     // "don't modify, just study" checkbox
}

/** Layer type enum */
type LayerType = 'manager' | 'teamleader' | 'worker';

/** Configuration for a single layer */
interface LayerConfig {
  number: number;
  type: LayerType;
  workforceSize: number;     // Number of ejajki in this layer (1-99)
  reporting: string;         // Only for manager (required) and teamleader (optional)
  taskDescription: string;   // Main instruction for the layer
  resources: LayerResource[];
  // Continuation / "poganiacz" settings
  continuationPrompt: string;      // Prompt to nudge ejajka when stuck
  maxContinuationAttempts: number; // Max times to send continuation prompt (1-99)
}

/** Full wizard state */
interface WizardState {
  // Navigation
  currentStep: number;       // 1-4
  currentLayerIndex: number; // For step 4, which layer (0-based)
  
  // Step 1: Project Name
  projectName: string;
  
  // Step 2: Workforce Layers
  workforceLayers: number;
  
  // Step 3: Resources
  inputDescription: string;
  inputFiles: InputFile[];
  outputDirectory: string;
  
  // Step 4: Layer configs
  layers: LayerConfig[];
  
  // Validation
  errors: Record<string, string>;
}

// =============================================================================
// DEFAULTS & CONSTANTS
// =============================================================================

const DEFAULT_STATE: WizardState = {
  currentStep: 1,
  currentLayerIndex: 0,
  projectName: '',
  workforceLayers: 1,
  inputDescription: '',
  inputFiles: [],
  outputDirectory: './output/',
  layers: [],
  errors: {},
};

// Examples for hints (shown in UI, not as placeholders)
const EXAMPLES = {
  workDescription: [
    'Napisz artykuły blogowe 800-1200 słów na tematy z inputu. Styl angażujący, z przykładami.',
    'Przetłumacz dokumenty PL→EN. Zachowaj formalny ton. Terminy techniczne w oryginale.',
    'Dla każdego pliku .py napisz testy jednostkowe pytest. Pokrycie >80%.',
    'Przeanalizuj każdy plik i napisz dokumentację w stylu JSDoc/docstring.',
  ],
  inputDescription: [
    'Każdy plik .md to osobne zadanie',
    'CSV - każda linia to zadanie. Kol.1=temat, Kol.2=słowa kluczowe, Kol.3=długość',
    'JSON array - każdy element to osobne zadanie z polami: title, content, metadata',
    'Powtórz to samo zadanie 50 razy z różnymi losowymi parametrami',
  ],
  outputDescription: [
    'Pliki .md, nazwa: {numer}_{temat}.md',
    'Ta sama struktura folderów co input, pliki z sufiksem _translated',
    'Jeden plik XML ze wszystkimi wynikami',
    'Pliki .py obok oryginałów z prefixem test_',
  ],
  reporting: [
    'Raportuj postęp do pliku progress.xml co 10 zadań',
    'Aktualizuj plik status.md po każdym ukończonym batchu',
    'Zapisuj logi do reports/daily_{date}.log',
  ],
  layerConfigs: [
    'Manager: Podziel 1000 tematów na kategorie, przydziel do teamleaderów',
    'Teamleader: Dla otrzymanego batcha tematów stwórz szczegółowe briefy',
    'Worker: Napisz artykuł według otrzymanego briefu',
  ],
};

// =============================================================================
// WIZARD PANEL
// =============================================================================

export class ProjectSpecWizardPanel {
  public static currentPanel: ProjectSpecWizardPanel | undefined;
  private static readonly viewType = 'adgProjectSpecWizard';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _state: WizardState;
  private _disposables: vscode.Disposable[] = [];
  private _context?: vscode.ExtensionContext;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._state = JSON.parse(JSON.stringify(DEFAULT_STATE));

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        await this._handleMessage(message);
      },
      null,
      this._disposables
    );
  }

  public static show(extensionUri: vscode.Uri, context?: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (ProjectSpecWizardPanel.currentPanel) {
      ProjectSpecWizardPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ProjectSpecWizardPanel.viewType,
      '🥚 New Project Wizard',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    ProjectSpecWizardPanel.currentPanel = new ProjectSpecWizardPanel(panel, extensionUri);
    if (context) {
      ProjectSpecWizardPanel.currentPanel._context = context;
    }
  }

  public dispose(): void {
    ProjectSpecWizardPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }

  // ===========================================================================
  // MESSAGE HANDLING
  // ===========================================================================

  private async _handleMessage(message: any): Promise<void> {
    logger.info(`📨 [WIZARD] Message received: ${message.command}`, message);
    
    try {
      switch (message.command) {
        // Navigation
        case 'nextStep':
          logger.info('📨 [WIZARD] → nextStep clicked');
          this._nextStep();
          break;
        case 'prevStep':
          logger.info('📨 [WIZARD] → prevStep clicked');
          this._prevStep();
          break;
        case 'goToStep':
          logger.info(`📨 [WIZARD] → goToStep(${message.step}) clicked`);
          this._goToStep(message.step);
          break;
        case 'nextLayer':
          logger.info('📨 [WIZARD] → nextLayer clicked');
          this._nextLayer();
          break;
        case 'prevLayer':
          logger.info('📨 [WIZARD] → prevLayer clicked');
          this._prevLayer();
          break;
        case 'goToLayer':
          logger.info(`📨 [WIZARD] → goToLayer(${message.index}) clicked`);
          this._goToLayer(message.index);
          break;

        // Field updates
        case 'updateField':
          logger.debug(`📨 [WIZARD] → updateField: ${message.field} = ${message.value}`);
          this._updateField(message.field, message.value);
          break;
        case 'updateLayerField':
          logger.debug(`📨 [WIZARD] → updateLayerField: ${message.field} = ${message.value}`);
          this._updateLayerField(message.field, message.value);
          break;
        case 'incrementLayers':
          logger.info(`📨 [WIZARD] → incrementLayers(${message.delta})`);
          this._incrementLayers(message.delta || 0);
          break;
        case 'incrementWorkforce':
          logger.info(`📨 [WIZARD] → incrementWorkforce(${message.delta})`);
          this._incrementWorkforce(message.delta || 0);
          break;
        case 'incrementContinuation':
          logger.info(`📨 [WIZARD] → incrementContinuation(${message.delta})`);
          this._incrementContinuation(message.delta || 0);
          break;

        // File operations
        case 'addInputFile':
          logger.info('📨 [WIZARD] → addInputFile clicked');
          await this._addInputFile();
          break;
        case 'addInputFolder':
          logger.info('📨 [WIZARD] → addInputFolder clicked');
          await this._addInputFolder();
          break;
        case 'removeInputFile':
          logger.info(`📨 [WIZARD] → removeInputFile(${message.index})`);
          this._removeInputFile(message.index);
          break;
        case 'updateInputFile':
          logger.debug(`📨 [WIZARD] → updateInputFile(${message.index}, ${message.field})`);
          this._updateInputFile(message.index, message.field, message.value);
          break;
        case 'pickOutputDirectory':
          logger.info('📨 [WIZARD] → pickOutputDirectory clicked');
          await this._pickOutputDirectory();
          break;

        // Resource toggles
        case 'toggleResource':
          logger.info(`📨 [WIZARD] → toggleResource: ${message.path}.${message.field}`);
          this._toggleResource(message.path, message.field);
          break;

        // Actions
        case 'createProject':
          logger.info('🚀 [WIZARD] → CREATE PROJECT clicked!');
          await this._createProject();
          break;
        case 'cancel':
          logger.info('📨 [WIZARD] → cancel clicked');
          this.dispose();
          break;
        default:
          logger.warn(`📨 [WIZARD] Unknown command: ${message.command}`);
      }
    } catch (error) {
      logger.error(`❌ [WIZARD] Error handling message ${message.command}:`, error);
      vscode.window.showErrorMessage(`Wizard error: ${error}`);
    }
  }

  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================

  private _updateField(field: string, value: any): void {
    (this._state as any)[field] = value;
    
    if (field === 'workforceLayers') {
      this._rebuildLayers();
      this._update(); // Only rebuild UI when layers count changes
    }
    
    // Don't validate on every keystroke - only clear field-specific error
    if (this._state.errors[field]) {
      delete this._state.errors[field];
    }
    
    // DO NOT call _update() on every keystroke - it rebuilds HTML and loses focus
  }

  private _updateLayerField(field: string, value: any): void {
    const layer = this._state.layers[this._state.currentLayerIndex];
    if (layer) {
      (layer as any)[field] = value;
      
      // Clear layer-specific error
      const errorKey = `layer${layer.number}_${field}`;
      if (this._state.errors[errorKey]) {
        delete this._state.errors[errorKey];
      }
      
      // For 'type' field, update UI to reflect button selection
      // For text fields, don't update to avoid losing focus
      if (field === 'type') {
        this._update();
      }
    }
  }

  private _incrementLayers(delta: number): void {
    const newValue = Math.max(1, Math.min(99, this._state.workforceLayers + delta));
    if (newValue !== this._state.workforceLayers) {
      this._state.workforceLayers = newValue;
      this._rebuildLayers();
      this._validate();
      this._update();
    }
  }

  private _incrementWorkforce(delta: number): void {
    const layer = this._state.layers[this._state.currentLayerIndex];
    if (layer) {
      const newValue = Math.max(1, Math.min(999, layer.workforceSize + delta));
      if (newValue !== layer.workforceSize) {
        layer.workforceSize = newValue;
        this._update();
      }
    }
  }

  private _incrementContinuation(delta: number): void {
    const layer = this._state.layers[this._state.currentLayerIndex];
    if (layer) {
      const newValue = Math.max(1, Math.min(99, layer.maxContinuationAttempts + delta));
      if (newValue !== layer.maxContinuationAttempts) {
        layer.maxContinuationAttempts = newValue;
        this._update();
      }
    }
  }

  private _rebuildLayers(): void {
    const count = this._state.workforceLayers;
    const oldLayers = this._state.layers;
    const newLayers: LayerConfig[] = [];

    logger.info(`🔨 [REBUILD] _rebuildLayers() - target: ${count}, existing: ${oldLayers.length}`);

    for (let i = 0; i < count; i++) {
      // Determine correct default type based on position
      const isLast = i === count - 1;
      const correctDefaultType: LayerType = isLast ? 'worker' : (i === 0 ? 'manager' : 'teamleader');
      
      if (oldLayers[i]) {
        // Keep existing layer config, but update number and potentially reset type
        // if this layer's position has changed (e.g., was last, now middle)
        const existingLayer = { ...oldLayers[i], number: i + 1 };
        
        // Auto-fix type if layer was previously last (worker) but now isn't
        // or if it was first but now isn't, etc.
        const wasLastLayer = i === oldLayers.length - 1;
        const isNowLastLayer = isLast;
        
        // If position in hierarchy changed, suggest correct type
        // But only auto-fix if the type no longer makes sense
        if (wasLastLayer && !isNowLastLayer && existingLayer.type === 'worker') {
          // Was last (worker), but now has layers below - change to teamleader
          logger.debug(`🔨 [REBUILD] Layer ${i + 1}: was last worker, now middle → teamleader`);
          existingLayer.type = 'teamleader';
        } else if (!wasLastLayer && isNowLastLayer && existingLayer.type !== 'worker') {
          // Now is last layer - should be worker (can't delegate)
          logger.debug(`🔨 [REBUILD] Layer ${i + 1}: now last → forcing worker type`);
          existingLayer.type = 'worker';
        }
        
        logger.debug(`🔨 [REBUILD] Layer ${i + 1}: keeping existing, type=${existingLayer.type}`);
        newLayers.push(existingLayer);
      } else {
        // Create new layer with defaults
        logger.debug(`🔨 [REBUILD] Layer ${i + 1}: creating new, type=${correctDefaultType}`);
        newLayers.push({
          number: i + 1,
          type: correctDefaultType,
          workforceSize: 1,
          reporting: '',
          taskDescription: '',
          continuationPrompt: 'Kontynuuj realizację zadania. Nie pytaj o potwierdzenie, po prostu dokończ.',
          maxContinuationAttempts: 10,
          resources: this._state.inputFiles.map(f => ({
            path: f.path,
            use: true,
            readonly: false,
          })),
        });
      }
    }

    this._state.layers = newLayers;
    logger.info(`🔨 [REBUILD] Rebuilt ${newLayers.length} layers: [${newLayers.map(l => `${l.number}:${l.type}`).join(', ')}]`);
    
    // Reset layer index if out of bounds
    if (this._state.currentLayerIndex >= count) {
      logger.debug(`🔨 [REBUILD] Resetting currentLayerIndex from ${this._state.currentLayerIndex} to 0`);
      this._state.currentLayerIndex = 0;
    }
  }

  private _syncResourcesToLayers(): void {
    // Sync input files to all layers' resources
    for (const layer of this._state.layers) {
      const newResources: LayerResource[] = [];
      
      for (const file of this._state.inputFiles) {
        const existing = layer.resources.find(r => r.path === file.path);
        if (existing) {
          newResources.push(existing);
        } else {
          newResources.push({
            path: file.path,
            use: true,
            readonly: false,
          });
        }
      }
      
      layer.resources = newResources;
    }
  }

  private _validate(): void {
    const errors: Record<string, string> = {};

    // Step 1: Project name
    if (!this._state.projectName) {
      errors.projectName = 'Project name is required';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(this._state.projectName)) {
      errors.projectName = 'Only letters, numbers, hyphens, underscores allowed';
    }

    // Step 2: Layers count (already constrained by UI)

    // Step 3: Output directory
    if (!this._state.outputDirectory) {
      errors.outputDirectory = 'Output directory is required';
    }

    // Step 4: Layer validation - only if layers exist
    if (this._state.layers.length > 0) {
      for (const layer of this._state.layers) {
        // Manager must have reporting
        if (layer.type === 'manager' && !layer.reporting) {
          errors[`layer${layer.number}_reporting`] = `Layer ${layer.number} (Manager) requires reporting configuration`;
        }
        
        // All layers need task description
        if (!layer.taskDescription) {
          errors[`layer${layer.number}_taskDescription`] = `Layer ${layer.number} needs task description`;
        }
      }

      // Last layer must be worker
      const lastLayer = this._state.layers[this._state.layers.length - 1];
      if (lastLayer.type !== 'worker') {
        errors.lastLayerType = 'Last layer must be of type "worker" (cannot delegate further)';
      }
    }

    this._state.errors = errors;
  }

  private _isValid(): boolean {
    // Only check if we have all required data for creating project
    // Run full validation first
    this._validate();
    const valid = Object.keys(this._state.errors).length === 0;
    logger.info(`✅ [VALID] _isValid() = ${valid}, errors: ${JSON.stringify(this._state.errors)}`);
    return valid;
  }

  private _isCurrentStepValid(): boolean {
    // Check validity for current step only
    let valid = false;
    switch (this._state.currentStep) {
      case 1:
        valid = !!this._state.projectName && /^[a-zA-Z0-9_-]+$/.test(this._state.projectName);
        break;
      case 2:
        valid = this._state.workforceLayers >= 1 && this._state.workforceLayers <= 99;
        break;
      case 3:
        valid = !!this._state.outputDirectory;
        break;
      case 4:
        // All layers must have task description, managers need reporting
        valid = this._state.layers.every(layer => {
          if (!layer.taskDescription) return false;
          if (layer.type === 'manager' && !layer.reporting) return false;
          return true;
        }) && (this._state.layers.length === 0 || this._state.layers[this._state.layers.length - 1].type === 'worker');
        break;
      default:
        valid = true;
    }
    logger.debug(`✅ [VALID] _isCurrentStepValid() step=${this._state.currentStep} = ${valid}`);
    return valid;
  }

  // ===========================================================================
  // NAVIGATION
  // ===========================================================================

  private _nextStep(): void {
    logger.info(`➡️ [NAV] _nextStep() from step ${this._state.currentStep}`);
    if (this._state.currentStep < 4) {
      if (this._state.currentStep === 2) {
        logger.info('➡️ [NAV] Rebuilding layers (leaving step 2)');
        this._rebuildLayers();
      }
      if (this._state.currentStep === 3) {
        logger.info('➡️ [NAV] Syncing resources to layers (leaving step 3)');
        this._syncResourcesToLayers();
      }
      this._state.currentStep++;
      this._state.currentLayerIndex = 0;
      logger.info(`➡️ [NAV] Now on step ${this._state.currentStep}`);
      this._update();
    } else {
      logger.warn('➡️ [NAV] Cannot go next - already on step 4');
    }
  }

  private _prevStep(): void {
    logger.info(`⬅️ [NAV] _prevStep() from step ${this._state.currentStep}`);
    if (this._state.currentStep > 1) {
      this._state.currentStep--;
      this._state.currentLayerIndex = 0;
      logger.info(`⬅️ [NAV] Now on step ${this._state.currentStep}`);
      this._update();
    } else {
      logger.warn('⬅️ [NAV] Cannot go back - already on step 1');
    }
  }

  private _goToStep(step: number): void {
    logger.info(`🎯 [NAV] _goToStep(${step}) from step ${this._state.currentStep}`);
    if (step >= 1 && step <= 4) {
      if (step === 4 && this._state.currentStep < 4) {
        logger.info('🎯 [NAV] Jumping to step 4 - rebuilding layers & syncing resources');
        this._rebuildLayers();
        this._syncResourcesToLayers();
      }
      this._state.currentStep = step;
      this._state.currentLayerIndex = 0;
      logger.info(`🎯 [NAV] Now on step ${this._state.currentStep}`);
      this._update();
    } else {
      logger.warn(`🎯 [NAV] Invalid step: ${step}`);
    }
  }

  private _nextLayer(): void {
    logger.info(`➡️ [NAV] _nextLayer() from layer ${this._state.currentLayerIndex}`);
    if (this._state.currentLayerIndex < this._state.workforceLayers - 1) {
      this._state.currentLayerIndex++;
      logger.info(`➡️ [NAV] Now on layer ${this._state.currentLayerIndex}`);
      this._update();
    } else {
      logger.warn('➡️ [NAV] Cannot go next - already on last layer');
    }
  }

  private _prevLayer(): void {
    logger.info(`⬅️ [NAV] _prevLayer() from layer ${this._state.currentLayerIndex}`);
    if (this._state.currentLayerIndex > 0) {
      this._state.currentLayerIndex--;
      logger.info(`⬅️ [NAV] Now on layer ${this._state.currentLayerIndex}`);
      this._update();
    } else {
      logger.warn('⬅️ [NAV] Cannot go back - already on first layer');
    }
  }

  private _goToLayer(index: number): void {
    logger.info(`🎯 [NAV] _goToLayer(${index}) from layer ${this._state.currentLayerIndex}`);
    if (index >= 0 && index < this._state.workforceLayers) {
      this._state.currentLayerIndex = index;
      logger.info(`🎯 [NAV] Now on layer ${this._state.currentLayerIndex}`);
      this._update();
    } else {
      logger.warn(`🎯 [NAV] Invalid layer index: ${index} (max: ${this._state.workforceLayers - 1})`);
    }
  }

  // ===========================================================================
  // FILE OPERATIONS
  // ===========================================================================

  private async _addInputFile(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      title: 'Select input files',
    });

    if (result && result.length > 0) {
      for (const uri of result) {
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        
        // Don't add duplicates
        if (!this._state.inputFiles.find(f => f.path === relativePath)) {
          this._state.inputFiles.push({
            path: relativePath,
            copyToLayers: '', // Will be filled by user
          });
        }
      }
      
      this._syncResourcesToLayers();
      this._update();
    }
  }

  private async _addInputFolder(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: true,
      title: 'Select input folders',
    });

    if (result && result.length > 0) {
      for (const uri of result) {
        let relativePath = vscode.workspace.asRelativePath(uri, false);
        // Ensure folder paths end with /
        if (!relativePath.endsWith('/') && !relativePath.endsWith('\\')) {
          relativePath += '/';
        }
        
        // Don't add duplicates
        if (!this._state.inputFiles.find(f => f.path === relativePath)) {
          this._state.inputFiles.push({
            path: relativePath,
            copyToLayers: '', // Will be filled by user
          });
        }
      }
      
      this._syncResourcesToLayers();
      this._update();
    }
  }

  private _removeInputFile(index: number): void {
    const removed = this._state.inputFiles.splice(index, 1)[0];
    if (removed) {
      // Remove from all layers' resources
      for (const layer of this._state.layers) {
        layer.resources = layer.resources.filter(r => r.path !== removed.path);
      }
    }
    this._update();
  }

  private _updateInputFile(index: number, field: string, value: any): void {
    if (this._state.inputFiles[index]) {
      (this._state.inputFiles[index] as any)[field] = value;
    }
    this._update();
  }

  private async _pickOutputDirectory(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: 'Select output directory',
    });

    if (result && result.length > 0) {
      this._state.outputDirectory = vscode.workspace.asRelativePath(result[0], false);
      this._update();
    }
  }

  private _toggleResource(pathRef: string, field: 'use' | 'readonly'): void {
    const layer = this._state.layers[this._state.currentLayerIndex];
    if (layer) {
      const resource = layer.resources.find(r => r.path === pathRef);
      if (resource) {
        resource[field] = !resource[field];
      }
    }
    this._update();
  }

  // ===========================================================================
  // PROJECT CREATION
  // ===========================================================================

  private async _createProject(): Promise<void> {
    logger.info('🏗️ [WIZARD] _createProject() started');
    logger.info('🏗️ [WIZARD] Current state:', { 
      projectName: this._state.projectName,
      workforceLayers: this._state.workforceLayers,
      layersCount: this._state.layers.length,
      inputFiles: this._state.inputFiles.length,
      outputDirectory: this._state.outputDirectory
    });
    
    this._validate();
    logger.info('🏗️ [WIZARD] Validation complete, errors:', this._state.errors);
    
    if (!this._isValid()) {
      const errorMessages = Object.values(this._state.errors).join('\n');
      logger.error('❌ [WIZARD] Validation failed:', errorMessages);
      vscode.window.showErrorMessage(`Please fix validation errors:\n${errorMessages}`);
      return;
    }
    
    logger.info('✅ [WIZARD] Validation passed');

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      logger.error('❌ [WIZARD] No workspace folder open');
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    const projectRoot = path.join(workspaceRoot, `root_of_project_${this._state.projectName}`);
    const projectXmlPath = path.join(projectRoot, `project-spec.xml`);
    
    logger.info('🏗️ [WIZARD] Paths:', { workspaceRoot, projectRoot, projectXmlPath });

    // Check if project already exists
    if (pathExists(projectRoot)) {
      logger.warn('⚠️ [WIZARD] Project folder exists, asking for overwrite');
      const overwrite = await vscode.window.showWarningMessage(
        `Project folder already exists: ${projectRoot}\nOverwrite?`,
        { modal: true },
        'Overwrite',
        'Cancel'
      );
      if (overwrite !== 'Overwrite') {
        logger.info('🏗️ [WIZARD] User cancelled overwrite');
        return;
      }
      logger.info('🏗️ [WIZARD] User confirmed overwrite');
    }

    try {
      // Create directory structure
      logger.info('🏗️ [WIZARD] Creating project structure...');
      await this._createProjectStructure(projectRoot);
      logger.info('✅ [WIZARD] Project structure created');
      
      // Generate and save XML
      logger.info('🏗️ [WIZARD] Generating project-spec.xml...');
      const xml = this._generateXml();
      fs.writeFileSync(projectXmlPath, xml, 'utf8');
      logger.info('✅ [WIZARD] project-spec.xml saved');

      // Generate layer prompts
      logger.info('🏗️ [WIZARD] Generating layer prompts...');
      await this._generateLayerPrompts(projectRoot);
      logger.info('✅ [WIZARD] Layer prompts generated');

      logger.info(`✅ [WIZARD] Project created: ${this._state.projectName}`);

      // Calculate total worker count
      const totalWorkers = this._calculateTotalWorkers();
      logger.info(`🏗️ [WIZARD] Total workers to spawn: ${totalWorkers}`);

      // Update sidebar with project path for later
      const sidebar = getSidebarProvider();
      if (sidebar) {
        logger.info('🏗️ [WIZARD] Updating sidebar state');
        sidebar.updateState({
          hasProject: true,
          projectStatus: 'suspended',
          currentRole: 'manager',
          processingStatus: 'idle',
        });
      } else {
        logger.warn('⚠️ [WIZARD] Sidebar provider not found');
      }

      // Close wizard FIRST to prevent frozen UI
      logger.info('🏗️ [WIZARD] Closing wizard panel');
      this.dispose();

      // Open the project XML
      logger.info('🏗️ [WIZARD] Opening project-spec.xml in editor');
      const doc = await vscode.workspace.openTextDocument(projectXmlPath);
      await vscode.window.showTextDocument(doc);

      // Show notification - workers will be spawned via "Start Processing" button
      vscode.window.showInformationMessage(
        `✅ Project "${this._state.projectName}" created with ${totalWorkers} tasks! Click "Start Processing" in sidebar to spawn workers.`
      );

      logger.info('✅ [WIZARD] Project creation complete! Workers will spawn on Start Processing.');
    } catch (error) {
      logger.error('❌ [WIZARD] Project creation failed:', error);
      vscode.window.showErrorMessage(`Failed to create project: ${error}`);
    }
  }

  /**
   * Calculate total workers to spawn from all layers
   */
  private _calculateTotalWorkers(): number {
    // All layer types use workforceSize (worker layer can also have multiple ejajki)
    return this._state.layers.reduce((total, layer) => {
      return total + layer.workforceSize;
    }, 0);
  }

  /**
   * Generate prompt files for each layer
   */
  private async _generateLayerPrompts(projectRoot: string): Promise<void> {
    const promptsDir = path.join(projectRoot, 'prompts');
    ensureDir(promptsDir);

    for (const layer of this._state.layers) {
      const prompt = this._generateLayerPromptContent(layer);
      const promptPath = path.join(promptsDir, `layer_${layer.number}_prompt.md`);
      fs.writeFileSync(promptPath, prompt, 'utf8');
    }

    logger.info(`Generated ${this._state.layers.length} layer prompts`);
  }

  /**
   * Generate prompt content for a layer
   */
  private _generateLayerPromptContent(layer: LayerConfig): string {
    const roleDescription = this._getRoleDescription(layer);
    const resourcesList = layer.resources
      .filter(r => r.use)
      .map(r => `  - \`${r.path}\`${r.readonly ? ' *(read-only)*' : ''}`)
      .join('\n');

    const layerMap = this._state.layers
      .map(l => `  ${l.number}. **${l.type.toUpperCase()}**: ${l.taskDescription.substring(0, 60)}...`)
      .join('\n');

    return `# ${this._state.projectName} — Layer ${layer.number}

## Project Overview
${this._state.inputDescription || 'No project description provided.'}

## Your Role
${roleDescription}

## Layer Map
${layerMap}

---

## Your Task
${layer.taskDescription}

${layer.resources.filter(r => r.use).length > 0 ? `## Available Resources\n${resourcesList}` : ''}

${layer.reporting ? `## Reporting Instructions\n${layer.reporting}` : ''}

## Output Directory
\`${this._state.outputDirectory}\`

---
*Layer ${layer.number} of ${this._state.workforceLayers} | Type: ${layer.type}${layer.workforceSize > 0 ? ` | Workforce: ${layer.workforceSize}` : ''}*
`;
  }

  /**
   * Get role description for a layer
   */
  private _getRoleDescription(layer: LayerConfig): string {
    switch (layer.type) {
      case 'manager':
        return layer.workforceSize > 0
          ? `You are a **Manager** overseeing **${layer.workforceSize} AI agents**. Your job is to coordinate and delegate tasks.`
          : 'You are a **Manager**. Your job is to coordinate and delegate tasks.';
      case 'teamleader':
        return layer.workforceSize > 0
          ? `You are a **Team Leader** managing **${layer.workforceSize} AI agents**. Guide your team to complete the assigned work.`
          : 'You are a **Team Leader**. Guide your team to complete the assigned work.';
      case 'worker':
        return 'You are a **Worker**. Execute the assigned task to the best of your ability.';
      default:
        return 'Complete the assigned task.';
    }
  }

  /**
  /**
   * Provision worker folders (creates folders and configs, but doesn't open windows)
   * Windows are opened later via "Start Processing" button
   */
  private async _provisionWorkerFolders(projectRoot: string): Promise<void> {
    const workersDir = path.join(projectRoot, 'workers');
    ensureDir(workersDir);
    
    let provisioned = 0;
    
    for (const layer of this._state.layers) {
      const workersForLayer = layer.workforceSize;
      
      for (let i = 0; i < workersForLayer; i++) {
        const workerId = `worker-L${layer.number}-${i + 1}`;
        const workerDir = path.join(workersDir, workerId);
        
        await this._provisionWorker(workerDir, workerId, layer);
        provisioned++;
        
        logger.info(`📦 [PROVISION] ${provisioned}: ${workerId} folder created`);
      }
    }
    
    logger.info(`✅ [PROVISION] Created ${provisioned} worker folders`);
  }

  /**
   * Spawn workers for the project
   */
  private async _spawnProjectWorkers(projectRoot: string, totalWorkers: number): Promise<void> {
    logger.info(`🚀 [SPAWN] _spawnProjectWorkers() started, projectRoot: ${projectRoot}, totalWorkers: ${totalWorkers}`);
    
    const workersDir = path.join(projectRoot, 'workers');
    logger.info(`🚀 [SPAWN] Workers directory: ${workersDir}`);
    ensureDir(workersDir);

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Spawning ${totalWorkers} workers...`,
      cancellable: true
    }, async (progress, token) => {
      let spawned = 0;
      logger.info(`🚀 [SPAWN] Starting spawn loop, layers: ${this._state.layers.length}`);

      for (const layer of this._state.layers) {
        if (token.isCancellationRequested) {
          logger.warn('🚀 [SPAWN] Cancelled by user');
          break;
        }

        // All layer types use workforceSize (worker layer can also have multiple ejajki)
        const workersForLayer = layer.workforceSize;
        logger.info(`🚀 [SPAWN] Layer ${layer.number} (${layer.type}): spawning ${workersForLayer} workers`);
        
        for (let i = 0; i < workersForLayer; i++) {
          if (token.isCancellationRequested) {
            logger.warn('🚀 [SPAWN] Cancelled by user');
            break;
          }

          const workerId = `worker-L${layer.number}-${i + 1}`;
          const workerDir = path.join(workersDir, workerId);
          
          logger.info(`🚀 [SPAWN] Provisioning worker: ${workerId} at ${workerDir}`);
          await this._provisionWorker(workerDir, workerId, layer);
          logger.info(`✅ [SPAWN] Worker ${workerId} provisioned`);
          
          spawned++;
          progress.report({ 
            increment: (100 / totalWorkers),
            message: `${spawned}/${totalWorkers} workers ready`
          });

          // Small delay between spawns
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Auto-open worker windows (no dialog - just do it!)
      logger.info(`🚀 [SPAWN] All ${spawned} workers provisioned, opening windows...`);
      progress.report({ message: 'Opening VS Code windows...' });
      await this._openWorkerWindows(workersDir, spawned);
      
      logger.info(`✅ [SPAWN] ${spawned} worker windows launched!`);
      vscode.window.showInformationMessage(`🚀 ${spawned} worker windows launched!`);

      return spawned;
    });
  }

  /**
   * Provision a single worker
   */
  private async _provisionWorker(workerDir: string, workerId: string, layer: LayerConfig): Promise<void> {
    logger.debug(`📦 [PROVISION] Provisioning ${workerId}...`);
    
    ensureDir(workerDir);
    ensureDir(path.join(workerDir, 'output'));
    ensureDir(path.join(workerDir, '.adg-parallels', 'worker'));
    logger.debug(`📦 [PROVISION] Directories created for ${workerId}`);

    const projectRoot = path.dirname(path.dirname(workerDir));
    const projectSpecPath = path.join(projectRoot, 'project-spec.xml');
    const tasksFilePath = path.join(projectRoot, 'tasks.xml');

    // Create worker config
    const workerConfig = {
      workerId,
      role: 'worker',
      parentRole: layer.type,
      layer: layer.number,
      projectSpec: projectSpecPath,
      paths: {
        projectRoot,
        workerRoot: workerDir,
        outputDir: path.join(projectRoot, this._state.outputDirectory),
        promptFile: path.join(projectRoot, 'prompts', `layer_${layer.number}_prompt.md`),
        tasksFile: tasksFilePath,
      },
      createdAt: new Date().toISOString(),
      instructionsVersion: '1.0',
    };

    const workerXmlPath = path.join(workerDir, 'worker.xml');
    writeWorkerXml(workerXmlPath, workerConfig);
    logger.debug(`📦 [PROVISION] worker.xml written: ${workerXmlPath}`);

    // Create initial heartbeat
    const heartbeat = `<?xml version="1.0" encoding="UTF-8"?>
<heartbeat>
  <worker-id>${workerId}</worker-id>
  <timestamp>${new Date().toISOString()}</timestamp>
  <status>idle</status>
  <stats>
    <tasks-completed>0</tasks-completed>
    <stages-processed>0</stages-processed>
    <uptime-seconds>0</uptime-seconds>
  </stats>
</heartbeat>
`;
    fs.writeFileSync(path.join(workerDir, 'heartbeat.xml'), heartbeat, 'utf8');
    logger.debug(`📦 [PROVISION] heartbeat.xml written for ${workerId}`);

    // Copy layer prompt as worker instructions
    const promptContent = this._generateLayerPromptContent(layer);
    const instructions = `# Worker Instructions: ${workerId}

${promptContent}

---

## Worker Protocol

1. **Read** your task from the prompt above
2. **Execute** the work as described
3. **Update** heartbeat.xml regularly (every 60 seconds)
4. **Save output** to: \`${this._state.outputDirectory}\`
5. **Signal completion** when done

## Heartbeat Updates
Update \`heartbeat.xml\` with status:
- \`idle\` - waiting for work
- \`working\` - actively processing
- \`error\` - encountered a problem
- \`shutting-down\` - finished all work

Good luck! 🚀
`;
    fs.writeFileSync(path.join(workerDir, 'instructions.md'), instructions, 'utf8');
    logger.debug(`📦 [PROVISION] instructions.md written for ${workerId}`);

    logger.info(`✅ [PROVISION] Worker ${workerId} fully provisioned`);
  }

  /**
   * Open VS Code windows for workers
   */
  private async _openWorkerWindows(workersDir: string, count: number): Promise<void> {
    logger.info(`🪟 [WINDOWS] _openWorkerWindows() started, dir: ${workersDir}, expected: ${count}`);
    
    const entries = fs.readdirSync(workersDir, { withFileTypes: true });
    logger.info(`🪟 [WINDOWS] Found ${entries.length} entries in workers dir`);
    
    let opened = 0;
    
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('worker-')) {
        const workerPath = path.join(workersDir, entry.name);
        const workerConfigPath = path.join(workerPath, 'worker.xml');
        
        logger.info(`🪟 [WINDOWS] Checking worker: ${entry.name}`);
        
        // Verify worker is properly provisioned
        if (!pathExists(workerConfigPath)) {
          logger.warn(`⚠️ [WINDOWS] Skipping ${entry.name} - no worker.xml found at ${workerConfigPath}`);
          continue;
        }
        
        const uri = vscode.Uri.file(workerPath);
        logger.info(`🪟 [WINDOWS] Opening window for: ${entry.name} (${uri.fsPath})`);
        
        try {
          await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
          opened++;
          logger.info(`✅ [WINDOWS] Window opened for ${entry.name} (${opened}/${count})`);
        } catch (error) {
          logger.error(`❌ [WINDOWS] Failed to open window for ${entry.name}:`, error);
        }
        
        // Larger delay between window opens to allow proper initialization
        logger.debug(`🪟 [WINDOWS] Waiting 2000ms before next window...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    logger.info(`✅ [WINDOWS] Finished opening windows: ${opened}/${count} successful`);
  }

  private async _createProjectStructure(projectRoot: string): Promise<void> {
    // Create main project directory
    ensureDir(projectRoot);
    
    // Create standard subdirectories
    ensureDir(path.join(projectRoot, 'input'));
    ensureDir(path.join(projectRoot, 'workdir'));
    ensureDir(path.join(projectRoot, 'logs'));
    ensureDir(path.join(projectRoot, 'workers'));
    ensureDir(path.join(projectRoot, 'prompts'));
    
    // Create layer workdirs
    for (let i = 1; i <= this._state.workforceLayers; i++) {
      ensureDir(path.join(projectRoot, 'workdir', `layer_${i}`));
    }
    
    // Create output directory
    const outputDir = path.isAbsolute(this._state.outputDirectory)
      ? this._state.outputDirectory
      : path.join(projectRoot, this._state.outputDirectory);
    ensureDir(outputDir);

    // Create .gitignore
    const gitignore = `# ADG-Parallels project
workdir/
logs/
workers/
*.lock
`;
    fs.writeFileSync(path.join(projectRoot, '.gitignore'), gitignore, 'utf8');

    // Create tasks.xml with actual tasks for each worker
    const tasksXml = this._generateTasksXml(projectRoot);
    fs.writeFileSync(path.join(projectRoot, 'tasks.xml'), tasksXml, 'utf8');
    logger.info('Created tasks.xml with worker tasks');

    // Create worker folders (but don't open windows - that happens on Start Processing)
    await this._provisionWorkerFolders(projectRoot);

    // Create hierarchy-config.xml
    const hierarchyXml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy_config>
  <max_depth>${this._state.workforceLayers}</max_depth>
  <current_depth>0</current_depth>
  <levels>
${this._state.layers.map(layer => `    <level level="${layer.number}">
      <role>${layer.type}</role>
      <can_delegate>${layer.type !== 'worker'}</can_delegate>
      <max_subordinates>${layer.workforceSize}</max_subordinates>
      <subordinate_role>${layer.type === 'worker' ? 'none' : 'worker'}</subordinate_role>
    </level>`).join('\n')}
  </levels>
  <emergency_brake>
    <max_total_instances>100</max_total_instances>
    <max_tasks_per_worker>50</max_tasks_per_worker>
    <timeout_minutes>120</timeout_minutes>
  </emergency_brake>
  <health_monitoring>
    <enabled>true</enabled>
    <heartbeat_interval_seconds>60</heartbeat_interval_seconds>
    <unresponsive_threshold_seconds>120</unresponsive_threshold_seconds>
    <max_consecutive_failures>3</max_consecutive_failures>
    <auto_restart>true</auto_restart>
  </health_monitoring>
</hierarchy_config>
`;
    fs.writeFileSync(path.join(projectRoot, 'hierarchy-config.xml'), hierarchyXml, 'utf8');
    logger.info('Created hierarchy-config.xml');
  }

  private _generateXml(): string {
    const s = this._state;
    const timestamp = new Date().toISOString();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<project version="1.0">

  <!-- Project Metadata -->
  <name>${this._escapeXml(s.projectName)}</name>
  <created_at>${timestamp}</created_at>

  <!-- Workforce Configuration -->
  <workforce_layers>${s.workforceLayers}</workforce_layers>

  <!-- Resources -->
  <resources>
    <description><![CDATA[${s.inputDescription}]]></description>
    <files>
${s.inputFiles.map(f => `      <file path="${this._escapeXml(f.path)}">
        <copy_to_layers>${this._escapeXml(f.copyToLayers)}</copy_to_layers>
      </file>`).join('\n')}
    </files>
    <output_directory>${this._escapeXml(s.outputDirectory)}</output_directory>
  </resources>

  <!-- Layer Definitions -->
  <layers>
${s.layers.map(layer => this._generateLayerXml(layer)).join('\n')}
  </layers>

  <!-- Settings -->
  <settings>
    <health_monitoring enabled="true" interval_seconds="60"/>
    <max_retries>3</max_retries>
    <finished_flag>
      <filename>finished.flag.xml</filename>
      <check_before_respawn>true</check_before_respawn>
    </finished_flag>
  </settings>

</project>
`;

    return xml;
  }

  private _generateLayerXml(layer: LayerConfig): string {
    const reportingXml = layer.type === 'manager' || (layer.type === 'teamleader' && layer.reporting)
      ? `\n      <reporting><![CDATA[${layer.reporting}]]></reporting>`
      : '';

    const resourcesXml = layer.resources.filter(r => r.use).length > 0
      ? `
      <layer_resources>
${layer.resources.filter(r => r.use).map(r => 
  `        <resource path="${this._escapeXml(r.path)}" use="true" readonly="${r.readonly}"/>`
).join('\n')}
      </layer_resources>`
      : '';

    return `    <layer number="${layer.number}">
      <type>${layer.type}</type>
      <workforce_size>${layer.workforceSize}</workforce_size>${reportingXml}
      <task_description><![CDATA[${layer.taskDescription}]]></task_description>
      <continuation>
        <prompt><![CDATA[${layer.continuationPrompt}]]></prompt>
        <max_attempts>${layer.maxContinuationAttempts}</max_attempts>
      </continuation>${resourcesXml}
    </layer>`;
  }

  private _escapeXml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Generate tasks.xml with tasks for each worker in each layer
   * Field mapping (form → XML):
   * - projectName → project_name
   * - workforceLayers → layers_count
   * - inputFiles → list_of_additional_resources
   * - inputDescription → resources_description
   * - outputDirectory → move_completed_task_artifact_to
   * - taskDescription → your_assigned_task
   * - continuationPrompt → continuation_prompt
   * - reporting → reporting_instructions
   */
  private _generateTasksXml(projectRoot: string): string {
    const s = this._state;
    const timestamp = new Date().toISOString();
    
    // Generate tasks - one task per worker instance
    let taskId = 0;
    const tasks: string[] = [];
    
    for (const layer of s.layers) {
      // Get number of workers for this layer
      // All layer types use workforceSize (worker layer can also have multiple ejajki)
      const workerCount = layer.workforceSize;
      
      // Get resources for this layer
      const layerResources = layer.resources
        .filter(r => r.use)
        .map(r => `          <resource path="${this._escapeXml(r.path)}" readonly="${r.readonly}"/>`)
        .join('\n');
      
      // Create a task for each worker in this layer
      for (let i = 0; i < workerCount; i++) {
        taskId++;
        const workerId = `worker-L${layer.number}-${i + 1}`;
        
        tasks.push(`    <task id="${taskId}" status="pending">
      <worker_id>${workerId}</worker_id>
      <layer>${layer.number}</layer>
      <layer_type>${layer.type}</layer_type>
      
      <!-- Your Assigned Task -->
      <your_assigned_task><![CDATA[${layer.taskDescription}]]></your_assigned_task>
      
      <!-- Move Completed Task Artifact To -->
      <move_completed_task_artifact_to>${this._escapeXml(s.outputDirectory)}</move_completed_task_artifact_to>
      
      <!-- Resources Description -->
      <resources_description><![CDATA[${s.inputDescription}]]></resources_description>
      
      <!-- List of Additional Resources -->
      <list_of_additional_resources>
${layerResources}
      </list_of_additional_resources>
      
      <!-- Continuation Prompt (poganiacz) -->
      <continuation_prompt><![CDATA[${layer.continuationPrompt}]]></continuation_prompt>
      <max_continuation_attempts>${layer.maxContinuationAttempts}</max_continuation_attempts>
      
      ${layer.reporting ? `<!-- Reporting Instructions -->\n      <reporting_instructions><![CDATA[${layer.reporting}]]></reporting_instructions>` : ''}
      
      <!-- Execution tracking -->
      <retry_count>0</retry_count>
      <max_retries>3</max_retries>
    </task>`);
      }
    }
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  ADG-Parallels Task File
  Generated: ${timestamp}
  
  Field Mapping:
  - project_name: Name of the project
  - layers_count: Number of hierarchy layers
  - your_assigned_task: The task to execute (from taskDescription)
  - move_completed_task_artifact_to: Output directory
  - resources_description: How to interpret input resources
  - list_of_additional_resources: Files/folders available for this task
  - continuation_prompt: Prompt to nudge worker when stuck
  - reporting_instructions: How to report progress
-->
<tasks>
  <metadata>
    <project_name>${this._escapeXml(s.projectName)}</project_name>
    <layers_count>${s.workforceLayers}</layers_count>
    <created_at>${timestamp}</created_at>
  </metadata>
  
  <config>
    <worker_count>${this._calculateTotalWorkers()}</worker_count>
    <statuses>pending,processing,completed,failed</statuses>
    <completed_statuses>completed</completed_statuses>
    <failed_statuses>failed</failed_statuses>
  </config>
  
  <task_list>
${tasks.join('\n\n')}
  </task_list>
</tasks>
`;
  }

  // ===========================================================================
  // HTML GENERATION
  // ===========================================================================

  private _update(): void {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview(): string {
    const nonce = getNonce();
    const s = this._state;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>New Project Wizard</title>
  ${getHeadScript(nonce)}
  <style>
    ${getBaseStyles()}
    ${this._getCustomStyles()}
  </style>
</head>
<body>
  <div class="wizard-container">
    <!-- Header -->
    <div class="wizard-header">
      <div class="logo">🥚</div>
      <h1>ADG-Parallels Project Wizard</h1>
      <p class="subtitle">Create a new ejajka workforce project</p>
    </div>

    <!-- Progress -->
    <div class="progress-bar">
      ${this._renderProgress()}
    </div>

    <!-- Content -->
    <div class="wizard-content">
      ${this._renderCurrentStep()}
    </div>

    <!-- Footer -->
    <div class="wizard-footer">
      <div>
        ${s.currentStep > 1 ? `<button class="btn btn-secondary" data-cmd="prevStep">← Back</button>` : ''}
      </div>
      <div>
        <button class="btn btn-secondary" data-cmd="cancel">Cancel</button>
        ${s.currentStep < 4 ? `
          <button class="btn btn-primary" data-cmd="nextStep">Next Step →</button>
        ` : `
          <button class="btn btn-success" data-cmd="createProject" ${!this._isValid() ? 'disabled' : ''}>
            🚀 Create Project
          </button>
        `}
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  private _renderProgress(): string {
    const steps = [
      { num: 1, label: 'Name', icon: '📝' },
      { num: 2, label: 'Layers', icon: '📊' },
      { num: 3, label: 'Resources', icon: '📁' },
      { num: 4, label: 'Configure', icon: '⚙️' },
    ];

    return steps.map((step, i) => {
      const isActive = step.num === this._state.currentStep;
      const isComplete = step.num < this._state.currentStep;
      const cls = `progress-step ${isActive ? 'active' : ''} ${isComplete ? 'completed' : ''}`;

      return `
        <div class="${cls}" data-cmd="goToStep" data-step="${step.num}">
          <div class="step-number">${isComplete ? '✓' : step.icon}</div>
          <div class="step-label">${step.label}</div>
        </div>
        ${i < steps.length - 1 ? '<div class="progress-line"></div>' : ''}
      `;
    }).join('');
  }

  private _renderCurrentStep(): string {
    switch (this._state.currentStep) {
      case 1: return this._renderStep1();
      case 2: return this._renderStep2();
      case 3: return this._renderStep3();
      case 4: return this._renderStep4();
      default: return '';
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 1: Project Name
  // ---------------------------------------------------------------------------
  private _renderStep1(): string {
    const s = this._state;
    const nameError = s.errors.projectName;

    return `
      <div class="step-content">
        <h2>📝 Project Name</h2>
        <p>Give your project a unique identifier.</p>
        
        <div class="form-group">
          <label for="projectName">Project Name *</label>
          <input 
            type="text" 
            id="projectName"
            class="form-input ${nameError ? 'input-error' : ''}"
            value="${this._escapeXml(s.projectName)}"
            placeholder="e.g., translate_docs_2025"
            data-field="projectName"
            autofocus
          />
          ${nameError ? `<div class="error-text">${nameError}</div>` : ''}
          <div class="hint">Only letters (a-z, A-Z), numbers (0-9), hyphens (-), and underscores (_).</div>
          <div class="hint">This will be used to create: <code>root_of_project_${s.projectName || '{name}'}/project_${s.projectName || '{name}'}.xml</code></div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Workforce Layers
  // ---------------------------------------------------------------------------
  private _renderStep2(): string {
    const s = this._state;

    return `
      <div class="step-content">
        <h2>📊 Number of Workforce Layers</h2>
        <p>How many hierarchical layers will your ejajka workforce have?</p>
        
        <div class="form-group">
          <label>Layers Count</label>
          <div class="number-input-group">
            <button class="btn btn-secondary btn-square" data-cmd="incrementLayers" data-value="-1" ${s.workforceLayers <= 1 ? 'disabled' : ''}>−</button>
            <div class="number-display">${s.workforceLayers}</div>
            <button class="btn btn-secondary btn-square" data-cmd="incrementLayers" data-value="1" ${s.workforceLayers >= 99 ? 'disabled' : ''}>+</button>
          </div>
          <div class="hint">Range: 1-99 layers</div>
        </div>
        
        <div class="layer-preview">
          ${this._renderLayerPreview()}
        </div>
        
        <div class="examples-box">
          <h4>💡 Common configurations:</h4>
          <ul>
            <li><strong>1 layer</strong>: Solo workers (no delegation)</li>
            <li><strong>2 layers</strong>: Manager → Workers</li>
            <li><strong>3 layers</strong>: Manager → Teamleaders → Workers</li>
            <li><strong>4+ layers</strong>: Complex hierarchies with multiple levels</li>
          </ul>
        </div>
      </div>
    `;
  }

  private _renderLayerPreview(): string {
    const count = this._state.workforceLayers;
    const items: string[] = [];

    for (let i = 0; i < count && i < 10; i++) {
      const isLast = i === count - 1;
      const type = isLast ? 'worker' : (i === 0 ? 'manager' : 'teamleader');
      const icon = type === 'manager' ? '👔' : (type === 'teamleader' ? '👥' : '🥚');
      items.push(`<div class="layer-preview-item ${type}">${icon} Layer ${i + 1}</div>`);
    }

    if (count > 10) {
      items.push(`<div class="layer-preview-item">... +${count - 10} more</div>`);
    }

    return `<div class="layer-preview-grid">${items.join('')}</div>`;
  }

  // ---------------------------------------------------------------------------
  // STEP 3: Resources
  // ---------------------------------------------------------------------------
  private _renderStep3(): string {
    const s = this._state;

    return `
      <div class="step-content">
        <h2>📁 Input Resources</h2>
        <p>Define input files/folders and describe how ejajka should interpret them.</p>
        
        <div class="form-group">
          <label>Input Description</label>
          <textarea 
            class="form-input textarea"
            placeholder="Describe your inputs for ejajka to interpret..."
            data-field="inputDescription"
            rows="3"
          >${this._escapeXml(s.inputDescription)}</textarea>
          
          <div class="examples-box small">
            <strong>💡 Examples:</strong>
            <ul>
              ${EXAMPLES.inputDescription.map(ex => `<li>"${ex}"</li>`).join('')}
            </ul>
          </div>
        </div>
        
        <div class="form-group">
          <label>Input Files/Folders</label>
          <div class="file-list">
            ${s.inputFiles.length === 0 ? '<div class="empty-state">No files added yet. Click "Add File/Folder" below.</div>' : ''}
            ${s.inputFiles.map((f, i) => this._renderInputFileItem(f, i)).join('')}
          </div>
          <div class="button-group">
            <button class="btn btn-secondary btn-small" data-cmd="addInputFile">
              📄 Add Files
            </button>
            <button class="btn btn-secondary btn-small" data-cmd="addInputFolder">
              📂 Add Folder
            </button>
          </div>
        </div>
        
        <div class="form-group">
          <label>Output Directory *</label>
          <div class="path-input">
            <input 
              type="text" 
              class="form-input ${s.errors.outputDirectory ? 'input-error' : ''}"
              value="${this._escapeXml(s.outputDirectory)}"
              placeholder="./output/"
              data-field="outputDirectory"
            />
            <button class="btn btn-secondary btn-small" data-cmd="pickOutputDirectory">📁</button>
          </div>
          ${s.errors.outputDirectory ? `<div class="error-text">${s.errors.outputDirectory}</div>` : ''}
        </div>
      </div>
    `;
  }

  private _renderInputFileItem(file: InputFile, index: number): string {
    const isFolder = file.path.endsWith('/') || file.path.endsWith('\\');
    const icon = isFolder ? '📂' : '📄';

    return `
      <div class="file-item">
        <div class="file-main">
          <span class="file-icon">${icon}</span>
          <span class="file-path">${this._escapeXml(file.path)}</span>
          <button class="btn-icon-small" data-cmd="removeInputFile" data-index="${index}" title="Remove">✕</button>
        </div>
        <div class="file-options">
          <label class="inline-label">
            Copy to layers:
            <input 
              type="text" 
              class="form-input inline-input"
              value="${this._escapeXml(file.copyToLayers)}"
              placeholder="e.g., 1,2,3"
              data-input-file="${index}"
              data-input-field="copyToLayers"
            />
          </label>
          <span class="hint-inline">(leave empty if reference-only)</span>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // STEP 4: Layer Configuration
  // ---------------------------------------------------------------------------
  private _renderStep4(): string {
    const s = this._state;
    const layer = s.layers[s.currentLayerIndex];

    if (!layer) {
      return '<div class="step-content"><p>No layers configured. Go back to Step 2.</p></div>';
    }

    const isFirst = s.currentLayerIndex === 0;
    const isLast = s.currentLayerIndex === s.workforceLayers - 1;

    return `
      <div class="step-content">
        <h2>⚙️ Layer ${layer.number} of ${s.workforceLayers}</h2>
        
        <!-- Layer tabs -->
        <div class="layer-tabs">
          ${s.layers.map((l, i) => {
            const isActive = i === s.currentLayerIndex;
            const typeIcon = l.type === 'manager' ? '👔' : (l.type === 'teamleader' ? '👥' : '🥚');
            return `
              <button 
                class="layer-tab ${isActive ? 'active' : ''}"
                data-cmd="goToLayer" 
                data-index="${i}"
              >
                ${typeIcon} ${l.number}
              </button>
            `;
          }).join('')}
        </div>
        
        <div class="layer-form">
          <!-- Layer Type -->
          <div class="form-group">
            <label>Layer Type *</label>
            <div class="type-selector">
              ${this._renderTypeOption('manager', '👔', 'Manager', 'Delegates tasks, MUST report progress', layer.type)}
              ${this._renderTypeOption('teamleader', '👥', 'Teamleader', 'Delegates tasks, optional reporting', layer.type)}
              ${this._renderTypeOption('worker', '🥚', 'Worker', 'Executes tasks, cannot delegate', layer.type)}
            </div>
            ${s.errors.lastLayerType && isLast ? `<div class="error-text">${s.errors.lastLayerType}</div>` : ''}
          </div>
          
          <!-- Workforce Size -->
          <div class="form-group">
            <label>Workforce Size 🥚</label>
            <p class="field-desc">How many ejajki work in this layer?</p>
            <div class="number-input-group small">
              <button class="btn btn-secondary btn-square-sm" data-cmd="incrementWorkforce" data-value="-1" ${layer.workforceSize <= 1 ? 'disabled' : ''}>−</button>
              <div class="number-display-sm">${layer.workforceSize}</div>
              <button class="btn btn-secondary btn-square-sm" data-cmd="incrementWorkforce" data-value="1" ${layer.workforceSize >= 999 ? 'disabled' : ''}>+</button>
            </div>
            <div class="hint">1 = single agent, more = parallel processing</div>
          </div>
          
          <!-- Reporting (for manager/teamleader) -->
          ${layer.type !== 'worker' ? `
            <div class="form-group">
              <label>Reporting ${layer.type === 'manager' ? '*' : '(optional)'}</label>
              <textarea 
                class="form-input textarea"
                placeholder="Describe how this layer should report progress..."
                data-layer-field="reporting"
                rows="2"
              >${this._escapeXml(layer.reporting)}</textarea>
              ${s.errors[`layer${layer.number}_reporting`] ? `<div class="error-text">${s.errors[`layer${layer.number}_reporting`]}</div>` : ''}
              
              <div class="examples-box small">
                <strong>💡 Examples:</strong>
                <ul>
                  ${EXAMPLES.reporting.map(ex => `<li>"${ex}"</li>`).join('')}
                </ul>
              </div>
            </div>
          ` : ''}
          
          <!-- Task Description -->
          <div class="form-group">
            <label>Single Task Instruction *</label>
            <p class="field-desc">Describe the task for ONE ejajka to execute. Each agent receives this instruction along with its assigned input.</p>
            <textarea 
              class="form-input textarea tall"
              placeholder="Describe what each agent in this layer should do with a single task..."
              data-layer-field="taskDescription"
              rows="5"
            >${this._escapeXml(layer.taskDescription)}</textarea>
            ${s.errors[`layer${layer.number}_taskDescription`] ? `<div class="error-text">${s.errors[`layer${layer.number}_taskDescription`]}</div>` : ''}
            
            <div class="examples-box small">
              <strong>💡 Examples (each describes ONE task):</strong>
              <ul>
                ${EXAMPLES.workDescription.map(ex => `<li>"${ex}"</li>`).join('')}
              </ul>
            </div>
          </div>
          
          <!-- Continuation Settings ("Poganiacz") -->
          <div class="form-group continuation-section">
            <label>🔄 Continuation Settings ("Poganiacz")</label>
            <p class="field-desc">When ejajka stops or asks questions instead of working, we nudge it with this prompt.</p>
            
            <div class="continuation-row">
              <div class="continuation-prompt-col">
                <label class="sub-label">Continuation Prompt</label>
                <textarea 
                  class="form-input textarea"
                  placeholder="Prompt to send when ejajka stops working..."
                  data-layer-field="continuationPrompt"
                  rows="2"
                >${this._escapeXml(layer.continuationPrompt)}</textarea>
              </div>
              
              <div class="continuation-attempts-col">
                <label class="sub-label">Max Attempts</label>
                <div class="number-input-group small">
                  <button class="btn btn-secondary btn-square-sm" data-cmd="incrementContinuation" data-value="-1" ${layer.maxContinuationAttempts <= 1 ? 'disabled' : ''}>−</button>
                  <div class="number-display-sm">${layer.maxContinuationAttempts}</div>
                  <button class="btn btn-secondary btn-square-sm" data-cmd="incrementContinuation" data-value="1" ${layer.maxContinuationAttempts >= 99 ? 'disabled' : ''}>+</button>
                </div>
                <div class="hint">1-99 nudges before giving up</div>
              </div>
            </div>
          </div>
          
          <!-- Resources -->
          ${s.inputFiles.length > 0 ? `
            <div class="form-group">
              <label>Resources for this Layer</label>
              <div class="resource-list">
                ${layer.resources.map(r => this._renderResourceCheckbox(r)).join('')}
              </div>
            </div>
          ` : ''}
        </div>
        
        <!-- Layer navigation -->
        <div class="layer-nav-buttons">
          ${!isFirst ? `<button class="btn btn-secondary" data-cmd="prevLayer">← Previous Layer</button>` : '<div></div>'}
          ${!isLast ? `<button class="btn btn-primary" data-cmd="nextLayer">Next Layer →</button>` : '<div></div>'}
        </div>
      </div>
    `;
  }

  private _renderTypeOption(type: LayerType, icon: string, label: string, desc: string, currentType: LayerType): string {
    const isSelected = type === currentType;
    return `
      <div 
        class="type-option ${isSelected ? 'selected' : ''}"
        data-cmd="updateLayerField"
        data-field="type"
        data-value="${type}"
      >
        <div class="type-icon">${icon}</div>
        <div class="type-label">${label}</div>
        <div class="type-desc">${desc}</div>
      </div>
    `;
  }

  private _renderResourceCheckbox(resource: LayerResource): string {
    return `
      <div class="resource-item">
        <label class="checkbox-label">
          <input 
            type="checkbox" 
            ${resource.use ? 'checked' : ''}
            data-toggle-resource="${this._escapeXml(resource.path)}"
            data-toggle-field="use"
          />
          <span class="resource-path">📄 ${this._escapeXml(resource.path)}</span>
        </label>
        ${resource.use ? `
          <label class="checkbox-label sub">
            <input 
              type="checkbox" 
              ${resource.readonly ? 'checked' : ''}
              data-toggle-resource="${this._escapeXml(resource.path)}"
              data-toggle-field="readonly"
            />
            <span>Don't modify, just study</span>
          </label>
        ` : ''}
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // CUSTOM STYLES
  // ---------------------------------------------------------------------------
  private _getCustomStyles(): string {
    return `
      /* Success button */
      .btn-success {
        background: #238636;
        color: white;
      }
      .btn-success:hover:not(:disabled) {
        background: #2ea043;
      }
      
      /* Progress line */
      .progress-line {
        width: 40px;
        height: 2px;
        background: var(--vscode-panel-border);
        margin: 0 4px;
        margin-bottom: 24px;
      }
      
      /* Textarea */
      .textarea {
        resize: vertical;
        min-height: 60px;
        font-family: var(--vscode-font-family);
      }
      .textarea.tall {
        min-height: 120px;
      }
      
      /* Error styling */
      .input-error {
        border-color: #f85149 !important;
      }
      .error-text {
        color: #f85149;
        font-size: 11px;
        margin-top: 4px;
      }
      
      /* Hint */
      .hint {
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
        margin-top: 4px;
      }
      .hint code {
        background: var(--vscode-editor-background);
        padding: 2px 6px;
        border-radius: 3px;
        font-family: var(--vscode-editor-font-family);
      }
      
      /* Field description */
      .field-desc {
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        margin-bottom: 8px;
        margin-top: 0;
      }
      
      /* Number input group */
      .number-input-group {
        display: flex;
        align-items: center;
        gap: 0;
        max-width: 200px;
      }
      .number-input-group.small {
        max-width: 160px;
      }
      .btn-square {
        width: 48px;
        height: 48px;
        min-width: 48px;
        font-size: 24px;
        font-weight: bold;
        border-radius: 6px;
      }
      .btn-square-sm {
        width: 36px;
        height: 36px;
        min-width: 36px;
        font-size: 18px;
        font-weight: bold;
        border-radius: 5px;
      }
      .number-display {
        width: 80px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        font-weight: bold;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-left: none;
        border-right: none;
      }
      .number-display-sm {
        width: 60px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        font-weight: bold;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-left: none;
        border-right: none;
      }
      
      /* Layer preview */
      .layer-preview {
        margin-top: 20px;
      }
      .layer-preview-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .layer-preview-item {
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
      }
      .layer-preview-item.manager {
        border-color: #58a6ff;
        color: #58a6ff;
      }
      .layer-preview-item.teamleader {
        border-color: #a371f7;
        color: #a371f7;
      }
      .layer-preview-item.worker {
        border-color: #3fb950;
        color: #3fb950;
      }
      
      /* Examples box */
      .examples-box {
        background: rgba(0, 120, 212, 0.05);
        border: 1px dashed var(--vscode-focusBorder);
        border-radius: 6px;
        padding: 16px;
        margin-top: 16px;
      }
      .examples-box.small {
        padding: 12px;
        margin-top: 8px;
      }
      .examples-box h4, .examples-box strong {
        font-size: 12px;
        margin-bottom: 8px;
        color: var(--vscode-textLink-foreground);
      }
      .examples-box ul {
        margin-left: 18px;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
      }
      .examples-box li {
        margin-bottom: 4px;
      }
      
      /* File list */
      .file-list {
        background: var(--vscode-editor-background);
        border-radius: 6px;
        padding: 8px;
        margin-bottom: 10px;
        min-height: 60px;
      }
      .empty-state {
        color: var(--vscode-descriptionForeground);
        font-style: italic;
        text-align: center;
        padding: 20px;
      }
      .file-item {
        padding: 10px;
        background: var(--vscode-sideBar-background);
        border-radius: 4px;
        margin-bottom: 6px;
      }
      .file-main {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .file-icon {
        font-size: 16px;
      }
      .file-path {
        flex: 1;
        font-size: 12px;
        font-family: var(--vscode-editor-font-family);
      }
      .file-options {
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding-left: 24px;
      }
      .inline-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
      }
      .inline-input {
        width: 100px;
        padding: 4px 8px;
        font-size: 11px;
      }
      .hint-inline {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
      }
      
      /* Buttons */
      .btn-icon-small {
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: var(--vscode-descriptionForeground);
        cursor: pointer;
        border-radius: 4px;
        font-size: 14px;
      }
      .btn-icon-small:hover {
        background: var(--vscode-list-hoverBackground);
        color: #f85149;
      }
      .btn-small {
        padding: 6px 12px;
        font-size: 12px;
        min-width: auto;
      }
      
      /* Path input */
      .path-input {
        display: flex;
        gap: 8px;
      }
      .path-input .form-input {
        flex: 1;
      }
      
      /* Layer tabs */
      .layer-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      .layer-tab {
        padding: 8px 16px;
        border: 1px solid var(--vscode-panel-border);
        background: var(--vscode-editor-background);
        color: var(--vscode-foreground);
        border-radius: 6px 6px 0 0;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }
      .layer-tab:hover {
        background: var(--vscode-list-hoverBackground);
      }
      .layer-tab.active {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border-color: var(--vscode-button-background);
      }
      
      /* Layer form */
      .layer-form {
        background: var(--vscode-editor-background);
        border-radius: 0 6px 6px 6px;
        padding: 20px;
        border: 1px solid var(--vscode-panel-border);
      }
      
      /* Type selector */
      .type-selector {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .type-option {
        flex: 1;
        min-width: 150px;
        padding: 16px;
        border: 2px solid var(--vscode-panel-border);
        border-radius: 8px;
        background: var(--vscode-sideBar-background);
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
      }
      .type-option:hover {
        border-color: var(--vscode-focusBorder);
      }
      .type-option.selected {
        border-color: var(--vscode-button-background);
        background: rgba(0, 120, 212, 0.1);
      }
      .type-icon {
        font-size: 32px;
        margin-bottom: 8px;
      }
      .type-label {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 4px;
      }
      .type-desc {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
      }
      
      /* Resource list */
      .resource-list {
        background: var(--vscode-sideBar-background);
        border-radius: 6px;
        padding: 12px;
      }
      .resource-item {
        padding: 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
      .resource-item:last-child {
        border-bottom: none;
      }
      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 12px;
      }
      .checkbox-label.sub {
        margin-left: 24px;
        margin-top: 6px;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
      }
      .resource-path {
        font-family: var(--vscode-editor-font-family);
      }
      
      /* Layer nav buttons */
      .layer-nav-buttons {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--vscode-panel-border);
      }
      
      /* Continuation section */
      .continuation-section {
        background: rgba(158, 106, 3, 0.08);
        border: 1px dashed #9e6a03;
        border-radius: 8px;
        padding: 16px;
        margin-top: 16px;
      }
      .continuation-section > label:first-child {
        color: #bb8009;
      }
      .continuation-row {
        display: flex;
        gap: 20px;
        align-items: flex-start;
        margin-top: 12px;
      }
      .continuation-prompt-col {
        flex: 3;
      }
      .continuation-attempts-col {
        flex: 1;
        min-width: 140px;
      }
      .sub-label {
        display: block;
        font-size: 11px;
        font-weight: 500;
        margin-bottom: 6px;
        color: var(--vscode-descriptionForeground);
      }
    `;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export function showProjectSpecWizard(context: vscode.ExtensionContext): void {
  ProjectSpecWizardPanel.show(context.extensionUri, context);
}
