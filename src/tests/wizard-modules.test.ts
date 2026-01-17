/**
 * Wizard Module Tests
 * 
 * Tests for wizard types, validation, paths, and CSV parsing.
 */

import {
  createDefaultWizardState,
  createDefaultLayerConfig,
  getScreenType,
  getLayerIndexForScreen,
  getScreenForLayerIndex,
  calculateTotalScreens,
  getEnabledLayerCount,
} from '../views/wizard-types';

import {
  validateProjectName,
  validateMaxAgents,
  validateOutputDirectory,
  validateLayerName,
  validateAgentCount,
  validateBaseSettings,
  validateGlobalSettings,
  validateLayer,
  validateWizardState,
  canProceedFromScreen,
} from '../views/wizard-validation';

import {
  windowsToCygwin,
  cygwinToWindows,
  normalizePath,
  getBothPathFormats,
  buildCeoPaths,
  isAbsolutePath,
  joinPaths,
} from '../views/wizard-paths';

import {
  parseCsvContent,
  detectDelimiter,
  validateHeaders,
  getParseResultSummary,
} from '../views/wizard-csv';

// =============================================================================
// TEST HELPERS
// =============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    failed++;
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertNull<T>(value: T | null, message?: string): void {
  if (value !== null) {
    throw new Error(`${message || 'Expected null'}, got ${JSON.stringify(value)}`);
  }
}

function assertNotNull<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`${message || 'Value is null/undefined'}`);
  }
}

function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(`${message || 'Expected true, got false'}`);
  }
}

function assertFalse(value: boolean, message?: string): void {
  if (value) {
    throw new Error(`${message || 'Expected false, got true'}`);
  }
}

// =============================================================================
// WIZARD TYPES TESTS
// =============================================================================

console.log('\n🧪 Wizard Types Tests\n');
console.log('='.repeat(50));

test('createDefaultWizardState creates valid state', () => {
  const state = createDefaultWizardState();
  assertEqual(state.currentScreen, 0);
  assertEqual(state.entryMode, 'new-project');
  assertFalse(state.wizardCompleted);
  assertFalse(state.projectStarted);
  assertEqual(state.layers.length, 1);
});

test('createDefaultLayerConfig creates layer with defaults', () => {
  const layer = createDefaultLayerConfig(2);
  assertEqual(layer.number, 2);
  assertFalse(layer.enabled); // Layer 2 is disabled by default
  assertEqual(layer.name, 'L2');
  assertEqual(layer.agentCount, 1);
  assertEqual(layer.taskMode, 'csv-import');
  assertEqual(layer.workerLifecycle, 'reuse');
});

test('createDefaultLayerConfig: layer 1 is enabled', () => {
  const layer = createDefaultLayerConfig(1);
  assertTrue(layer.enabled);
});

test('getScreenType: screen 0 is welcome', () => {
  assertEqual(getScreenType(0, 1), 'welcome');
});

test('getScreenType: screen 1 is base', () => {
  assertEqual(getScreenType(1, 1), 'base');
});

test('getScreenType: screen 2 is global', () => {
  assertEqual(getScreenType(2, 1), 'global');
});

test('getScreenType: screen 3 with 1 layer is layer', () => {
  assertEqual(getScreenType(3, 1), 'layer');
});

test('getScreenType: screen 4 with 1 layer is summary', () => {
  assertEqual(getScreenType(4, 1), 'summary');
});

test('getScreenType: screen 5 with 1 layer is validation', () => {
  assertEqual(getScreenType(5, 1), 'validation');
});

test('getLayerIndexForScreen: screen 3 = layer index 0', () => {
  assertEqual(getLayerIndexForScreen(3), 0);
});

test('getLayerIndexForScreen: screen 5 = layer index 2', () => {
  assertEqual(getLayerIndexForScreen(5), 2);
});

test('getScreenForLayerIndex: layer 0 = screen 3', () => {
  assertEqual(getScreenForLayerIndex(0), 3);
});

test('calculateTotalScreens: 1 layer = 6 screens', () => {
  assertEqual(calculateTotalScreens(1), 6);
});

test('calculateTotalScreens: 3 layers = 8 screens', () => {
  assertEqual(calculateTotalScreens(3), 8);
});

test('getEnabledLayerCount: counts enabled layers', () => {
  const layers = [
    createDefaultLayerConfig(1),
    createDefaultLayerConfig(2),
    createDefaultLayerConfig(3),
  ];
  layers[1].enabled = true;
  assertEqual(getEnabledLayerCount(layers), 2);
});

// =============================================================================
// WIZARD VALIDATION TESTS
// =============================================================================

