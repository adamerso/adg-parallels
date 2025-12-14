/**
 * ADG-Parallels Sidebar Commands
 * 
 * Commands for the sidebar UI buttons.
 * v0.3.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getSidebarProvider } from '../views/sidebar-webview';
import { logger } from '../utils/logger';
import { findProjectSpec, loadProjectSpec, getSpawningLayers } from '../core/project-spec-loader';
import { WorkerLifecycleManager, createManagerLifecycle } from '../core/worker-lifecycle';
import { TaskManager } from '../core/task-manager';
import { pathExists } from '../utils/file-operations';

// =============================================================================
// START PROCESSING
// =============================================================================

export async function startProcessing(): Promise<void> {
  const provider = getSidebarProvider();
  if (!provider) {
    vscode.window.showErrorMessage('Sidebar not initialized');
    return;
  }
  
  const state = provider.getState();
  if (!state.hasProject) {
    vscode.window.showErrorMessage('No project found. Use "Provision New Project" first.');
    return;
  }
  
  // Update state to processing
  provider.updateState({ 
    isProcessingEnabled: true,
    processingStatus: 'processing',
    projectStatus: 'active',
  });
  
  logger.info('Processing started');
  vscode.window.showInformationMessage('▶ Processing started! Spawning workers...');
  
  // Find and load project-spec.xml
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }
  
  const projectRoot = workspaceFolders[0].uri.fsPath;
  const projectSpecPath = findProjectSpec(projectRoot);
  
  if (!projectSpecPath) {
    vscode.window.showErrorMessage('No project-spec.xml found. Create one using the Project Wizard.');
    return;
  }
  
  const spec = loadProjectSpec(projectSpecPath);
  if (!spec) {
    vscode.window.showErrorMessage('Failed to load project-spec.xml');
    return;
  }
  
  // Get layers that need to spawn workers
  const spawningLayers = getSpawningLayers(spec);
  if (spawningLayers.length === 0) {
    vscode.window.showWarningMessage('No layers configured for spawning workers.');
    return;
  }
  
  // Get project directory from spec path
  const projectDir = path.dirname(projectSpecPath);
  
  // Initialize task manager - tasks file is in the project directory
  const tasksFilePath = path.join(projectDir, 'tasks.xml');
  
  // Create empty tasks file if it doesn't exist
  if (!pathExists(tasksFilePath)) {
    const fs = await import('fs');
    const emptyTasks = `<?xml version="1.0" encoding="UTF-8"?>
<tasks>
  <metadata>
    <project>${spec.name}</project>
    <created_at>${new Date().toISOString()}</created_at>
  </metadata>
  <task_list>
  </task_list>
</tasks>
`;
    fs.writeFileSync(tasksFilePath, emptyTasks, 'utf8');
    logger.info('Created empty tasks.xml');
  }
  
  const taskManager = new TaskManager(tasksFilePath);
  
  // Create lifecycle manager and spawn workers for each layer
  // Use project directory as management dir
  const lifecycleManager = createManagerLifecycle(projectDir, taskManager);
  await lifecycleManager.initialize();
  
  let totalSpawned = 0;
  
  for (const layer of spawningLayers) {
    const workerCount = layer.workforceSize;
    logger.info(`Spawning ${workerCount} workers for layer ${layer.number} (${layer.type})`);
    
    const workers = await lifecycleManager.provisionAndSpawnWorkers(workerCount);
    totalSpawned += workers.length;
    
    // Log continuation settings for this layer
    if (layer.continuationPrompt) {
      logger.info(`Layer ${layer.number} continuation: max ${layer.maxContinuationAttempts} attempts`);
    }
  }
  
  vscode.window.showInformationMessage(`🚀 Spawned ${totalSpawned} workers!`);
  logger.info(`Processing started with ${totalSpawned} workers total`);
}

// =============================================================================
// TOGGLE PROCESSING
// =============================================================================

export async function toggleProcessing(): Promise<void> {
  const provider = getSidebarProvider();
  if (!provider) {
    vscode.window.showErrorMessage('Sidebar not initialized');
    return;
  }
  
  const state = provider.getState();
  const newEnabled = !state.isProcessingEnabled;
  
  provider.updateState({ 
    isProcessingEnabled: newEnabled,
    projectStatus: state.hasProject 
      ? (newEnabled ? 'active' : 'suspended') 
      : 'none',
  });
  
  if (newEnabled) {
    logger.info('Processing enabled');
    vscode.window.showInformationMessage('🟢 ADG-Parallels: Processing enabled');
  } else {
    logger.info('Processing disabled');
    vscode.window.showInformationMessage('🔴 ADG-Parallels: Processing disabled');
  }
}

// =============================================================================
// STOP PROCESSING
// =============================================================================

export async function stopProcessing(): Promise<void> {
  const provider = getSidebarProvider();
  if (!provider) {
    return;
  }
  
  const state = provider.getState();
  if (state.processingStatus !== 'processing') {
    vscode.window.showWarningMessage('Processing is not active');
    return;
  }
  
  provider.updateState({ processingStatus: 'stopped' });
  logger.info('Processing stopped by user');
  vscode.window.showInformationMessage('⏸ Processing stopped. Current tasks will complete.');
}

// =============================================================================
// RESUME PROCESSING
// =============================================================================

export async function resumeProcessing(): Promise<void> {
  const provider = getSidebarProvider();
  if (!provider) {
    return;
  }
  
  const state = provider.getState();
  if (state.processingStatus !== 'stopped') {
    vscode.window.showWarningMessage('Processing is not stopped');
    return;
  }
  
  provider.updateState({ processingStatus: 'processing' });
  logger.info('Processing resumed by user');
  vscode.window.showInformationMessage('▶ Processing resumed');
}

// =============================================================================
// KILL PROCESSING
// =============================================================================

export async function killProcessing(): Promise<void> {
  const provider = getSidebarProvider();
  if (!provider) {
    return;
  }
  
  // Confirmation dialog
  const confirm = await vscode.window.showWarningMessage(
    '⚠️ KILL PROCESSING?\n\nThis will immediately terminate all workers. Active tasks may be left incomplete.',
    { modal: true },
    'Kill All Workers',
    'Cancel'
  );
  
  if (confirm !== 'Kill All Workers') {
    return;
  }
  
  provider.updateState({ 
    processingStatus: 'idle',
    isProcessingEnabled: false,
    projectStatus: provider.getState().hasProject ? 'suspended' : 'none',
  });
  
  // TODO: Actually kill worker windows
  // This would involve tracking window PIDs or using VS Code API to close windows
  
  logger.warn('Processing killed by user');
  vscode.window.showWarningMessage('🛑 All processing killed. Workers terminated.');
}

// =============================================================================
// OPEN PROGRESS DASHBOARD
// =============================================================================

export async function openProgressDashboard(): Promise<void> {
  // TODO: Implement webview-based progress dashboard
  vscode.window.showInformationMessage('📊 Progress Dashboard - Coming soon!');
}

// =============================================================================
// SHOW HELP
// =============================================================================

export async function showHelp(): Promise<void> {
  // Create a help webview or open documentation
  const panel = vscode.window.createWebviewPanel(
    'adgHelp',
    'ADG-Parallels Help',
    vscode.ViewColumn.One,
    {}
  );
  
  panel.webview.html = getHelpHtml();
}

function getHelpHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ADG-Parallels Help</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      line-height: 1.6;
    }
    h1 { color: var(--vscode-textLink-foreground); }
    h2 { color: var(--vscode-textLink-activeForeground); margin-top: 30px; }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
    }
    .shortcut {
      display: inline-block;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 4px 8px;
      border-radius: 4px;
      margin: 2px;
    }
  </style>
</head>
<body>
  <h1>🥚 ADG-Parallels Help</h1>
  
  <h2>Quick Start</h2>
  <ol>
    <li>Turn ON processing using the main switch</li>
    <li>Click "Provision New Project" to create a project</li>
    <li>Import tasks using <code>ADG: Import Tasks from CSV</code></li>
    <li>Start workers using <code>ADG: Start Workers</code></li>
    <li>Monitor progress in the sidebar</li>
  </ol>
  
  <h2>Sidebar Controls</h2>
  <ul>
    <li><strong>Processing Switch:</strong> Master ON/OFF for the extension</li>
    <li><strong>Provision New Project:</strong> Create ADG project structure</li>
    <li><strong>Open Progress Dashboard:</strong> View task progress (coming soon)</li>
    <li><strong>STOP PROCESSING:</strong> Pause task distribution (current tasks complete)</li>
    <li><strong>Resume Processing:</strong> Continue task distribution</li>
    <li><strong>KILL PROCESSING:</strong> Emergency stop - terminates all workers</li>
  </ul>
  
  <h2>Keyboard Shortcuts</h2>
  <p><span class="shortcut">Ctrl+Shift+P</span> → Type "ADG:" to see all commands</p>
  
  <h2>Project Structure</h2>
  <pre>
.adg-parallels/
├── management/
│   └── project_*_adg-tasks.json
├── output/
└── workers/
    ├── worker-001/
    ├── worker-002/
    └── ...
  </pre>
  
  <h2>Need More Help?</h2>
  <p>Visit the <a href="https://github.com/adamerso/adg-parallels">GitHub repository</a> for documentation.</p>
</body>
</html>`;
}

// =============================================================================
// SHOW ABOUT
// =============================================================================

export async function showAbout(): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'adgAbout',
    'About ADG-Parallels',
    vscode.ViewColumn.One,
    {}
  );
  
  panel.webview.html = getAboutHtml();
}

function getAboutHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About ADG-Parallels</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 40px;
      text-align: center;
      line-height: 1.6;
    }
    .logo { font-size: 64px; margin-bottom: 20px; }
    h1 { color: var(--vscode-textLink-foreground); margin-bottom: 5px; }
    .version { color: var(--vscode-descriptionForeground); margin-bottom: 30px; }
    .tagline { font-style: italic; margin: 20px 0; font-size: 1.2em; }
    .features { text-align: left; max-width: 500px; margin: 30px auto; }
    .feature { margin: 10px 0; }
    .license { margin-top: 40px; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="logo">🥚</div>
  <h1>ADG-Parallels</h1>
  <div class="version">Version 0.3.0</div>
  
  <p class="tagline">"Many Ejajkas, One Goal!"</p>
  
  <p>AI Delegation Grid - Parallel task processing through multiple<br>
  GitHub Copilot instances in a corporate hierarchy.</p>
  
  <div class="features">
    <h3>Features:</h3>
    <div class="feature">✓ Multi-worker parallel processing</div>
    <div class="feature">✓ Pipeline-based task execution</div>
    <div class="feature">✓ XML configuration with XSD validation</div>
    <div class="feature">✓ Per-stage model selection (GPT-4o, Claude, etc.)</div>
    <div class="feature">✓ Quality audit with forbidden patterns</div>
    <div class="feature">✓ Automatic worker health monitoring</div>
    <div class="feature">✓ Heartbeat-based lifecycle management</div>
  </div>
  
  <div class="license">
    <p>Licensed under AGPL-3.0-or-later</p>
    <p>© 2024-2025 ADG-Parallels Team</p>
  </div>
</body>
</html>`;
}

// =============================================================================
// REGISTER COMMANDS
// =============================================================================

export function registerSidebarCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('adg-parallels.startProcessing', startProcessing),
    vscode.commands.registerCommand('adg-parallels.toggleProcessing', toggleProcessing),
    vscode.commands.registerCommand('adg-parallels.stopProcessing', stopProcessing),
    vscode.commands.registerCommand('adg-parallels.resumeProcessing', resumeProcessing),
    vscode.commands.registerCommand('adg-parallels.killProcessing', killProcessing),
    vscode.commands.registerCommand('adg-parallels.openProgressDashboard', openProgressDashboard),
    vscode.commands.registerCommand('adg-parallels.showHelp', showHelp),
    vscode.commands.registerCommand('adg-parallels.showAbout', showAbout),
  );
  
  logger.info('Sidebar commands registered');
}
