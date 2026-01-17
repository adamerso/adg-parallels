/**
 * Folder Name Parser/Generator
 * 
 * Handles parsing and generation of ADG-Parallels worker folder names.
 * 
 * Format: .adg-parallels_{ROLE}_W{workers}_S{sibling}_U{uid}
 * 
 * Where:
 * - ROLE: The role code (e.g., CEO, STRATOP, DELIVCO, EXESUPP)
 * - W{workers}: Number of workers this instance manages (W0 for leaf nodes)
 * - S{sibling}: Sibling index (1-based, position among siblings)
 * - U{uid}: Unique identifier (5-digit, zero-padded)
 * 
 * Examples:
 * - .adg-parallels_CEO_W3_S1_U00001       (CEO managing 3 workers)
 * - .adg-parallels_STRATOP_W2_S1_U00002  (First STRATOP, managing 2 workers)
 * - .adg-parallels_DELIVCO_W0_S2_U00011  (Second DELIVCO, leaf worker)
 */

import { isValidRole, lookupRole, getDepthFromRole, getLayerFromRole, getHierarchy } from './role-resolver';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Parsed folder identity
 */
export interface FolderIdentity {
  /** The role code */
  role: string;
  
  /** Number of workers this instance manages (0 = leaf) */
  workers: number;
  
  /** Sibling index (1-based) */
  sibling: number;
  
  /** Unique identifier */
  uid: number;
  
  /** Formatted uid (5-digit zero-padded) */
  uidFormatted: string;
  
  /** Whether this is a CEO (root) node */
  isCEO: boolean;
  
  /** Whether this is a leaf node (workers=0) */
  isLeaf: boolean;
  
  /** Hierarchy depth (derived from role) - null if role is CEO */
  depth: number | null;
  
  /** Layer in hierarchy (0 = CEO) */
  layer: number;
}

/**
 * Parameters for generating a folder name
 */
export interface FolderNameParams {
  role: string;
  workers: number;
  sibling: number;
  uid: number;
}

/**
 * Result of folder name parsing
 */
export type ParseResult = 
  | { success: true; identity: FolderIdentity }
  | { success: false; error: string };

// =============================================================================
// CONSTANTS
// =============================================================================

/** Folder name prefix */
export const FOLDER_PREFIX = '.adg-parallels_';

/** Regex pattern for parsing folder names */
const FOLDER_PATTERN = /^\.adg-parallels_([A-Z]+)_W(\d+)_S(\d+)_U(\d{5})$/;

/** Minimum valid UID */
const MIN_UID = 1;

/** Maximum valid UID */
const MAX_UID = 99999;

/** Minimum valid sibling index */
const MIN_SIBLING = 1;

/** Maximum valid workers count */
const MAX_WORKERS = 16;

// =============================================================================
// PARSING
// =============================================================================

/**
 * Parse a folder name into its components.
 * 
 * @param folderName - The folder name to parse (can include path)
 * @returns ParseResult with success/failure and data
 * 
 * @example
 * parseFolderName('.adg-parallels_DELIVCO_W0_S2_U00011')
 * // => { success: true, identity: { role: 'DELIVCO', workers: 0, ... } }
 */
export function parseFolderName(folderName: string): ParseResult {
  // Extract just the folder name if a path is provided
  const baseName = extractFolderName(folderName);
  
  // Match against pattern
  const match = baseName.match(FOLDER_PATTERN);
  if (!match) {
    return { 
      success: false, 
      error: `Invalid folder name format: "${baseName}". Expected: ${FOLDER_PREFIX}{ROLE}_W{n}_S{n}_U{nnnnn}` 
    };
  }
  
  const [, role, workersStr, siblingStr, uidStr] = match;
  
  // Validate role
  if (!isValidRole(role)) {
    return { 
      success: false, 
      error: `Unknown role code: "${role}"` 
    };
  }
  
  const workers = parseInt(workersStr, 10);
  const sibling = parseInt(siblingStr, 10);
  const uid = parseInt(uidStr, 10);
  
  // Validate workers count
  if (workers < 0 || workers > MAX_WORKERS) {
    return { 
      success: false, 
      error: `Invalid workers count: ${workers}. Must be 0-${MAX_WORKERS}` 
    };
  }
  
  // Validate sibling index
  if (sibling < MIN_SIBLING) {
    return { 
      success: false, 
      error: `Invalid sibling index: ${sibling}. Must be >= ${MIN_SIBLING}` 
    };
  }
  
  // Validate UID
  if (uid < MIN_UID || uid > MAX_UID) {
    return { 
      success: false, 
      error: `Invalid UID: ${uid}. Must be ${MIN_UID}-${MAX_UID}` 
    };
  }
  
  // Build identity
  const isCEO = role === 'CEO';
  const depth = getDepthFromRole(role);
  const layer = getLayerFromRole(role) ?? 0;
  
  const identity: FolderIdentity = {
    role,
    workers,
    sibling,
    uid,
    uidFormatted: formatUid(uid),
    isCEO,
    isLeaf: workers === 0,
    depth,
    layer,
  };
  
  return { success: true, identity };
}