console.log('\n🧪 Wizard Validation Tests\n');
console.log('='.repeat(50));

test('validateProjectName: valid name', () => {
  assertNull(validateProjectName('my_project-123'));
});

test('validateProjectName: empty name', () => {
  assertNotNull(validateProjectName(''));
});

test('validateProjectName: invalid chars', () => {
  assertNotNull(validateProjectName('my project!'));
});

test('validateMaxAgents: valid count', () => {
  assertNull(validateMaxAgents(10));
});

test('validateMaxAgents: too low', () => {
  assertNotNull(validateMaxAgents(0));
});

test('validateMaxAgents: too high', () => {
  assertNotNull(validateMaxAgents(100));
});

test('validateOutputDirectory: valid path', () => {
  assertNull(validateOutputDirectory('C:\\output'));
});

test('validateOutputDirectory: empty path', () => {
  assertNotNull(validateOutputDirectory(''));
});

test('validateLayerName: valid name', () => {
  assertNull(validateLayerName('Layer_1'));
});

test('validateLayerName: empty name', () => {
  assertNotNull(validateLayerName(''));
});

test('validateAgentCount: valid count', () => {
  assertNull(validateAgentCount(5));
});

test('validateAgentCount: too low', () => {
  assertNotNull(validateAgentCount(0));
});

test('validateBaseSettings: returns errors for invalid state', () => {
  const state = createDefaultWizardState();
  state.base.projectName = ''; // Invalid
  const issues = validateBaseSettings(state);
  assertTrue(issues.length > 0);
});

test('validateBaseSettings: no errors for valid state', () => {
  const state = createDefaultWizardState();
  state.base.projectName = 'valid_project';
  state.base.maxAgentsTotal = 4;
  const issues = validateBaseSettings(state);
  const errors = issues.filter(i => i.severity === 'error');
  assertEqual(errors.length, 0);
});

test('validateGlobalSettings: error for empty output', () => {
  const state = createDefaultWizardState();
  state.global.outputDirectory = '';
  const issues = validateGlobalSettings(state);
  const errors = issues.filter(i => i.severity === 'error');
  assertTrue(errors.length > 0);
});

test('validateGlobalSettings: warning for disabled instruction pack', () => {
  const state = createDefaultWizardState();
  state.global.outputDirectory = 'C:\\output';
  state.global.loadInstructionPack = false;
  const issues = validateGlobalSettings(state);
  const warnings = issues.filter(i => i.severity === 'warning');
  assertTrue(warnings.length > 0);
});

test('validateLayer: error for missing CSV parse', () => {
  const layer = createDefaultLayerConfig(1);
  layer.taskMode = 'csv-import';
  // No csvParseResult
  const issues = validateLayer(layer, 0);
  assertTrue(issues.length > 0);
});

test('validateLayer: no error with successful CSV parse', () => {
  const layer = createDefaultLayerConfig(1);
  layer.taskMode = 'csv-import';
  layer.csvParseResult = {
    success: true,
    taskCount: 10,
    headers: ['id', 'task'],
    delimiter: ';',
    errors: [],
  };
  const issues = validateLayer(layer, 0);
  assertEqual(issues.filter(i => i.severity === 'error').length, 0);
});

test('canProceedFromScreen: screen 0 always true', () => {
  const state = createDefaultWizardState();
  assertTrue(canProceedFromScreen(state, 0));
});

test('canProceedFromScreen: screen 1 false with invalid name', () => {
  const state = createDefaultWizardState();
  state.base.projectName = '';
  assertFalse(canProceedFromScreen(state, 1));
});

// =============================================================================
// WIZARD PATHS TESTS
// =============================================================================

console.log('\n🧪 Wizard Paths Tests\n');
console.log('='.repeat(50));

test('windowsToCygwin: converts drive letter', () => {
  assertEqual(windowsToCygwin('C:\\Users\\test'), '/cygdrive/c/Users/test');
});

test('windowsToCygwin: handles lowercase drive', () => {
  assertEqual(windowsToCygwin('d:\\project'), '/cygdrive/d/project');
});

test('windowsToCygwin: already cygwin returns same', () => {
  assertEqual(windowsToCygwin('/cygdrive/c/test'), '/cygdrive/c/test');
});

test('cygwinToWindows: converts cygdrive', () => {
  assertEqual(cygwinToWindows('/cygdrive/c/Users/test'), 'C:\\Users\\test');
});

test('cygwinToWindows: already windows returns same', () => {
  assertEqual(cygwinToWindows('C:\\test'), 'C:\\test');
});

