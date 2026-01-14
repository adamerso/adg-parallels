/**
 * ADG-Parallels Role Detector
 * 
 * Detects the role of the current VS Code window based on directory structure:
 * - CEO: No .adg-parallels/ or neither management/ nor worker/ subdirs
 * - Manager: Has .adg-parallels/management/ but NOT worker/
 * - Worker: Has .adg-parallels/worker/ but NOT management/
 * - Team Leader: Has BOTH management/ AND worker/
 */

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { XMLParser } from 'fast-xml-parser';
import { Role, RoleInfo, RolePaths, WorkerConfig, HierarchyConfig } from '../types';
import { pathExists, isDirectory } from '../utils/file-operations';
import { logger } from '../utils/logger';

// Constants
const ADG_DIR = '.adg-parallels';
const MANAGEMENT_DIR = 'management';
const WORKER_DIR = 'worker';
const WORKER_CONFIG_FILE = 'worker.xml';
const HIERARCHY_CONFIG_FILE = 'hierarchy-config.xml';

/**
 * Get the workspace root folder
 */
export function getWorkspaceRoot(): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    logger.warn('No workspace folder open');
    return null;
  }
  return workspaceFolders[0].uri.fsPath;
}

/**
 * Detect the role of the current workspace
 */
export function detectRole(): RoleInfo | null {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return null;
  }

  const adgRoot = path.join(workspaceRoot, ADG_DIR);
  const managementDir = path.join(adgRoot, MANAGEMENT_DIR);
  const workerDir = path.join(adgRoot, WORKER_DIR);

  const hasManagement = isDirectory(managementDir);
  const hasWorker = isDirectory(workerDir);

  // Determine role
  let role: Role;
  if (hasManagement && hasWorker) {
    role = 'teamlead';
  } else if (hasManagement) {
    role = 'manager';
  } else if (hasWorker) {
    role = 'worker';
  } else {
    role = 'ceo';
  }

  // Build paths
  const paths: RolePaths = {
    workspaceRoot,
    adgRoot,
    managementDir: hasManagement ? managementDir : undefined,
    workerDir: hasWorker ? workerDir : undefined,
    jobsDir: hasManagement ? path.join(adgRoot, 'jobs') : undefined,
    adaptersDir: hasManagement ? path.join(adgRoot, 'adapters') : undefined,
  };

  // Get worker ID if applicable
  let workerId: string | undefined;
  let depth = 0;

  if (hasWorker) {
    // Worker config is in workspace root, not in .adg-parallels/worker/
    const workerConfig = getWorkerConfig(workspaceRoot);
    if (workerConfig) {
      workerId = workerConfig.workerId;
    }
  }

  if (hasManagement) {
    const hierarchyConfig = getHierarchyConfig(managementDir);
    if (hierarchyConfig) {
      depth = hierarchyConfig.currentDepth;
    }
  }

  const roleInfo: RoleInfo = {
    role,
    hasManagement,
    hasWorker,
    workerId,
    depth,
    paths,
  };

  logger.info(`Role detected: ${role}`, { 
    hasManagement, 
    hasWorker, 
    workerId, 
    depth 
  });

  return roleInfo;
}

/**
 * Get worker configuration from XML
 */