/**
 * Extract folder name from a path.
 * Handles both forward and back slashes.
 */
function extractFolderName(pathOrName: string): string {
  // Normalize slashes and get last segment
  const normalized = pathOrName.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(s => s.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : pathOrName;
}

/**
 * Check if a folder name is a valid ADG-Parallels worker folder.
 */
export function isAdgFolder(folderName: string): boolean {
  const result = parseFolderName(folderName);
  return result.success;
}

/**
 * Check if a path contains an ADG-Parallels worker folder.
 */
export function containsAdgFolder(path: string): boolean {
  const folderName = extractFolderName(path);
  return isAdgFolder(folderName);
}

// =============================================================================
// GENERATION
// =============================================================================

/**
 * Generate a folder name from parameters.
 * 
 * @param params - The folder name parameters
 * @returns The generated folder name or null if parameters are invalid
 * 
 * @example
 * generateFolderName({ role: 'DELIVCO', workers: 0, sibling: 2, uid: 11 })
 * // => '.adg-parallels_DELIVCO_W0_S2_U00011'
 */
export function generateFolderName(params: FolderNameParams): string | null {
  const { role, workers, sibling, uid } = params;
  
  // Validate role
  if (!isValidRole(role)) {
    return null;
  }
  
  // Validate workers
  if (workers < 0 || workers > MAX_WORKERS || !Number.isInteger(workers)) {
    return null;
  }
  
  // Validate sibling
  if (sibling < MIN_SIBLING || !Number.isInteger(sibling)) {
    return null;
  }
  
  // Validate uid
  if (uid < MIN_UID || uid > MAX_UID || !Number.isInteger(uid)) {
    return null;
  }
  
  return `${FOLDER_PREFIX}${role}_W${workers}_S${sibling}_U${formatUid(uid)}`;
}

/**
 * Generate a CEO folder name.
 * 
 * @param workers - Number of workers CEO manages
 * @param uid - Unique identifier
 */
export function generateCeoFolderName(workers: number, uid: number): string | null {
  return generateFolderName({
    role: 'CEO',
    workers,
    sibling: 1, // CEO is always sibling 1
    uid,
  });
}

/**
 * Generate a child folder name based on parent identity.
 * 
 * @param parentIdentity - The parent's folder identity
 * @param childRole - The child's role code
 * @param siblingIndex - The child's sibling index (1-based)
 * @param childWorkers - Number of workers the child manages
 * @param childUid - The child's unique identifier
 */
export function generateChildFolderName(
  parentIdentity: FolderIdentity,
  childRole: string,
  siblingIndex: number,
  childWorkers: number,
  childUid: number
): string | null {
  // Validate child role is valid
  if (!isValidRole(childRole)) {
    return null;
  }
  
  // Validate child role is one layer deeper than parent
  const parentInfo = lookupRole(parentIdentity.role);
  const childInfo = lookupRole(childRole);
  
  // For CEO parent, we need to infer depth from child
  if (parentIdentity.isCEO) {
    if (childInfo && childInfo.layer !== 1) {
      // Child of CEO must be at layer 1
      return null;
    }
  } else if (parentInfo && childInfo) {
    if (childInfo.layer !== parentInfo.layer + 1) {
      return null; // Child must be exactly one layer deeper
    }
  }
  
  return generateFolderName({
    role: childRole,
    workers: childWorkers,
    sibling: siblingIndex,
    uid: childUid,
  });
}

// =============================================================================
// UID MANAGEMENT
// =============================================================================

/** Counter for generating unique IDs within a session */
let uidCounter = 0;

/**
 * Format a UID as 5-digit zero-padded string.
 */
export function formatUid(uid: number): string {
  return uid.toString().padStart(5, '0');
}

/**
 * Generate a unique ID for a new worker.
 * IDs are assigned sequentially within a session.
 * 
 * @returns A new unique ID
 */
export function generateUid(): number {
  uidCounter++;
  if (uidCounter > MAX_UID) {
    throw new Error('UID limit exceeded. Maximum 99999 workers per session.');
  }
  return uidCounter;
}

/**
 * Reset the UID counter. Used at the start of a new project.
 */
export function resetUidCounter(): void {
  uidCounter = 0;
}

/**
 * Get the current UID counter value (for persistence).
 */
export function getUidCounter(): number {
  return uidCounter;
}

/**
 * Set the UID counter (for restoration from persistence).
 */
export function setUidCounter(value: number): void {
  if (value < 0 || value > MAX_UID) {
    throw new Error(`Invalid UID counter value: ${value}`);
  }
  uidCounter = value;
}

// =============================================================================
// HIERARCHY NAVIGATION
// =============================================================================

/**
 * Build a full folder path for a worker within a project.
 * 
 * @param projectRoot - The root directory of the project
 * @param ancestorFolderNames - Array of ancestor folder names (from CEO down, excluding this worker)
 * @param folderName - This worker's folder name
 * @returns The full path
 * 
 * @example
 * buildWorkerPath('/project', ['.adg-parallels_CEO_W3_S1_U00001'], '.adg-parallels_STRATOP_W2_S1_U00002')
 * // => '/project/.adg-parallels_CEO_W3_S1_U00001/.adg-parallels_STRATOP_W2_S1_U00002'
 */
export function buildWorkerPath(
  projectRoot: string,
  ancestorFolderNames: string[],
  folderName: string
): string {
  const parts = [projectRoot, ...ancestorFolderNames, folderName];
  // Normalize to forward slashes and join
  return parts.map(p => p.replace(/\\/g, '/')).join('/');
}

/**
 * Extract the hierarchy of folder identities from a path.
 * 
 * @param path - A path containing ADG worker folders
 * @returns Array of folder identities from root to leaf
 */
export function extractHierarchy(path: string): FolderIdentity[] {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(s => s.length > 0);
  
  const identities: FolderIdentity[] = [];
  
  for (const segment of segments) {
    if (segment.startsWith(FOLDER_PREFIX)) {
      const result = parseFolderName(segment);
      if (result.success) {
        identities.push(result.identity);
      }
    }
  }
  
  return identities;
}

/**
 * Find the innermost (deepest) ADG folder identity from a path.
 */
export function findDeepestIdentity(path: string): FolderIdentity | null {
  const hierarchy = extractHierarchy(path);
  return hierarchy.length > 0 ? hierarchy[hierarchy.length - 1] : null;
}

/**
 * Find the CEO identity from a path.
 */
export function findCeoIdentity(path: string): FolderIdentity | null {
  const hierarchy = extractHierarchy(path);
  return hierarchy.length > 0 && hierarchy[0].isCEO ? hierarchy[0] : null;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate a folder name generation request.
 * Returns an array of error messages (empty if valid).
 */
export function validateFolderParams(params: FolderNameParams): string[] {
  const errors: string[] = [];
  
  if (!isValidRole(params.role)) {
    errors.push(`Invalid role: "${params.role}"`);
  }
  
  if (params.workers < 0) {
    errors.push('Workers count cannot be negative');
  } else if (params.workers > MAX_WORKERS) {
    errors.push(`Workers count cannot exceed ${MAX_WORKERS}`);
  } else if (!Number.isInteger(params.workers)) {
    errors.push('Workers count must be an integer');
  }
  
  if (params.sibling < MIN_SIBLING) {
    errors.push(`Sibling index must be >= ${MIN_SIBLING}`);
  } else if (!Number.isInteger(params.sibling)) {
    errors.push('Sibling index must be an integer');
  }
  
  if (params.uid < MIN_UID) {
    errors.push(`UID must be >= ${MIN_UID}`);
  } else if (params.uid > MAX_UID) {
    errors.push(`UID must be <= ${MAX_UID}`);
  } else if (!Number.isInteger(params.uid)) {
    errors.push('UID must be an integer');
  }
  
  return errors;
}

/**
 * Check if a role can have the specified number of workers.
 * Leaf roles should have workers=0.
 */
export function validateWorkerCount(role: string, workers: number, hierarchyDepth: number): string[] {
  const errors: string[] = [];
  
  const roleInfo = lookupRole(role);
  if (!roleInfo && role !== 'CEO') {
    errors.push(`Cannot validate worker count for unknown role: ${role}`);
    return errors;
  }
  
  // For CEO, we need the hierarchy depth to determine if it's a leaf
  if (role === 'CEO') {
    if (hierarchyDepth === 1) {
      // Solo CEO mode - must be leaf
      if (workers !== 0) {
        errors.push('Solo CEO (depth=1) must have workers=0');
      }
    } else {
      // CEO with subordinates
      if (workers === 0) {
        errors.push('CEO with subordinates must have workers > 0');
      }
    }
  } else if (roleInfo) {
    const hierarchy = getHierarchy(roleInfo.depth);
    if (hierarchy) {
      const isLeafLayer = roleInfo.layer === hierarchy.roles.length - 1;
      if (isLeafLayer && workers !== 0) {
        errors.push(`Leaf role ${role} must have workers=0`);
      } else if (!isLeafLayer && workers === 0) {
        errors.push(`Non-leaf role ${role} must have workers > 0`);
      }
    }
  }
  
  return errors;
}
