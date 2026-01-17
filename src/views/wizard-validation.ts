/**
 * Wizard Validation
 * 
 * Validation logic for the wizard based on WIZARD UX SPEC.
 */

import {
  WizardState,
  LayerConfig,
  ValidationIssue,
  ValidationSeverity,
  getScreenForLayerIndex,
} from './wizard-types';

// =============================================================================
// VALIDATION RESULT
// =============================================================================

export interface ValidationResult {
  /** All validation issues */
  issues: ValidationIssue[];
  
  /** Blocking errors (prevent CREATE/START) */
  blockingErrors: ValidationIssue[];
  
  /** Warnings (informational only) */
  warnings: ValidationIssue[];
  
  /** Whether CREATE/START is allowed */
  canStart: boolean;
  
  /** Whether NEXT is allowed from current screen */
  canProceed: boolean;
}

// =============================================================================
// FIELD VALIDATORS
// =============================================================================

const PROJECT_NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Validate project name
 */
export function validateProjectName(name: string): string | null {
  if (!name) {
    return 'Project name is required';
  }
  if (!PROJECT_NAME_REGEX.test(name)) {
    return 'Only letters (a-z, A-Z), numbers (0-9), hyphens (-), and underscores (_). Max 64 chars.';
  }
  return null;
}

/**
 * Validate max agents total
 */
export function validateMaxAgents(count: number): string | null {
  if (count < 1 || count > 99) {
    return 'Max agents must be between 1 and 99';
  }
  return null;
}

/**
 * Validate output directory
 */
export function validateOutputDirectory(path: string): string | null {
  if (!path || path.trim() === '') {
    return 'Output directory is required';
  }
  return null;
}

/**
 * Validate layer name
 */
export function validateLayerName(name: string): string | null {
  if (!name || name.trim() === '') {
    return 'Layer name is required';
  }
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
    return 'Invalid layer name. Use alphanumeric, hyphens, underscores. Max 32 chars.';
  }
  return null;
}

/**
 * Validate agent count
 */
export function validateAgentCount(count: number): string | null {
  if (count < 1 || count > 99) {
    return 'Agent count must be between 1 and 99';
  }
  return null;
}

/**
 * Validate fixed task count
 */
export function validateFixedTaskCount(count: number | undefined): string | null {
  if (count === undefined || count < 1) {
    return 'Task count must be at least 1';
  }
  return null;
}

/**
 * Validate stop condition
 */
export function validateStopCondition(condition: string | undefined): string | null {
  if (!condition || condition.trim() === '') {
    return 'Stop condition description is required';
  }
  return null;
}

// =============================================================================
// SCREEN VALIDATORS
// =============================================================================

/**
 * Validate Screen 1: Base Settings
 */
export function validateBaseSettings(state: WizardState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  const nameError = validateProjectName(state.base.projectName);
  if (nameError) {
    issues.push({
      severity: 'error',
      message: nameError,
      field: 'projectName',
      screen: 1,
    });
  }
  
  const agentsError = validateMaxAgents(state.base.maxAgentsTotal);
  if (agentsError) {
    issues.push({
      severity: 'error',
      message: agentsError,
      field: 'maxAgentsTotal',
      screen: 1,
    });
  }
  
  return issues;
}

/**
 * Validate Screen 2: Global Settings
 */
export function validateGlobalSettings(state: WizardState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  const outputError = validateOutputDirectory(state.global.outputDirectory);
  if (outputError) {
    issues.push({
      severity: 'error',
      message: outputError,
      field: 'outputDirectory',
      screen: 2,
    });
  }
  
  // Warning: instruction pack disabled
  if (!state.global.loadInstructionPack) {
    issues.push({
      severity: 'warning',
      message: 'Default AI instruction pack is disabled. This is not recommended.',
      field: 'loadInstructionPack',
      screen: 2,
    });
  }
  
  return issues;
}

/**
 * Validate a single layer
 */