export function getWorkerConfig(workerDir: string): WorkerConfig | null {
  const configPath = path.join(workerDir, WORKER_CONFIG_FILE);
  
  if (!pathExists(configPath)) {
    return null;
  }
  
  try {
    const xmlContent = fs.readFileSync(configPath, 'utf8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const parsed = parser.parse(xmlContent);
    const worker = parsed.worker || parsed;
    
    return {
      workerId: worker.worker_id || '',
      role: worker.role || 'worker',
      parentRole: worker.parent_role || 'manager',
      paths: {
        tasksFile: worker.paths?.tasks_file || '',
        attachments: worker.paths?.attachments || '',
        outputDir: worker.paths?.output_dir || '',
        workerRoot: worker.paths?.worker_root || '',
      },
      taskFilter: {
        status: worker.task_filter?.status || 'pending',
      },
      createdAt: worker.created_at || new Date().toISOString(),
      instructionsVersion: worker.instructions_version || '1.0',
    };
  } catch (e) {
    logger.error('Failed to parse worker.xml', { configPath, error: e });
    return null;
  }
}

/**
 * Get hierarchy configuration from XML
 */
export function getHierarchyConfig(managementDir: string): HierarchyConfig | null {
  const configPath = path.join(managementDir, HIERARCHY_CONFIG_FILE);
  
  if (!pathExists(configPath)) {
    return null;
  }
  
  try {
    const xmlContent = fs.readFileSync(configPath, 'utf8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const parsed = parser.parse(xmlContent);
    const config = parsed.hierarchy_config || parsed;
    
    return {
      maxDepth: parseInt(config.max_depth, 10) || 3,
      currentDepth: parseInt(config.current_depth, 10) || 0,
      levelConfig: Array.isArray(config.levels?.level) 
        ? config.levels.level.map((l: any) => ({
            level: parseInt(l['@_level'], 10) || 0,
            role: l.role || 'worker',
            canDelegate: l.can_delegate === 'true',
            maxSubordinates: parseInt(l.max_subordinates, 10) || 0,
            subordinateRole: l.subordinate_role || null,
          }))
        : [],
      emergencyBrake: {
        maxTotalInstances: parseInt(config.emergency_brake?.max_total_instances, 10) || 100,
      },
    } as HierarchyConfig;
  } catch (e) {
    logger.error('Failed to parse hierarchy-config.xml', { configPath, error: e });
    return null;
  }
}

/**
 * Check if current workspace is an ADG-Parallels project
 */
export function isAdgProject(): boolean {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return false;
  }
  
  const adgRoot = path.join(workspaceRoot, ADG_DIR);
  return isDirectory(adgRoot);
}

/**
 * Check if current workspace is a worker
 */
export function isWorker(): boolean {
  const roleInfo = detectRole();
  return roleInfo?.role === 'worker' || roleInfo?.role === 'teamlead';
}

/**
 * Check if current workspace is a manager (can delegate)
 */
export function isManager(): boolean {
  const roleInfo = detectRole();
  return roleInfo?.role === 'manager' || roleInfo?.role === 'teamlead';
}

/**
 * Check if current workspace can delegate tasks
 */
export function canDelegate(): boolean {
  const roleInfo = detectRole();
  if (!roleInfo) {
    return false;
  }

  // CEO can always delegate (even without hierarchy config)
  if (roleInfo.role === 'ceo') {
    return true;
  }

  // Manager/TeamLead need management directory
  if (!roleInfo.paths.managementDir) {
    return false;
  }

  const hierarchyConfig = getHierarchyConfig(roleInfo.paths.managementDir);
  if (!hierarchyConfig) {
    // No config = Manager can still delegate (default behavior)
    return roleInfo.role === 'manager' || roleInfo.role === 'teamlead';
  }

  // Check depth limit
  if (hierarchyConfig.currentDepth >= hierarchyConfig.maxDepth) {
    logger.warn('Cannot delegate: max depth reached', {
      current: hierarchyConfig.currentDepth,
      max: hierarchyConfig.maxDepth
    });
    return false;
  }

  // Find level config for current depth
  const levelConfig = hierarchyConfig.levelConfig.find(
    l => l.level === hierarchyConfig.currentDepth
  );

  return levelConfig?.canDelegate ?? false;
}

/**
 * Get role display info for status bar
 */
export function getRoleDisplayInfo(role: Role): { icon: string; label: string; color: string } {
  switch (role) {
    case 'ceo':
      return { icon: '🧑', label: 'CEO', color: '#FFD700' };      // Gold
    case 'manager':
      return { icon: '👔', label: 'Manager', color: '#4169E1' };  // Royal Blue
    case 'teamlead':
      return { icon: '👨‍💼', label: 'Team Lead', color: '#32CD32' }; // Lime Green
    case 'worker':
      return { icon: '👷', label: 'Worker', color: '#FF8C00' };   // Dark Orange
  }
}
