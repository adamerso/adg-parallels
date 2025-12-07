/**
 * ADG-Parallels Extension Entry Point
 * 
 * Main activation and deactivation handlers for the VS Code extension.
 * Manages role detection, status bar, and command registration.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from './utils/logger';
import { readJson } from './utils/file-operations';
import { detectRole, isAdgProject, getRoleDisplayInfo, canDelegate, isWorker } from './core/role-detector';
import { TaskManager, findTasksFile } from './core/task-manager';
import { 
  WorkerLifecycleManager, 
  createManagerLifecycle, 
  createWorkerLifecycle 
} from './core/worker-lifecycle';
import { registerCommands } from './commands';
import { WorkerConfig } from './types';

// =============================================================================
// GLOBAL STATE
// =============================================================================

let statusBarItem: vscode.StatusBarItem | undefined;
let lifecycleManager: WorkerLifecycleManager | undefined;

// =============================================================================
// ACTIVATION
// =============================================================================

/**
 * Extension activation entry point4
 */
export function activate(context: vscode.ExtensionContext): void {
  // Initialize logger
  logger.init(context);
  logger.info('ADG-Parallels extension activating...');

  // Register commands
  registerCommands(context);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  context.subscriptions.push(statusBarItem);

  // Initialize role-based functionality
  initializeRoleBasedFeatures(context);

  // Watch for workspace changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      initializeRoleBasedFeatures(context);
    })
  );

  // Watch for file changes in .adg-parallels directory
  const watcher = vscode.workspace.createFileSystemWatcher('**/.adg-parallels/**');
  context.subscriptions.push(
    watcher.onDidCreate(() => updateStatusBar()),
    watcher.onDidChange(() => updateStatusBar()),
    watcher.onDidDelete(() => updateStatusBar()),
    watcher
  );

  logger.info('ADG-Parallels extension activated successfully');
}

/**
 * Initialize features based on detected role
 */
async function initializeRoleBasedFeatures(context: vscode.ExtensionContext): Promise<void> {
  const roleInfo = detectRole();

  if (!roleInfo) {
    // No workspace - hide status bar
    if (statusBarItem) {
      statusBarItem.hide();
    }
    return;
  }

  // Update status bar
  updateStatusBar();

  // Dispose existing lifecycle manager
  if (lifecycleManager) {
    lifecycleManager.dispose();
    lifecycleManager = undefined;
  }

  // Initialize role-specific features
  if (roleInfo.paths.managementDir) {
    const tasksFile = findTasksFile(roleInfo.paths.managementDir);
    if (tasksFile) {
      const taskManager = new TaskManager(tasksFile);

      if (roleInfo.role === 'manager' || roleInfo.role === 'teamlead') {
        // Manager: start health monitoring
        lifecycleManager = createManagerLifecycle(roleInfo.paths.managementDir, taskManager);
        await lifecycleManager.initialize();
        logger.info('Manager lifecycle initialized');
      }
    }
  }

  if (roleInfo.role === 'worker' && roleInfo.workerId) {
    // Worker gets tasks file path from worker.json config
    const workerConfigPath = path.join(roleInfo.paths.workspaceRoot, 'worker.json');
    const workerConfig = readJson<WorkerConfig>(workerConfigPath);
    
    if (workerConfig && workerConfig.paths.tasksFile) {
      const taskManager = new TaskManager(workerConfig.paths.tasksFile);
      
      // For worker lifecycle, we need the management dir (parent of tasks file)
      const managementDir = path.dirname(workerConfig.paths.tasksFile);
      
      lifecycleManager = createWorkerLifecycle(
        managementDir,
        taskManager,
        roleInfo.workerId
      );
      await lifecycleManager.initialize();
      logger.info('Worker lifecycle initialized');

      // Auto-start task execution for workers!
      // Small delay to let UI fully load
      const config = vscode.workspace.getConfiguration('adg-parallels');
      const autoStart = config.get('workerAutoStart', true);
      const autoStartDelay = config.get('workerAutoStartDelay', 2000);
      
      if (autoStart) {
        setTimeout(async () => {
          logger.info('🥚 Worker auto-starting task execution...');
          
          // Try to open Copilot Chat panel first (in case it's collapsed)
          try {
            await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
            // Small delay after opening chat
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (e) {
            logger.warn('Could not open Copilot panel, continuing anyway...', e);
          }
          
          vscode.window.showInformationMessage('🥚 Ejajka-Worker reporting for duty! Starting task execution...');
          
          // Execute the task command with 'all' mode - no prompts, just work!
          await vscode.commands.executeCommand('adg-parallels.executeTask', 'all');
        }, autoStartDelay as number);
      }
    } else {
      logger.warn('Worker config not found or missing tasks file path', { 
        configPath: workerConfigPath 
      });
    }
  }
}

/**
 * Update the status bar item
 */
function updateStatusBar(): void {
  if (!statusBarItem) {
    return;
  }

  const roleInfo = detectRole();

  if (!roleInfo) {
    statusBarItem.hide();
    return;
  }

  const displayInfo = getRoleDisplayInfo(roleInfo.role);

  // Build status text
  let text = `${displayInfo.icon} ${displayInfo.label}`;

  // Add task count if manager
  if (roleInfo.paths.managementDir) {
    const tasksFile = findTasksFile(roleInfo.paths.managementDir);
    if (tasksFile) {
      // We could add async task count here
      text += ' (ADG)';
    }
  }

  statusBarItem.text = text;
  statusBarItem.tooltip = `ADG-Parallels: ${displayInfo.label}\nClick for status`;
  statusBarItem.command = 'adg-parallels.showStatus';
  statusBarItem.backgroundColor = undefined;
  statusBarItem.show();
}

// =============================================================================
// DEACTIVATION
// =============================================================================

/**
 * Extension deactivation handler
 */
export function deactivate(): void {
  logger.info('ADG-Parallels extension deactivating...');

  // Dispose lifecycle manager
  if (lifecycleManager) {
    lifecycleManager.dispose();
    lifecycleManager = undefined;
  }

  // Status bar is automatically disposed via context.subscriptions

  logger.info('ADG-Parallels extension deactivated');
}