export function validateLayer(layer: LayerConfig, layerIndex: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const screen = getScreenForLayerIndex(layerIndex);
  
  // Skip disabled layers (except layer 1 which is always enabled)
  if (!layer.enabled && layer.number !== 1) {
    return issues;
  }
  
  // Layer name
  const nameError = validateLayerName(layer.name);
  if (nameError) {
    issues.push({
      severity: 'error',
      message: `Layer ${layer.number}: ${nameError}`,
      field: `layer${layer.number}_name`,
      screen,
    });
  }
  
  // Agent count
  const agentError = validateAgentCount(layer.agentCount);
  if (agentError) {
    issues.push({
      severity: 'error',
      message: `Layer ${layer.number}: ${agentError}`,
      field: `layer${layer.number}_agentCount`,
      screen,
    });
  }
  
  // Task mode specific validation
  switch (layer.taskMode) {
    case 'csv-import':
      // CSV must be loaded successfully
      if (!layer.csvParseResult || !layer.csvParseResult.success) {
        issues.push({
          severity: 'error',
          message: `Layer ${layer.number}: CSV task queue not loaded or has errors`,
          field: `layer${layer.number}_csv`,
          screen,
        });
      }
      break;
      
    case 'fixed-count':
      const countError = validateFixedTaskCount(layer.fixedTaskCount);
      if (countError) {
        issues.push({
          severity: 'error',
          message: `Layer ${layer.number}: ${countError}`,
          field: `layer${layer.number}_fixedTaskCount`,
          screen,
        });
      }
      break;
      
    case 'condition-driven':
      const conditionError = validateStopCondition(layer.stopCondition);
      if (conditionError) {
        issues.push({
          severity: 'error',
          message: `Layer ${layer.number}: ${conditionError}`,
          field: `layer${layer.number}_stopCondition`,
          screen,
        });
      }
      break;
  }
  
  return issues;
}

/**
 * Validate all layers
 */
export function validateAllLayers(state: WizardState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  for (let i = 0; i < state.layers.length; i++) {
    issues.push(...validateLayer(state.layers[i], i));
  }
  
  return issues;
}

// =============================================================================
// CROSS-FIELD WARNINGS
// =============================================================================

/**
 * Check for cross-field warnings
 */
export function checkCrossFieldWarnings(state: WizardState): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  
  // Sum of agents per layer vs max total
  const totalAgents = state.layers
    .filter(l => l.enabled)
    .reduce((sum, l) => sum + l.agentCount, 0);
  
  if (totalAgents > state.base.maxAgentsTotal) {
    warnings.push({
      severity: 'warning',
      message: `Total agents (${totalAgents}) exceeds max limit (${state.base.maxAgentsTotal}). Some agents may queue.`,
      field: 'maxAgentsTotal',
      screen: 1,
    });
  }
  
  // Skip global repo copy without layer repo
  for (const layer of state.layers) {
    if (layer.enabled && layer.skipGlobalRepoCopy && !layer.layerRepoPath) {
      warnings.push({
        severity: 'warning',
        message: `Layer ${layer.number}: Skipping global repo copy but no layer repo specified.`,
        field: `layer${layer.number}_skipGlobalRepoCopy`,
        screen: getScreenForLayerIndex(layer.number - 1),
      });
    }
  }
  
  // New instance per task with high task count
  for (const layer of state.layers) {
    if (layer.enabled && layer.workerLifecycle === 'new-per-task') {
      const taskCount = layer.taskMode === 'fixed-count' 
        ? layer.fixedTaskCount ?? 0
        : layer.csvParseResult?.taskCount ?? 0;
      
      if (taskCount > 50) {
        warnings.push({
          severity: 'warning',
          message: `Layer ${layer.number}: New instance per task with ${taskCount} tasks may be slow.`,
          field: `layer${layer.number}_workerLifecycle`,
          screen: getScreenForLayerIndex(layer.number - 1),
        });
      }
    }
  }
  
  return warnings;
}

// =============================================================================
// FULL VALIDATION
// =============================================================================

/**
 * Run full validation on wizard state
 */
export function validateWizardState(state: WizardState): ValidationResult {
  const issues: ValidationIssue[] = [];
  
  // Validate each section
  issues.push(...validateBaseSettings(state));
  issues.push(...validateGlobalSettings(state));
  issues.push(...validateAllLayers(state));
  issues.push(...checkCrossFieldWarnings(state));
  
  // Separate errors and warnings
  const blockingErrors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  
  return {
    issues,
    blockingErrors,
    warnings,
    canStart: blockingErrors.length === 0,
    canProceed: true, // Will be refined per-screen
  };
}

/**
 * Check if current screen allows proceeding to next
 */
export function canProceedFromScreen(state: WizardState, screenNumber: number): boolean {
  switch (screenNumber) {
    case 0: // Welcome
      return true;
      
    case 1: // Base Settings
      const baseIssues = validateBaseSettings(state);
      return baseIssues.filter(i => i.severity === 'error').length === 0;
      
    case 2: // Global Settings
      const globalIssues = validateGlobalSettings(state);
      return globalIssues.filter(i => i.severity === 'error').length === 0;
      
    default:
      // Layer screens - allow proceeding even with soft errors
      // Hard validation happens on CREATE/START
      return true;
  }
}

/**
 * Get validation issues for a specific screen
 */
export function getIssuesForScreen(issues: ValidationIssue[], screenNumber: number): ValidationIssue[] {
  return issues.filter(i => i.screen === screenNumber);
}

/**
 * Get blocking errors count
 */
export function getBlockingErrorCount(state: WizardState): number {
  const result = validateWizardState(state);
  return result.blockingErrors.length;
}
