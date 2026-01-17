/**
 * Wizard State Types
 * 
 * Type definitions for the new multi-screen wizard based on WIZARD UX SPEC.
 */

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Path standard preference
 */
export type PathStandard = 'windows' | 'cygwin';

/**
 * Task mode for a layer
 */
export type TaskMode = 'csv-import' | 'fixed-count' | 'condition-driven';

/**
 * Worker lifecycle mode
 */
export type WorkerLifecycle = 'new-per-task' | 'reuse';

/**
 * Wizard entry mode (Screen 0)
 */
export type WizardEntryMode = 'new-project' | 'resume-wizard' | 'project-started';

/**
 * Validation severity
 */
export type ValidationSeverity = 'error' | 'warning';

// =============================================================================
// LAYER CONFIG
// =============================================================================

/**
 * CSV parse result
 */
export interface CsvParseResult {
  success: boolean;
  taskCount: number;
  headers: string[];
  delimiter: string;
  errors: string[];
  preview?: string[]; // First few rows for preview
}

/**
 * Layer configuration
 */
export interface LayerConfig {
  /** Layer number (1-16) */
  number: number;
  
  /** Whether layer is enabled (always true for layer 1) */
  enabled: boolean;
  
  /** Layer name (default: L1, L2, ...) */
  name: string;
  
  /** Number of agents in this layer (1-99) */
  agentCount: number;
  
  /** UID prefix (readonly, e.g., L1, L2) */
  uidPrefix: string;
  
  // --- Task mode ---
  
  /** How tasks are generated/imported */
  taskMode: TaskMode;
  
  /** CSV file path (for csv-import mode) */
  csvPath?: string;
  
  /** Pasted CSV content (for csv-import mode) */
  csvPastedContent?: string;
  
  /** Parse result (for csv-import mode) */
  csvParseResult?: CsvParseResult;
  
  /** Fixed task count (for fixed-count mode) */
  fixedTaskCount?: number;
  
  /** Stop condition description (for condition-driven mode) */
  stopCondition?: string;
  
  /** Comment about task mode */
  taskModeComment?: string;
  
  // --- Worker lifecycle ---
  
  /** How workers are managed */
  workerLifecycle: WorkerLifecycle;
  
  // --- Advanced settings ---
  
  /** Prompt to send after task completion */
  postTaskPrompt?: string;
  
  /** Layer-specific repository path */
  layerRepoPath?: string;
  
  /** Comment for global repo for this layer */
  globalRepoComment?: string;
  
  /** Skip copying global repo for this layer */
  skipGlobalRepoCopy: boolean;
}

// =============================================================================
// WIZARD STATE
// =============================================================================

/**
 * Base settings (Screen 1)
 */
export interface BaseSettings {
  /** Project name (a-zA-Z0-9_-) */
  projectName: string;
  
  /** Layer mode: true = advanced (2+), false = easy (1 layer) */
  advancedLayerMode: boolean;
  
  /** Maximum total AI agents */
  maxAgentsTotal: number;
  
  /** Path standard preference */
  pathStandard: PathStandard;
}

/**
 * Global settings (Screen 2)
 */
export interface GlobalSettings {
  /** Global repository path (optional) */
  globalRepoPath?: string;
  
  /** Comment for global repo for all agents */
  globalRepoComment?: string;
  
  /** Load default AI instruction pack */
  loadInstructionPack: boolean;
  
  /** Default output directory */
  outputDirectory: string;
}

/**
 * Validation issue
 */
export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  field?: string;
  screen?: number;
}

/**
 * Full wizard state
 */
export interface WizardState {
  // --- Meta ---
  
  /** Current screen (0 = welcome, 1 = base, 2 = global, 3+ = layers, N+1 = summary, N+2 = validation) */
  currentScreen: number;
  
  /** Total number of screens (depends on layer count) */
  totalScreens: number;
  
  /** Entry mode determined on screen 0 */
  entryMode: WizardEntryMode;
  
