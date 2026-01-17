/**
 * ADG-Parallels Extension Entry Point
 * 
 * Main activation and deactivation handlers for the VS Code extension.
 * Manages role detection, status bar, sidebar UI, and command registration.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './utils/logger';
import { pathExists } from './utils/file-operations';
import { detectRole, isAdgProject, getRoleDisplayInfo, canDelegate, isWorker } from './core/role-detector';
import { TaskManager, findTasksFile } from './core/task-manager';
import { 
  WorkerLifecycleManager, 
  createManagerLifecycle, 
  createWorkerLifecycle 
} from './core/worker-lifecycle';
import { registerCommands } from './commands';
import { registerSidebarCommands } from './commands/sidebar-commands';
import { createSidebarProvider, getSidebarProvider } from './views/sidebar-webview';
import { showProjectSpecWizard } from './views/project-spec-wizard';
import { registerMcpTools, unregisterMcpTools, isMcpAvailable } from './mcp/mcp-server';
import { registerChatParticipant, unregisterChatParticipant, isChatParticipantAvailable } from './mcp/chat-participant';
import { WorkerConfig } from './types';
import { XMLParser } from 'fast-xml-parser';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extended worker config for MCP-based workers
 */
interface McpWorkerConfig {
  workerId: string;
  role: string;
  layer: number;
  parentRole?: string;
  parentUid?: string;
  ceoFolder?: string;
  workerRoot?: string;
  outputDir?: string;
  useMcpTools: boolean;
  claimFromLayer?: number;
  createdAt: string;
  instructionsVersion: string;
}

/**
 * Load worker config from XML file - supports both legacy and MCP format
 */
async function loadWorkerConfigXml(filePath: string): Promise<WorkerConfig | null> {
  if (!pathExists(filePath)) {
    return null;
  }
  
  try {
    const xmlContent = fs.readFileSync(filePath, 'utf8');
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
    logger.error('Failed to load worker config XML', { filePath, error: e });
    return null;
  }
}

/**
 * Load MCP worker config from XML file
 */