test('normalizePath: windows standard', () => {
  assertEqual(normalizePath('/cygdrive/c/test', 'windows'), 'C:\\test');
});

test('normalizePath: cygwin standard', () => {
  assertEqual(normalizePath('C:\\test', 'cygwin'), '/cygdrive/c/test');
});

test('getBothPathFormats: from windows', () => {
  const result = getBothPathFormats('C:\\test');
  assertEqual(result.windows, 'C:\\test');
  assertEqual(result.cygwin, '/cygdrive/c/test');
});

test('getBothPathFormats: from cygwin', () => {
  const result = getBothPathFormats('/cygdrive/d/project');
  assertEqual(result.windows, 'D:\\project');
  assertEqual(result.cygwin, '/cygdrive/d/project');
});

test('buildCeoPaths: creates both formats', () => {
  const result = buildCeoPaths('C:\\workspace');
  assertTrue(result.windows.includes('.adg-parallels_CEO'));
  assertTrue(result.cygwin.includes('.adg-parallels_CEO'));
});

test('isAbsolutePath: windows absolute', () => {
  assertTrue(isAbsolutePath('C:\\test'));
});

test('isAbsolutePath: cygwin absolute', () => {
  assertTrue(isAbsolutePath('/cygdrive/c/test'));
});

test('isAbsolutePath: relative', () => {
  assertFalse(isAbsolutePath('./relative'));
});

test('joinPaths: windows style', () => {
  const result = joinPaths('C:\\base', 'sub', 'folder');
  assertEqual(result, 'C:\\base\\sub\\folder');
});

test('joinPaths: cygwin style', () => {
  const result = joinPaths('/cygdrive/c/base', 'sub', 'folder');
  assertEqual(result, '/cygdrive/c/base/sub/folder');
});

// =============================================================================
// WIZARD CSV TESTS
// =============================================================================

console.log('\n🧪 Wizard CSV Tests\n');
console.log('='.repeat(50));

test('parseCsvContent: valid CSV', () => {
  const csv = 'id;name;value\n1;test;100\n2;demo;200';
  const result = parseCsvContent(csv, ';');
  assertTrue(result.success);
  assertEqual(result.taskCount, 2);
  assertEqual(result.headers.length, 3);
  assertEqual(result.headers[0], 'id');
});

test('parseCsvContent: empty content', () => {
  const result = parseCsvContent('', ';');
  assertFalse(result.success);
  assertTrue(result.errors.length > 0);
});

test('parseCsvContent: column mismatch', () => {
  const csv = 'id;name;value\n1;test\n2;demo;200';
  const result = parseCsvContent(csv, ';');
  assertFalse(result.success);
  assertEqual(result.taskCount, 1); // Only valid row counts
});

test('parseCsvContent: quoted fields', () => {
  const csv = 'id;name\n1;"hello;world"\n2;test';
  const result = parseCsvContent(csv, ';');
  assertTrue(result.success);
  assertEqual(result.taskCount, 2);
});

test('parseCsvContent: escaped quotes', () => {
  const csv = 'id;name\n1;"he said ""hello"""\n2;test';
  const result = parseCsvContent(csv, ';');
  assertTrue(result.success);
});

test('detectDelimiter: semicolon', () => {
  const csv = 'a;b;c\n1;2;3';
  assertEqual(detectDelimiter(csv), ';');
});

test('detectDelimiter: comma', () => {
  const csv = 'a,b,c\n1,2,3';
  assertEqual(detectDelimiter(csv), ',');
});

test('detectDelimiter: tab', () => {
  const csv = 'a\tb\tc\n1\t2\t3';
  assertEqual(detectDelimiter(csv), '\t');
});

test('validateHeaders: valid headers', () => {
  const errors = validateHeaders(['id', 'name', 'value']);
  assertEqual(errors.length, 0);
});

test('validateHeaders: empty header', () => {
  const errors = validateHeaders(['id', '', 'value']);
  assertTrue(errors.length > 0);
});

test('validateHeaders: duplicate headers', () => {
  const errors = validateHeaders(['id', 'name', 'ID']);
  assertTrue(errors.length > 0);
});

test('getParseResultSummary: success', () => {
  const result = parseCsvContent('id;name\n1;test', ';');
  const summary = getParseResultSummary(result);
  assertTrue(summary.includes('✅'));
  assertTrue(summary.includes('1 tasks'));
});

test('getParseResultSummary: failure', () => {
  const result = parseCsvContent('', ';');
  const summary = getParseResultSummary(result);
  assertTrue(summary.includes('❌'));
});

// =============================================================================
// SUMMARY
// =============================================================================

console.log('='.repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