  /** Whether wizard has been completed (FINISH pressed) */
  wizardCompleted: boolean;
  
  /** Whether project has been started (CREATE/START pressed) */
  projectStarted: boolean;
  
  /** Show advanced options by default */
  showAdvancedOptions: boolean;
  
  // --- Screen 1: Base settings ---
  base: BaseSettings;
  
  // --- Screen 2: Global settings ---
  global: GlobalSettings;
  
  // --- Screens 3+: Layer configs ---
  layers: LayerConfig[];
  
  // --- Validation ---
  validationIssues: ValidationIssue[];
  
  // --- Paths (computed) ---
  
  /** CEO workspace path (Windows) */
  ceoPathWindows: string;
  
  /** CEO workspace path (Cygwin) */
  ceoPathCygwin: string;
}

// =============================================================================
// DEFAULTS
// =============================================================================

/**
 * Create default layer config
 */
export function createDefaultLayerConfig(layerNumber: number): LayerConfig {
  return {
    number: layerNumber,
    enabled: layerNumber === 1, // Layer 1 always enabled
    name: `L${layerNumber}`,
    agentCount: 1,
    uidPrefix: `L${layerNumber}`,
    taskMode: 'csv-import',
    workerLifecycle: 'reuse',
    skipGlobalRepoCopy: false,
  };
}

/**
 * Create default wizard state
 */
export function createDefaultWizardState(): WizardState {
  return {
    currentScreen: 0,
    totalScreens: 5, // Welcome + Base + Global + Layer1 + Summary + Validation = 6, but starts as 5 for 1 layer
    entryMode: 'new-project',
    wizardCompleted: false,
    projectStarted: false,
    showAdvancedOptions: false,
    
    base: {
      projectName: '',
      advancedLayerMode: false,
      maxAgentsTotal: 4,
      pathStandard: 'windows',
    },
    
    global: {
      loadInstructionPack: true,
      outputDirectory: '', // Will be set based on workspace
    },
    
    layers: [createDefaultLayerConfig(1)],
    
    validationIssues: [],
    
    ceoPathWindows: '',
    ceoPathCygwin: '',
  };
}

// =============================================================================
// SCREEN HELPERS
// =============================================================================

/**
 * Get screen type for a given screen number
 */
export type ScreenType = 'welcome' | 'base' | 'global' | 'layer' | 'summary' | 'validation';

export function getScreenType(screenNumber: number, totalLayers: number): ScreenType {
  if (screenNumber === 0) return 'welcome';
  if (screenNumber === 1) return 'base';
  if (screenNumber === 2) return 'global';
  if (screenNumber >= 3 && screenNumber < 3 + totalLayers) return 'layer';
  if (screenNumber === 3 + totalLayers) return 'summary';
  if (screenNumber === 4 + totalLayers) return 'validation';
  return 'welcome'; // Fallback
}

/**
 * Get layer index for a screen number (for layer screens)
 */
export function getLayerIndexForScreen(screenNumber: number): number {
  return screenNumber - 3; // Screen 3 = Layer 0 (index), Screen 4 = Layer 1 (index), etc.
}

/**
 * Get screen number for a layer index
 */
export function getScreenForLayerIndex(layerIndex: number): number {
  return layerIndex + 3;
}

/**
 * Calculate total screens based on layer count
 */
export function calculateTotalScreens(enabledLayerCount: number): number {
  // Screen 0: Welcome
  // Screen 1: Base Settings
  // Screen 2: Global Settings
  // Screens 3 to 3+N-1: Layer configs (N layers)
  // Screen 3+N: Summary
  // Screen 4+N: Validation
  return 5 + enabledLayerCount; // 0,1,2, layers, summary, validation
}

/**
 * Get enabled layer count
 */
export function getEnabledLayerCount(layers: LayerConfig[]): number {
  return layers.filter(l => l.enabled).length;
}