function loadMcpWorkerConfig(filePath: string): McpWorkerConfig | null {
  if (!pathExists(filePath)) {
    return null;
  }
  
  try {
    const xmlContent = fs.readFileSync(filePath, 'utf8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const parsed = parser.parse(xmlContent);
    const worker = parsed.worker || parsed;
    
    // Check if this is MCP format
    const useMcpTools = worker.mcp_config?.use_mcp_tools === 'true' || 
                        worker.mcp_config?.use_mcp_tools === true;
    
    return {
      workerId: worker.worker_id || '',
      role: worker.role || 'worker',
      layer: parseInt(worker.layer, 10) || 1,
      parentRole: worker.parent_role,
      parentUid: worker.parent_uid,
      ceoFolder: worker.paths?.ceo_folder,
      workerRoot: worker.paths?.worker_root,
      outputDir: worker.paths?.output_dir,
      useMcpTools,
      claimFromLayer: worker.mcp_config?.claim_from_layer 
        ? parseInt(worker.mcp_config.claim_from_layer, 10) 
        : undefined,
      createdAt: worker.created_at || new Date().toISOString(),
      instructionsVersion: worker.instructions_version || '1.0',
    };
  } catch (e) {
    logger.error('Failed to load MCP worker config', { filePath, error: e });
    return null;
  }
}

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
  
  // Register sidebar commands
  registerSidebarCommands(context);
  
  // Register MCP tools for AI assistant integration
  if (isMcpAvailable()) {
    registerMcpTools(context);
    logger.info('MCP tools registered - AI assistants can now use ADG-Parallels!');
  } else {
    logger.info('MCP not available (VS Code < 1.99 or Language Model API disabled)');
  }
  
  // Register @adg chat participant for Copilot Chat
  if (isChatParticipantAvailable()) {
    registerChatParticipant(context);
    logger.info('@adg chat participant registered - use @adg in Copilot Chat!');
  } else {
    logger.info('Chat Participant API not available');
  }
  
  // Register project wizard command (new ProjectSpec wizard)
  context.subscriptions.push(
    vscode.commands.registerCommand('adg-parallels.showProjectWizard', () => {
      showProjectSpecWizard(context);
    })
  );
  
  // Create and register sidebar webview provider
  const sidebarProvider = createSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('adg-parallels.mainView', sidebarProvider)
  );
  logger.info('Sidebar webview registered');

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

  logger.info('🔍 Role detection result', { 
    role: roleInfo?.role, 
    hasWorker: roleInfo?.hasWorker,
    hasManagement: roleInfo?.hasManagement,
    workspaceRoot: roleInfo?.paths.workspaceRoot
  });

  if (!roleInfo) {
    // No workspace - hide status bar
    if (statusBarItem) {
      statusBarItem.hide();
    }
    return;
  }

  // Update status bar
  updateStatusBar();
  
  // Update sidebar with detected role
  const sidebar = getSidebarProvider();
  if (sidebar) {
    sidebar.detectProject();
    
    // Map role to sidebar role type
    let sidebarRole: 'none' | 'manager' | 'teamleader' | 'worker' = 'none';
    if (roleInfo.role === 'manager') sidebarRole = 'manager';
    else if (roleInfo.role === 'teamlead') sidebarRole = 'teamleader';
    else if (roleInfo.role === 'worker') sidebarRole = 'worker';
    
    sidebar.updateState({ currentRole: sidebarRole });
  }

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

  if (roleInfo.role === 'worker') {
    logger.info('🥚 Worker mode detected, initializing...');
    
    // SAFETY CHECK: Verify this is a proper worker folder (name starts with .adg-parallels_)
    // This prevents accidental auto-start in random folders with worker.xml
    const folderName = path.basename(roleInfo.paths.workspaceRoot);
    const isProperWorkerFolder = folderName.startsWith('.adg-parallels_') && !folderName.includes('_CEO_');
    
    if (!isProperWorkerFolder) {
      logger.info('🛑 Folder is not a proper worker folder, skipping auto-start', { folderName });
      // This might be a CEO or manager folder - don't auto-start
      return;
    }
    
    // Worker gets config from worker.xml
    const workerConfigPath = path.join(roleInfo.paths.workspaceRoot, 'worker.xml');
    logger.info('🥚 Looking for worker config', { workerConfigPath });
    
    // Try MCP format first
    const mcpConfig = loadMcpWorkerConfig(workerConfigPath);
    
    if (mcpConfig && mcpConfig.useMcpTools) {
      // =========================================================================
      // MCP-BASED WORKER (NEW FORMAT)
      // =========================================================================
      logger.info('🥚 MCP worker detected!', { 
        workerId: mcpConfig.workerId,
        ceoFolder: mcpConfig.ceoFolder,
        layer: mcpConfig.layer
      });
      
      vscode.window.showInformationMessage(
        `🥚 Ejajka ${mcpConfig.workerId} reporting for duty! (MCP mode)`
      );
      
      // Auto-start MCP task execution
      const config = vscode.workspace.getConfiguration('adg-parallels');
      const autoStart = config.get('workerAutoStart', true);
      const autoStartDelay = config.get('workerAutoStartDelay', 5000) as number;
      
      if (autoStart) {
        setTimeout(async () => {
          logger.info('🥚 MCP Worker auto-starting...');
          
          // Open Copilot Chat
          const chatCommands = [
            'workbench.action.chat.open',
            'github.copilot.chat.focus',
            'workbench.panel.chat.view.copilot.focus',
          ];
          
          for (const cmd of chatCommands) {
            try {
              await vscode.commands.executeCommand(cmd);
              logger.info(`Opened chat with command: ${cmd}`);
              break;
            } catch (e) {
              logger.debug(`Command ${cmd} not available`);
            }
          }
          
          // Wait for chat to open
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Send initial message to Copilot to start working
          // The .github/copilot-instructions.md should guide it
          try {
            // Type the start command into chat
            await vscode.commands.executeCommand('workbench.action.chat.open', {
              query: `I am worker ${mcpConfig.workerId}. Read my instructions from .github/copilot-instructions.md and start claiming and executing tasks using the MCP tools.`
            });
            logger.info('🥚 Sent start message to Copilot');
          } catch (e) {
            logger.error('Failed to send message to Copilot', e);
            // Fallback: show message to user
            vscode.window.showInformationMessage(
              `🥚 Worker ${mcpConfig.workerId} ready! Tell Copilot to read .github/copilot-instructions.md and start working.`
            );
          }
        }, autoStartDelay);
      }
      
      return; // MCP workers don't use the old lifecycle
    }
    
    // =========================================================================
    // LEGACY WORKER (OLD FORMAT WITH tasks.xml)
    // =========================================================================
    const workerConfig = await loadWorkerConfigXml(workerConfigPath);
    
    if (!workerConfig) {
      logger.error('❌ Worker config not found or invalid', { configPath: workerConfigPath });
      vscode.window.showErrorMessage(
        `🥚 Worker error: worker.xml not found at ${workerConfigPath}`
      );
      return;
    }
    
    logger.info('🥚 Loaded legacy worker config', { 
      workerId: workerConfig.workerId,
      tasksFile: workerConfig.paths.tasksFile 
    });
    
    // Get worker ID from config, or from roleInfo, or generate from folder name
    const workerId = workerConfig.workerId || roleInfo.workerId || 
      path.basename(roleInfo.paths.workspaceRoot);
    
    if (!workerConfig.paths.tasksFile) {
      logger.error('❌ Worker config missing tasksFile path', { config: workerConfig });
      vscode.window.showErrorMessage('🥚 Worker error: worker.xml missing tasks_file path');
      return;
    }
    
    // Verify tasks file actually exists before proceeding
    if (!pathExists(workerConfig.paths.tasksFile)) {
      logger.error('❌ Worker tasks file does not exist', { 
        tasksFile: workerConfig.paths.tasksFile 
      });
      vscode.window.showErrorMessage(
        `🥚 Worker error: Tasks file not found at ${workerConfig.paths.tasksFile}`
      );
      return;
    }

    const taskManager = new TaskManager(workerConfig.paths.tasksFile);
    
    // For worker lifecycle, we need the management dir (parent of tasks file)
    const managementDir = path.dirname(workerConfig.paths.tasksFile);
    
    lifecycleManager = createWorkerLifecycle(
      managementDir,
      taskManager,
      workerId
    );
    await lifecycleManager.initialize();
    logger.info('Worker lifecycle initialized', { workerId });

    // Auto-start task execution for workers!
    // Small delay to let UI fully load
    const config = vscode.workspace.getConfiguration('adg-parallels');
    const autoStart = config.get('workerAutoStart', true);
    const autoStartDelay = config.get('workerAutoStartDelay', 2000);
    
    if (autoStart) {
      setTimeout(async () => {
        logger.info('🥚 Worker auto-starting task execution...');
        
        // Try to open Copilot Chat panel first (in case it's collapsed)
        // Try multiple commands as the name varies between versions
        const chatCommands = [
          'workbench.action.chat.open',           // VS Code 1.99+ 
          'github.copilot.chat.focus',            // Copilot Chat extension
          'workbench.panel.chat.view.copilot.focus', // Older versions
        ];
        
        for (const cmd of chatCommands) {
          try {
            await vscode.commands.executeCommand(cmd);
            logger.info(`Opened chat with command: ${cmd}`);
            break;
          } catch (e) {
            logger.debug(`Command ${cmd} not available`);
          }
        }
        
        // Wait for chat to fully open
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        vscode.window.showInformationMessage('🥚 Ejajka-Worker reporting for duty! Starting task execution...');
        
        // Execute the task command with 'all' mode - no prompts, just work!
        await vscode.commands.executeCommand('adg-parallels.executeTask', 'all');
      }, autoStartDelay as number);
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

  // Unregister MCP tools
  unregisterMcpTools();
  
  // Unregister chat participant
  unregisterChatParticipant();

  // Status bar is automatically disposed via context.subscriptions

  logger.info('ADG-Parallels extension deactivated');
}
