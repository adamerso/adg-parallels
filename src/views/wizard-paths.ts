/**
 * Wizard Path Utilities
 * 
 * Path normalization and conversion utilities.
 */

import { PathStandard } from './wizard-types';

// =============================================================================
// PATH CONVERSION
// =============================================================================

/**
 * Convert a Windows path to Cygwin format
 * 
 * @example
 * windowsToCygwin('C:\\Users\\test\\project')
 * // => '/cygdrive/c/Users/test/project'
 */
export function windowsToCygwin(windowsPath: string): string {
  if (!windowsPath) return '';
  
  // Already looks like Cygwin path
  if (windowsPath.startsWith('/')) {
    return windowsPath;
  }
  
  // Convert drive letter
  const driveMatch = windowsPath.match(/^([A-Za-z]):/);
  if (driveMatch) {
    const driveLetter = driveMatch[1].toLowerCase();
    const rest = windowsPath.substring(2).replace(/\\/g, '/');
    return `/cygdrive/${driveLetter}${rest}`;
  }
  
  // Relative path or UNC - just convert slashes
  return windowsPath.replace(/\\/g, '/');
}

/**
 * Convert a Cygwin path to Windows format
 * 
 * @example
 * cygwinToWindows('/cygdrive/c/Users/test/project')
 * // => 'C:\\Users\\test\\project'
 */
export function cygwinToWindows(cygwinPath: string): string {
  if (!cygwinPath) return '';
  
  // Already looks like Windows path
  if (/^[A-Za-z]:/.test(cygwinPath)) {
    return cygwinPath;
  }
  
  // Convert /cygdrive/x/ format
  const cygdriveMatch = cygwinPath.match(/^\/cygdrive\/([a-zA-Z])(\/|$)/);
  if (cygdriveMatch) {
    const driveLetter = cygdriveMatch[1].toUpperCase();
    const rest = cygwinPath.substring(cygdriveMatch[0].length - 1).replace(/\//g, '\\');
    return `${driveLetter}:${rest}`;
  }
  
  // /home, /usr, etc. - leave as is (can't convert without cygpath)
  if (cygwinPath.startsWith('/')) {
    return cygwinPath;
  }
  
  // Relative path - just convert slashes
  return cygwinPath.replace(/\//g, '\\');
}

/**
 * Normalize a path to the given standard
 */
export function normalizePath(path: string, standard: PathStandard): string {
  if (standard === 'cygwin') {
    return windowsToCygwin(path);
  } else {
    return cygwinToWindows(path);
  }
}

/**
 * Get both path formats
 */
export function getBothPathFormats(path: string): { windows: string; cygwin: string } {
  // Detect current format
  const isWindows = /^[A-Za-z]:/.test(path);
  
  if (isWindows) {
    return {
      windows: path,
      cygwin: windowsToCygwin(path),
    };
  } else {
    return {
      windows: cygwinToWindows(path),
      cygwin: path,
    };
  }
}

// =============================================================================
// CEO WORKSPACE PATHS
// =============================================================================

/**
 * Get CEO workspace folder name
 */
export function getCeoFolderName(): string {
  return '.adg-parallels_CEO_W0_S1_U00001';
}

/**
 * Build CEO workspace paths from workspace root
 */
export function buildCeoPaths(workspaceRoot: string): { windows: string; cygwin: string } {
  const ceoFolder = getCeoFolderName();
  
  // Normalize workspace root first
  const windowsRoot = cygwinToWindows(workspaceRoot);
  const cygwinRoot = windowsToCygwin(workspaceRoot);
  
  return {
    windows: `${windowsRoot}\\${ceoFolder}`,
    cygwin: `${cygwinRoot}/${ceoFolder}`,
  };
}

/**
 * Build default output path
 */
export function buildDefaultOutputPath(workspaceRoot: string, standard: PathStandard): string {
  const ceoFolder = getCeoFolderName();
  
  if (standard === 'cygwin') {
    const root = windowsToCygwin(workspaceRoot);
    return `${root}/${ceoFolder}/OUTPUT/`;
  } else {
    const root = cygwinToWindows(workspaceRoot);
    return `${root}\\${ceoFolder}\\OUTPUT\\`;
  }
}

// =============================================================================
// PATH VALIDATION
// =============================================================================

/**
 * Check if path looks valid (basic check)
 */
export function isValidPath(path: string): boolean {
  if (!path || path.trim() === '') {
    return false;
  }
  
  // Windows absolute path
  if (/^[A-Za-z]:/.test(path)) {
    return true;
  }
  
  // Cygwin absolute path
  if (path.startsWith('/')) {
    return true;
  }
  
  // Relative path
  if (path.startsWith('./') || path.startsWith('.\\')) {
    return true;
  }
  
  // Plain relative
  return true;
}

/**
 * Check if path is absolute
 */
export function isAbsolutePath(path: string): boolean {
  // Windows absolute
  if (/^[A-Za-z]:/.test(path)) {
    return true;
  }
  
  // Unix absolute
  if (path.startsWith('/')) {
    return true;
  }
  
  return false;
}

/**
 * Ensure path ends with separator
 */
export function ensureTrailingSeparator(path: string, standard: PathStandard): string {
  if (!path) return path;
  
  const sep = standard === 'cygwin' ? '/' : '\\';
  const otherSep = standard === 'cygwin' ? '\\' : '/';
  
  if (path.endsWith(sep) || path.endsWith(otherSep)) {
    return path;
  }
  
  return path + sep;
}

/**
 * Join paths with proper separator
 */
export function joinPaths(base: string, ...parts: string[]): string {
  // Detect base path type
  const isCygwin = base.startsWith('/') || base.includes('/cygdrive/');
  const sep = isCygwin ? '/' : '\\';
  
  let result = base;
  
  for (const part of parts) {
    // Remove leading/trailing separators from part
    const cleanPart = part.replace(/^[/\\]+|[/\\]+$/g, '');
    
    // Ensure base ends with separator
    if (!result.endsWith('/') && !result.endsWith('\\')) {
      result += sep;
    }
    
    result += cleanPart;
  }
  
  return result;
}
