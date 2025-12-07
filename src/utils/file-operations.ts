/**
 * ADG-Parallels File Operations
 * 
 * Utility functions for file system operations with error handling.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

/**
 * Check if a path exists
 */
export function pathExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory
 */
export function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a file
 */
export function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Create directory recursively (like mkdir -p)
 */
export function ensureDir(dirPath: string): boolean {
  try {
    if (!pathExists(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.debug(`Created directory: ${dirPath}`);
    }
    return true;
  } catch (error) {
    logger.error(`Failed to create directory: ${dirPath}`, error);
    return false;
  }
}

/**
 * Read file as string
 */
export function readFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    logger.error(`Failed to read file: ${filePath}`, error);
    return null;
  }
}

/**
 * Read and parse JSON file
 */
export function readJson<T>(filePath: string): T | null {
  const content = readFile(filePath);
  if (content === null) {
    return null;
  }
  
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    logger.error(`Failed to parse JSON: ${filePath}`, error);
    return null;
  }
}

/**
 * Write string to file
 */
export function writeFile(filePath: string, content: string): boolean {
  try {
    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    ensureDir(dir);
    
    fs.writeFileSync(filePath, content, 'utf-8');
    logger.debug(`Written file: ${filePath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to write file: ${filePath}`, error);
    return false;
  }
}

/**
 * Write JSON to file (pretty printed)
 */
export function writeJson(filePath: string, data: unknown): boolean {
  try {
    const content = JSON.stringify(data, null, 2);
    return writeFile(filePath, content);
  } catch (error) {
    logger.error(`Failed to serialize JSON: ${filePath}`, error);
    return false;
  }
}

/**
 * Delete file
 */
export function deleteFile(filePath: string): boolean {
  try {
    if (pathExists(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug(`Deleted file: ${filePath}`);
    }
    return true;
  } catch (error) {
    logger.error(`Failed to delete file: ${filePath}`, error);
    return false;
  }
}

/**
 * Copy file
 */
export function copyFile(src: string, dest: string): boolean {
  try {
    const dir = path.dirname(dest);
    ensureDir(dir);
    
    fs.copyFileSync(src, dest);
    logger.debug(`Copied file: ${src} -> ${dest}`);
    return true;
  } catch (error) {
    logger.error(`Failed to copy file: ${src} -> ${dest}`, error);
    return false;
  }
}

/**
 * List files in directory
 */
export function listDir(dirPath: string): string[] {
  try {
    if (!isDirectory(dirPath)) {
      return [];
    }
    return fs.readdirSync(dirPath);
  } catch (error) {
    logger.error(`Failed to list directory: ${dirPath}`, error);
    return [];
  }
}

/**
 * Find files matching pattern in directory
 */
export function findFiles(dirPath: string, pattern: RegExp): string[] {
  const files = listDir(dirPath);
  return files.filter(f => pattern.test(f)).map(f => path.join(dirPath, f));
}

// =============================================================================
// FILE LOCKING (for atomic JSON updates)
// =============================================================================

const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_INTERVAL_MS = 100;

/**
 * Acquire a file lock
 */
export async function acquireLock(filePath: string): Promise<boolean> {
  const lockPath = `${filePath}.lock`;
  const startTime = Date.now();
  
  while (Date.now() - startTime < LOCK_TIMEOUT_MS) {
    try {
      // Try to create lock file exclusively
      fs.writeFileSync(lockPath, process.pid.toString(), { flag: 'wx' });
      logger.debug(`Acquired lock: ${lockPath}`);
      return true;
    } catch (error: unknown) {
      // Lock exists, check if stale
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const lockAge = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (lockAge > LOCK_TIMEOUT_MS) {
          // Stale lock, remove it
          logger.warn(`Removing stale lock: ${lockPath}`);
          deleteFile(lockPath);
          continue;
        }
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
      } else {
        logger.error(`Lock acquisition error: ${lockPath}`, error);
        return false;
      }
    }
  }
  
  logger.error(`Lock timeout: ${lockPath}`);
  return false;
}

/**
 * Release a file lock
 */
export function releaseLock(filePath: string): boolean {
  const lockPath = `${filePath}.lock`;
  return deleteFile(lockPath);
}

/**
 * Execute function with file lock
 */
export async function withLock<T>(
  filePath: string, 
  fn: () => T | Promise<T>
): Promise<T | null> {
  if (!await acquireLock(filePath)) {
    logger.error(`Could not acquire lock for: ${filePath}`);
    return null;
  }
  
  try {
    return await fn();
  } finally {
    releaseLock(filePath);
  }
}
