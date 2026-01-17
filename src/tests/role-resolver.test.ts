/**
 * Role Resolver Tests
 * 
 * Tests for the role resolution module.
 */

import {
  getHierarchy,
  getRoleAt,
  getRoleCode,
  lookupRole,
  getDepthFromRole,
  getLayerFromRole,
  canDelegate,
  getRoleCodes,
  isValidRole,
  getSubordinateRole,
  getParentRole,
  MIN_DEPTH,
  MAX_DEPTH,
} from '../core/role-resolver';

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

// =============================================================================
// TESTS
// =============================================================================

console.log('\n🧪 Role Resolver Tests\n');
console.log('='.repeat(50));

// --- Constants ---
test('MIN_DEPTH is 1', () => {
  assertEqual(MIN_DEPTH, 1);
});

test('MAX_DEPTH is 16', () => {
  assertEqual(MAX_DEPTH, 16);
});

// --- getHierarchy ---
test('getHierarchy returns null for depth 0', () => {
  assertNull(getHierarchy(0));
});

test('getHierarchy returns null for depth 17', () => {
  assertNull(getHierarchy(17));
});

test('getHierarchy(1) has 1 role (CEO only)', () => {
  const h = getHierarchy(1);
  assertNotNull(h);
  assertEqual(h.roles.length, 1);
  assertEqual(h.roles[0].code, 'CEO');
});

test('getHierarchy(4) has 4 roles', () => {
  const h = getHierarchy(4);
  assertNotNull(h);
  assertEqual(h.roles.length, 4);
  assertEqual(h.depth, 4);
});

test('getHierarchy(4) roles are CEO, STRATOP, DELIVCO, EXESUPP', () => {
  const h = getHierarchy(4);
  assertNotNull(h);
  assertArrayEqual(
    h.roles.map(r => r.code),
    ['CEO', 'STRATOP', 'DELIVCO', 'EXESUPP']
  );
});

test('getHierarchy(8) has IT theme', () => {
  const h = getHierarchy(8);
  assertNotNull(h);
  assertEqual(h.theme, 'IT / ENGINEERING CORE');
});

test('getHierarchy(16) has 16 roles ending with ONESHOT', () => {
  const h = getHierarchy(16);
  assertNotNull(h);
  assertEqual(h.roles.length, 16);
  assertEqual(h.roles[15].code, 'ONESHOT');
});

// --- getRoleAt ---
test('getRoleAt(4, 0) is CEO', () => {
  const role = getRoleAt(4, 0);
  assertNotNull(role);
  assertEqual(role.code, 'CEO');
  assertEqual(role.isCEO, true);
  assertEqual(role.isLeaf, false);
});

test('getRoleAt(4, 3) is EXESUPP and isLeaf', () => {
  const role = getRoleAt(4, 3);
  assertNotNull(role);
  assertEqual(role.code, 'EXESUPP');
  assertEqual(role.isLeaf, true);
  assertEqual(role.isCEO, false);
});

test('getRoleAt(4, 4) is null (out of range)', () => {
  assertNull(getRoleAt(4, 4));
});

test('getRoleAt(4, -1) is null', () => {
  assertNull(getRoleAt(4, -1));
});

// --- getRoleCode ---
test('getRoleCode(4, 2) is DELIVCO', () => {
  assertEqual(getRoleCode(4, 2), 'DELIVCO');
});

test('getRoleCode(8, 7) is TECHOPS', () => {
  assertEqual(getRoleCode(8, 7), 'TECHOPS');
});

// --- lookupRole ---
test('lookupRole(CEO) returns null (ambiguous)', () => {
  assertNull(lookupRole('CEO'));
});

test('lookupRole(DELIVCO) returns depth=4, layer=2', () => {
  const info = lookupRole('DELIVCO');
  assertNotNull(info);
  assertEqual(info.depth, 4);
  assertEqual(info.layer, 2);
});

test('lookupRole(ONESHOT) returns depth=16, layer=15', () => {
  const info = lookupRole('ONESHOT');
  assertNotNull(info);
  assertEqual(info.depth, 16);
  assertEqual(info.layer, 15);
});

test('lookupRole(INVALID) returns null', () => {
  assertNull(lookupRole('INVALID'));
});

