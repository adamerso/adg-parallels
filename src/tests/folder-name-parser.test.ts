/**
 * Folder Name Parser Tests
 * 
 * Tests for folder name parsing and generation.
 */

import {
  parseFolderName,
  generateFolderName,
  generateCeoFolderName,
  generateChildFolderName,
  isAdgFolder,
  containsAdgFolder,
  formatUid,
  generateUid,
  resetUidCounter,
  getUidCounter,
  setUidCounter,
  buildWorkerPath,
  extractHierarchy,
  findDeepestIdentity,
  findCeoIdentity,
  validateFolderParams,
  validateWorkerCount,
  FOLDER_PREFIX,
  FolderIdentity,
} from '../core/folder-name-parser';

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

function assertArrayEqual<T>(actual: T[], expected: T[], message?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message || 'Array assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertNotNull<T>(value: T | null, message?: string): asserts value is T {
  if (value === null) {
    throw new Error(`${message || 'Value is null'}`);
  }
}

function assertNull<T>(value: T | null, message?: string): void {
  if (value !== null) {
    throw new Error(`${message || 'Expected null'}, got ${JSON.stringify(value)}`);
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
// TESTS
// =============================================================================

console.log('\n🧪 Folder Name Parser Tests\n');
console.log('='.repeat(50));

// Reset UID counter before tests
resetUidCounter();

// --- Constants ---
test('FOLDER_PREFIX is .adg-parallels_', () => {
  assertEqual(FOLDER_PREFIX, '.adg-parallels_');
});

// --- parseFolderName - Valid Cases ---
test('parseFolderName: CEO folder', () => {
  const result = parseFolderName('.adg-parallels_CEO_W3_S1_U00001');
  assertTrue(result.success);
  if (result.success) {
    assertEqual(result.identity.role, 'CEO');
    assertEqual(result.identity.workers, 3);
    assertEqual(result.identity.sibling, 1);
    assertEqual(result.identity.uid, 1);
    assertEqual(result.identity.uidFormatted, '00001');
    assertTrue(result.identity.isCEO);
    assertFalse(result.identity.isLeaf);
    assertEqual(result.identity.layer, 0);
  }
});

test('parseFolderName: DELIVCO leaf worker', () => {
  const result = parseFolderName('.adg-parallels_DELIVCO_W0_S2_U00011');
  assertTrue(result.success);
  if (result.success) {
    assertEqual(result.identity.role, 'DELIVCO');
    assertEqual(result.identity.workers, 0);
    assertEqual(result.identity.sibling, 2);
    assertEqual(result.identity.uid, 11);
    assertTrue(result.identity.isLeaf);
    assertFalse(result.identity.isCEO);
    assertEqual(result.identity.depth, 4); // DELIVCO is from depth-4 hierarchy
    assertEqual(result.identity.layer, 2);
  }
});

test('parseFolderName: STRATOP with workers', () => {
  const result = parseFolderName('.adg-parallels_STRATOP_W2_S1_U00002');
  assertTrue(result.success);
  if (result.success) {
    assertEqual(result.identity.role, 'STRATOP');
    assertEqual(result.identity.workers, 2);
    assertFalse(result.identity.isLeaf);
    assertEqual(result.identity.depth, 4);
    assertEqual(result.identity.layer, 1);
  }
});

test('parseFolderName: handles path with forward slashes', () => {
  const result = parseFolderName('/project/folder/.adg-parallels_CEO_W3_S1_U00001');
  assertTrue(result.success);
  if (result.success) {
    assertEqual(result.identity.role, 'CEO');
  }
});

test('parseFolderName: handles path with backslashes', () => {
  const result = parseFolderName('C:\\Users\\test\\.adg-parallels_EXESUPP_W0_S3_U00099');
  assertTrue(result.success);
  if (result.success) {
    assertEqual(result.identity.role, 'EXESUPP');
    assertEqual(result.identity.sibling, 3);
    assertEqual(result.identity.uid, 99);
  }
});

test('parseFolderName: TECHOPS from depth-8 hierarchy', () => {
  const result = parseFolderName('.adg-parallels_TECHOPS_W0_S1_U12345');
  assertTrue(result.success);
  if (result.success) {
    assertEqual(result.identity.role, 'TECHOPS');
    assertEqual(result.identity.depth, 8);
    assertEqual(result.identity.layer, 7);
  }
});

// --- parseFolderName - Invalid Cases ---
test('parseFolderName: invalid - wrong prefix', () => {
  const result = parseFolderName('.adg-parallel_CEO_W3_S1_U00001');
  assertFalse(result.success);
});

test('parseFolderName: invalid - unknown role', () => {
  const result = parseFolderName('.adg-parallels_UNKNOWN_W3_S1_U00001');
  assertFalse(result.success);
  if (!result.success) {
    assertTrue(result.error.includes('Unknown role'));
  }
});

test('parseFolderName: invalid - workers > 16', () => {
  const result = parseFolderName('.adg-parallels_CEO_W17_S1_U00001');
  assertFalse(result.success);
});

test('parseFolderName: invalid - sibling 0', () => {
  const result = parseFolderName('.adg-parallels_CEO_W3_S0_U00001');
  assertFalse(result.success);
});

test('parseFolderName: invalid - uid 00000', () => {
  const result = parseFolderName('.adg-parallels_CEO_W3_S1_U00000');
  assertFalse(result.success);
});

test('parseFolderName: invalid - uid too long', () => {
  const result = parseFolderName('.adg-parallels_CEO_W3_S1_U000001');
  assertFalse(result.success);
});

test('parseFolderName: invalid - lowercase role', () => {
  const result = parseFolderName('.adg-parallels_ceo_W3_S1_U00001');
  assertFalse(result.success);
});

// --- isAdgFolder ---
test('isAdgFolder: valid folder', () => {
  assertTrue(isAdgFolder('.adg-parallels_CEO_W3_S1_U00001'));
});

test('isAdgFolder: invalid folder', () => {
  assertFalse(isAdgFolder('.adg-parallels_INVALID_W3_S1_U00001'));
});

test('isAdgFolder: regular folder', () => {
  assertFalse(isAdgFolder('node_modules'));
});

// --- containsAdgFolder ---
test('containsAdgFolder: path with ADG folder', () => {
  assertTrue(containsAdgFolder('/project/.adg-parallels_CEO_W3_S1_U00001'));
});

test('containsAdgFolder: path without ADG folder', () => {
  assertFalse(containsAdgFolder('/project/src/index.ts'));
});

// --- generateFolderName ---
test('generateFolderName: valid params', () => {
  const name = generateFolderName({ role: 'CEO', workers: 3, sibling: 1, uid: 1 });
  assertEqual(name, '.adg-parallels_CEO_W3_S1_U00001');
});

test('generateFolderName: DELIVCO leaf', () => {
  const name = generateFolderName({ role: 'DELIVCO', workers: 0, sibling: 2, uid: 11 });
  assertEqual(name, '.adg-parallels_DELIVCO_W0_S2_U00011');
});

test('generateFolderName: high uid', () => {
  const name = generateFolderName({ role: 'STRATOP', workers: 2, sibling: 1, uid: 99999 });
  assertEqual(name, '.adg-parallels_STRATOP_W2_S1_U99999');
});

test('generateFolderName: invalid role returns null', () => {
  assertNull(generateFolderName({ role: 'INVALID', workers: 0, sibling: 1, uid: 1 }));
});

test('generateFolderName: negative workers returns null', () => {
  assertNull(generateFolderName({ role: 'CEO', workers: -1, sibling: 1, uid: 1 }));
});

test('generateFolderName: uid > 99999 returns null', () => {
  assertNull(generateFolderName({ role: 'CEO', workers: 1, sibling: 1, uid: 100000 }));
});

// --- generateCeoFolderName ---
test('generateCeoFolderName: generates CEO folder', () => {
  const name = generateCeoFolderName(4, 1);
  assertEqual(name, '.adg-parallels_CEO_W4_S1_U00001');
});

test('generateCeoFolderName: CEO is always sibling 1', () => {
  const name = generateCeoFolderName(2, 5);
  assertEqual(name, '.adg-parallels_CEO_W2_S1_U00005');
});

// --- generateChildFolderName ---
test('generateChildFolderName: generates child from CEO', () => {
  const ceoResult = parseFolderName('.adg-parallels_CEO_W3_S1_U00001');
  assertTrue(ceoResult.success);
  if (ceoResult.success) {
    const childName = generateChildFolderName(ceoResult.identity, 'STRATOP', 1, 2, 2);
    assertEqual(childName, '.adg-parallels_STRATOP_W2_S1_U00002');
  }
});

test('generateChildFolderName: generates leaf from DELIVCO parent', () => {
  const parentResult = parseFolderName('.adg-parallels_DELIVCO_W2_S1_U00005');
  assertTrue(parentResult.success);
  if (parentResult.success) {
    const childName = generateChildFolderName(parentResult.identity, 'EXESUPP', 2, 0, 10);
    assertEqual(childName, '.adg-parallels_EXESUPP_W0_S2_U00010');
  }
});

// --- formatUid ---
test('formatUid: pads single digit', () => {
  assertEqual(formatUid(1), '00001');
});

test('formatUid: pads two digits', () => {
  assertEqual(formatUid(42), '00042');
});

test('formatUid: handles max', () => {
  assertEqual(formatUid(99999), '99999');
});

// --- UID management ---
test('UID counter: reset and generate', () => {
  resetUidCounter();
  assertEqual(getUidCounter(), 0);
  const uid1 = generateUid();
  assertEqual(uid1, 1);
  const uid2 = generateUid();
  assertEqual(uid2, 2);
  assertEqual(getUidCounter(), 2);
});

test('UID counter: set and get', () => {
  setUidCounter(100);
  assertEqual(getUidCounter(), 100);
  const uid = generateUid();
  assertEqual(uid, 101);
  resetUidCounter(); // Clean up
});

// --- buildWorkerPath ---
test('buildWorkerPath: builds path', () => {
  const path = buildWorkerPath(
    '/project',
    ['.adg-parallels_CEO_W3_S1_U00001'],
    '.adg-parallels_STRATOP_W2_S1_U00002'
  );
  assertEqual(path, '/project/.adg-parallels_CEO_W3_S1_U00001/.adg-parallels_STRATOP_W2_S1_U00002');
});

test('buildWorkerPath: normalizes backslashes', () => {
  const path = buildWorkerPath(
    'C:\\project',
    ['.adg-parallels_CEO_W3_S1_U00001'],
    '.adg-parallels_STRATOP_W2_S1_U00002'
  );
  assertEqual(path, 'C:/project/.adg-parallels_CEO_W3_S1_U00001/.adg-parallels_STRATOP_W2_S1_U00002');
});

// --- extractHierarchy ---
test('extractHierarchy: extracts from path', () => {
  const path = '/project/.adg-parallels_CEO_W3_S1_U00001/.adg-parallels_STRATOP_W2_S1_U00002/.adg-parallels_DELIVCO_W0_S1_U00003';
  const hierarchy = extractHierarchy(path);
  assertEqual(hierarchy.length, 3);
  assertEqual(hierarchy[0].role, 'CEO');
  assertEqual(hierarchy[1].role, 'STRATOP');
  assertEqual(hierarchy[2].role, 'DELIVCO');
});

test('extractHierarchy: skips non-ADG folders', () => {
  const path = '/project/src/.adg-parallels_CEO_W3_S1_U00001/config';
  const hierarchy = extractHierarchy(path);
  assertEqual(hierarchy.length, 1);
  assertEqual(hierarchy[0].role, 'CEO');
});

test('extractHierarchy: empty for non-ADG path', () => {
  const hierarchy = extractHierarchy('/project/src/index.ts');
  assertEqual(hierarchy.length, 0);
});

// --- findDeepestIdentity ---
test('findDeepestIdentity: finds deepest', () => {
  const path = '/project/.adg-parallels_CEO_W3_S1_U00001/.adg-parallels_DELIVCO_W0_S1_U00003';
  const identity = findDeepestIdentity(path);
  assertNotNull(identity);
  assertEqual(identity.role, 'DELIVCO');
});

test('findDeepestIdentity: null for non-ADG path', () => {
  assertNull(findDeepestIdentity('/project/src'));
});

// --- findCeoIdentity ---
test('findCeoIdentity: finds CEO', () => {
  const path = '/project/.adg-parallels_CEO_W3_S1_U00001/.adg-parallels_DELIVCO_W0_S1_U00003';
  const identity = findCeoIdentity(path);
  assertNotNull(identity);
  assertEqual(identity.role, 'CEO');
});

test('findCeoIdentity: null if no CEO', () => {
  // This is an edge case - a path with ADG folder but no CEO at root
  assertNull(findCeoIdentity('/project/src'));
});

// --- validateFolderParams ---
test('validateFolderParams: valid params', () => {
  const errors = validateFolderParams({ role: 'CEO', workers: 3, sibling: 1, uid: 1 });
  assertEqual(errors.length, 0);
});

test('validateFolderParams: invalid role', () => {
  const errors = validateFolderParams({ role: 'INVALID', workers: 3, sibling: 1, uid: 1 });
  assertTrue(errors.length > 0);
  assertTrue(errors[0].includes('Invalid role'));
});

test('validateFolderParams: multiple errors', () => {
  const errors = validateFolderParams({ role: 'INVALID', workers: -1, sibling: 0, uid: 0 });
  assertTrue(errors.length >= 3);
});

// --- validateWorkerCount ---
test('validateWorkerCount: CEO with workers in multi-layer', () => {
  const errors = validateWorkerCount('CEO', 3, 4);
  assertEqual(errors.length, 0);
});

test('validateWorkerCount: solo CEO must be leaf', () => {
  const errors = validateWorkerCount('CEO', 0, 1);
  assertEqual(errors.length, 0);
});

test('validateWorkerCount: solo CEO with workers is invalid', () => {
  const errors = validateWorkerCount('CEO', 3, 1);
  assertTrue(errors.length > 0);
});

test('validateWorkerCount: CEO in multi-layer must have workers', () => {
  const errors = validateWorkerCount('CEO', 0, 4);
  assertTrue(errors.length > 0);
});

test('validateWorkerCount: leaf role must have workers=0', () => {
  const errors = validateWorkerCount('EXESUPP', 0, 4);
  assertEqual(errors.length, 0);
});

test('validateWorkerCount: leaf role with workers > 0 is invalid', () => {
  const errors = validateWorkerCount('EXESUPP', 2, 4);
  assertTrue(errors.length > 0);
});

test('validateWorkerCount: non-leaf role must have workers > 0', () => {
  const errors = validateWorkerCount('STRATOP', 2, 4);
  assertEqual(errors.length, 0);
});

test('validateWorkerCount: non-leaf role with workers=0 is invalid', () => {
  const errors = validateWorkerCount('STRATOP', 0, 4);
  assertTrue(errors.length > 0);
});

// =============================================================================
// SUMMARY
// =============================================================================

console.log('='.repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