// --- getDepthFromRole ---
test('getDepthFromRole(STRATOP) is 4', () => {
  assertEqual(getDepthFromRole('STRATOP'), 4);
});

test('getDepthFromRole(TECHOPS) is 8', () => {
  assertEqual(getDepthFromRole('TECHOPS'), 8);
});

test('getDepthFromRole(CEO) is null', () => {
  assertNull(getDepthFromRole('CEO'));
});

// --- getLayerFromRole ---
test('getLayerFromRole(CEO) is 0', () => {
  assertEqual(getLayerFromRole('CEO'), 0);
});

test('getLayerFromRole(EXESUPP) is 3', () => {
  assertEqual(getLayerFromRole('EXESUPP'), 3);
});

// --- canDelegate ---
test('canDelegate(CEO, 1) is false (solo)', () => {
  assertEqual(canDelegate('CEO', 1), false);
});

test('canDelegate(CEO, 4) is true', () => {
  assertEqual(canDelegate('CEO', 4), true);
});

test('canDelegate(STRATOP) is true (layer 1 of 4)', () => {
  assertEqual(canDelegate('STRATOP'), true);
});

test('canDelegate(DELIVCO) is true (layer 2 of 4)', () => {
  assertEqual(canDelegate('DELIVCO'), true);
});

test('canDelegate(EXESUPP) is false (leaf)', () => {
  assertEqual(canDelegate('EXESUPP'), false);
});

test('canDelegate(ONESHOT) is false (leaf of 16)', () => {
  assertEqual(canDelegate('ONESHOT'), false);
});

// --- getRoleCodes ---
test('getRoleCodes(4) returns 4 codes', () => {
  const codes = getRoleCodes(4);
  assertEqual(codes.length, 4);
  assertArrayEqual(codes, ['CEO', 'STRATOP', 'DELIVCO', 'EXESUPP']);
});

test('getRoleCodes(0) returns empty array', () => {
  assertArrayEqual(getRoleCodes(0), []);
});

// --- isValidRole ---
test('isValidRole(CEO) is true', () => {
  assertEqual(isValidRole('CEO'), true);
});

test('isValidRole(DELIVCO) is true', () => {
  assertEqual(isValidRole('DELIVCO'), true);
});

test('isValidRole(INVALID) is false', () => {
  assertEqual(isValidRole('INVALID'), false);
});

test('isValidRole(ceo) is false (case sensitive)', () => {
  assertEqual(isValidRole('ceo'), false);
});

// --- getSubordinateRole ---
test('getSubordinateRole(CEO, 4) is STRATOP', () => {
  assertEqual(getSubordinateRole('CEO', 4), 'STRATOP');
});

test('getSubordinateRole(CEO, 1) is null (solo)', () => {
  assertNull(getSubordinateRole('CEO', 1));
});

test('getSubordinateRole(STRATOP) is DELIVCO', () => {
  assertEqual(getSubordinateRole('STRATOP'), 'DELIVCO');
});

test('getSubordinateRole(EXESUPP) is null (leaf)', () => {
  assertNull(getSubordinateRole('EXESUPP'));
});

// --- getParentRole ---
test('getParentRole(CEO) is null', () => {
  assertNull(getParentRole('CEO'));
});

test('getParentRole(STRATOP) is CEO', () => {
  assertEqual(getParentRole('STRATOP'), 'CEO');
});

test('getParentRole(DELIVCO) is STRATOP', () => {
  assertEqual(getParentRole('DELIVCO'), 'STRATOP');
});

test('getParentRole(EXESUPP) is DELIVCO', () => {
  assertEqual(getParentRole('EXESUPP'), 'DELIVCO');
});

// --- All depths have unique non-CEO roles ---
test('All non-CEO roles across depths are unique', () => {
  const allCodes = new Set<string>();
  for (let depth = 1; depth <= 16; depth++) {
    const codes = getRoleCodes(depth);
    for (const code of codes) {
      if (code !== 'CEO') {
        if (allCodes.has(code)) {
          throw new Error(`Duplicate role code: ${code}`);
        }
        allCodes.add(code);
      }
    }
  }
});

// =============================================================================
// SUMMARY
// =============================================================================

console.log('='.repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
