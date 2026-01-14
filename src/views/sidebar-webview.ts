/**
 * ADG-Parallels Sidebar Webview Provider
 * 
 * Provides a fully styled, responsive sidebar panel using Webview.
 * Supports large buttons, dynamic sizing, and modern UI.
 * 
 * v0.3.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { pathExists } from '../utils/file-operations';

// =============================================================================
// TYPES
// =============================================================================

export type ProcessingStatus = 'idle' | 'processing' | 'stopped' | 'finished';
export type ProjectStatus = 'none' | 'active' | 'suspended';
export type RoleType = 'none' | 'manager' | 'teamleader' | 'worker';

export interface SidebarState {
  totalTasksProcessed: number;
  isProcessingEnabled: boolean;
  projectStatus: ProjectStatus;
  hasProject: boolean;
  processingStatus: ProcessingStatus;
  currentTaskId?: number;
  totalTasks?: number;
  currentRole: RoleType;
}

// =============================================================================
// WEBVIEW PROVIDER
// =============================================================================

export class ADGSidebarWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'adg-parallels.mainView';
  
  private _view?: vscode.WebviewView;
  private _context: vscode.ExtensionContext;
  
  private state: SidebarState = {
    totalTasksProcessed: 0,
    isProcessingEnabled: false,
    projectStatus: 'none',
    hasProject: false,
    processingStatus: 'idle',
    currentRole: 'none',
  };

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
    this.loadState();
  }

  // ===========================================================================
  // WEBVIEW LIFECYCLE
  // ===========================================================================

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._context.extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'toggleProcessing':
          await vscode.commands.executeCommand('adg-parallels.toggleProcessing');
          break;
        case 'provisionProject':
          await vscode.commands.executeCommand('adg-parallels.showProjectWizard');
          break;
        case 'openDashboard':
          await vscode.commands.executeCommand('adg-parallels.openProgressDashboard');
          break;
        case 'startProcessing':
          await vscode.commands.executeCommand('adg-parallels.startProcessing');
          break;
        case 'stopProcessing':
          await vscode.commands.executeCommand('adg-parallels.stopProcessing');
          break;
        case 'resumeProcessing':
          await vscode.commands.executeCommand('adg-parallels.resumeProcessing');
          break;
        case 'killProcessing':
          await vscode.commands.executeCommand('adg-parallels.killProcessing');
          break;
        case 'showHelp':
          await vscode.commands.executeCommand('adg-parallels.showHelp');
          break;
        case 'showAbout':
          await vscode.commands.executeCommand('adg-parallels.showAbout');
          break;
      }
    });

    // Update when view becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.refresh();
      }
    });
  }

  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================

  private loadState(): void {
    const saved = this._context.globalState.get<Partial<SidebarState>>('adg.sidebarState');
    if (saved) {
      this.state = { ...this.state, ...saved };
    }
    this.detectProject();
  }

  private async saveState(): Promise<void> {
    await this._context.globalState.update('adg.sidebarState', {
      totalTasksProcessed: this.state.totalTasksProcessed,
      isProcessingEnabled: this.state.isProcessingEnabled,
    });
  }

  public detectProject(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.state.hasProject = false;
      this.state.projectStatus = 'none';
      this.state.currentRole = 'none';
      return;
    }

    const mainFolder = workspaceFolders[0].uri.fsPath;
    const adgDir = path.join(mainFolder, '.adg-parallels');
    const workerConfig = path.join(mainFolder, 'worker.xml');

    if (pathExists(adgDir)) {
      this.state.hasProject = true;
      this.state.projectStatus = this.state.isProcessingEnabled ? 'active' : 'suspended';
      this.state.currentRole = 'manager';
    } else if (pathExists(workerConfig)) {
      this.state.hasProject = true;
      this.state.projectStatus = this.state.isProcessingEnabled ? 'active' : 'suspended';
      this.state.currentRole = 'worker';
    } else {
      this.state.hasProject = false;
      this.state.projectStatus = 'none';
      this.state.currentRole = 'none';
    }
  }

  public updateState(updates: Partial<SidebarState>): void {
    this.state = { ...this.state, ...updates };
    this.saveState();
    this.refresh();
  }

  public getState(): SidebarState {
    return { ...this.state };
  }

  public incrementTasksProcessed(count: number = 1): void {
    this.state.totalTasksProcessed += count;
    this.saveState();
    this.refresh();
  }

  public refresh(): void {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }
  }

  // ===========================================================================
  // HTML GENERATION
  // ===========================================================================

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>ADG-Parallels</title>
  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      
      window.send = function(command) {
        console.log('ADG Button clicked:', command);
        vscode.postMessage({ command: command });
      };
      
      // Also add event delegation for buttons
      document.addEventListener('DOMContentLoaded', function() {
        document.body.addEventListener('click', function(e) {
          const btn = e.target.closest('button[data-cmd]');
          if (btn) {
            const cmd = btn.getAttribute('data-cmd');
            console.log('ADG Button (data-cmd):', cmd);
            vscode.postMessage({ command: cmd });
          }
        });
      });
    })();
  </script>
  <style>
    :root {
      --btn-height: clamp(36px, 8vh, 56px);
      --btn-font: clamp(11px, 2.5vw, 14px);
      --gap: clamp(6px, 1.5vh, 12px);
      --padding: clamp(8px, 2vw, 16px);
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: var(--padding);
      min-height: 100vh;
    }
    
    .container {
      display: flex;
      flex-direction: column;
      gap: var(--gap);
      height: 100%;
    }
    
    /* Header */
    .header {
      text-align: center;
      padding: var(--gap) 0;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    
    .header h1 {
      font-size: clamp(14px, 3.5vw, 20px);
      font-weight: 600;
      color: var(--vscode-textLink-foreground);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    
    .header .version {
      font-size: clamp(10px, 2vw, 12px);
      color: var(--vscode-descriptionForeground);
    }
    
    /* Stats */
    .stats {
      background: var(--vscode-editor-background);
      border-radius: 6px;
      padding: clamp(8px, 2vh, 16px);
      text-align: center;
    }
    
    .stats-number {
      font-size: clamp(20px, 5vw, 32px);
      font-weight: bold;
      color: var(--vscode-charts-green);
    }
    
    .stats-label {
      font-size: clamp(10px, 2vw, 12px);
      color: var(--vscode-descriptionForeground);
    }
    
    /* Buttons */
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: var(--btn-height);
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      font-size: var(--btn-font);
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    
    .btn:active:not(:disabled) {
      transform: translateY(0);
    }
    
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .btn-icon {
      font-size: clamp(14px, 3vw, 20px);
    }
    
    /* Button variants */
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    
    .btn-primary:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }
    
    .btn-success {
      background: #238636;
      color: white;
    }
    
    .btn-success:hover:not(:disabled) {
      background: #2ea043;
    }
    
    .btn-danger {
      background: #da3633;
      color: white;
    }
    
    .btn-danger:hover:not(:disabled) {
      background: #f85149;
    }
    
    .btn-warning {
      background: #9e6a03;
      color: white;
    }
    
    .btn-warning:hover:not(:disabled) {
      background: #bb8009;
    }
    
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    
    .btn-secondary:hover:not(:disabled) {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    
    .btn-ghost {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-panel-border);
    }
    
    .btn-ghost:hover:not(:disabled) {
      background: var(--vscode-list-hoverBackground);
    }
    
    /* Switch button */
    .btn-switch {
      min-height: clamp(48px, 10vh, 72px);
      font-size: clamp(14px, 3vw, 18px);
      font-weight: 700;
    }
    
    .btn-switch.on {
      background: linear-gradient(135deg, #238636 0%, #2ea043 100%);
      box-shadow: 0 0 20px rgba(35, 134, 54, 0.4);
    }
    
    .btn-switch.off {
      background: linear-gradient(135deg, #6e7681 0%, #484f58 100%);
    }
    
    /* Work status button - like switch but for task state */
    .btn-work-status {
      min-height: clamp(44px, 9vh, 64px);
      font-size: clamp(13px, 2.8vw, 16px);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .btn-work-status.no-task {
      background: linear-gradient(135deg, #6e7681 0%, #484f58 100%);
      cursor: not-allowed;
    }
    
    .btn-work-status.ready {
      background: linear-gradient(135deg, #9e6a03 0%, #bb8009 100%);
      box-shadow: 0 0 15px rgba(187, 128, 9, 0.3);
      animation: pulse-ready 2s ease-in-out infinite;
    }
    
    .btn-work-status.working {
      background: linear-gradient(135deg, #238636 0%, #2ea043 100%);
      box-shadow: 0 0 20px rgba(35, 134, 54, 0.4);
      animation: pulse-working 1.5s ease-in-out infinite;
    }
    
    @keyframes pulse-ready {
      0%, 100% { box-shadow: 0 0 15px rgba(187, 128, 9, 0.3); }
      50% { box-shadow: 0 0 25px rgba(187, 128, 9, 0.5); }
    }
    
    @keyframes pulse-working {
      0%, 100% { box-shadow: 0 0 20px rgba(35, 134, 54, 0.4); }
      50% { box-shadow: 0 0 30px rgba(35, 134, 54, 0.6); }
    }
    
    /* Divider */
    .divider {
      height: 1px;
      background: var(--vscode-panel-border);
      margin: var(--gap) 0;
    }
    
    /* Status display */
    .status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--vscode-editor-background);
      border-radius: 6px;
      font-size: clamp(11px, 2.5vw, 13px);
    }
    
    .status-label {
      color: var(--vscode-descriptionForeground);
    }
    
    .status-value {
      font-weight: 600;
    }
    
    .status-value.processing {
      color: var(--vscode-charts-blue);
    }
    
    .status-value.stopped {
      color: var(--vscode-charts-orange);
    }
    
    .status-value.finished {
      color: var(--vscode-charts-green);
    }
    
    /* Role badge */
    .role-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: clamp(10px, 2vw, 12px);
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .role-badge.manager {
      background: rgba(56, 139, 253, 0.2);
      color: #58a6ff;
    }
    
    .role-badge.worker {
      background: rgba(163, 113, 247, 0.2);
      color: #a371f7;
    }
    
    .role-badge.none {
      background: rgba(110, 118, 129, 0.2);
      color: #8b949e;
    }
    
    /* Button group */
    .btn-group {
      display: flex;
      gap: var(--gap);
    }
    
    .btn-group .btn {
      flex: 1;
    }
    
    /* Footer buttons */
    .footer {
      margin-top: auto;
      display: flex;
      gap: var(--gap);
    }
    
    .footer .btn {
      flex: 1;
      min-height: clamp(32px, 6vh, 44px);
    }
    
    /* Pulse animation for processing */
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    
    .processing-indicator {
      animation: pulse 1.5s ease-in-out infinite;
    }
    
    /* Hidden class */
    .hidden {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>
        <span>🥚</span>
        <span>ADG-Parallels</span>
      </h1>
      <div class="version">v0.4.2</div>
    </div>
    
    <!-- Stats -->
    <div class="stats">
      <div class="stats-number">${this.state.totalTasksProcessed}</div>
      <div class="stats-label">tasks processed</div>
    </div>
    
    <!-- Main Switch -->
    <button 
      class="btn btn-switch ${this.state.isProcessingEnabled ? 'on' : 'off'}" 
      data-cmd="toggleProcessing"
    >
      <span class="btn-icon">${this.state.isProcessingEnabled ? '✓' : '○'}</span>
      <span>Processing ${this.state.isProcessingEnabled ? 'ON' : 'OFF'}</span>
    </button>
    
    <div class="divider"></div>
    
    <!-- Project Button -->
    ${this._renderProjectButton()}
    
    <!-- Dashboard Button -->
    <button 
      class="btn btn-primary ${!this.state.hasProject ? 'hidden' : ''}" 
      data-cmd="openDashboard"
    >
      <span class="btn-icon">📊</span>
      <span>Open Progress Dashboard</span>
    </button>
    
    <!-- Status Row -->
    ${this.state.hasProject ? this._renderStatusRow() : ''}
    
    <!-- Role -->
    <div class="status-row">
      <span class="status-label">Current Role</span>
      <span class="role-badge ${this.state.currentRole}">
        ${this._getRoleIcon(this.state.currentRole)} ${this.state.currentRole}
      </span>
    </div>
    
    <div class="divider"></div>
    
    <!-- Control Buttons -->
    ${this._renderControlButtons()}
    
    <div class="divider"></div>
    
    <!-- Footer -->
    <div class="footer">
      <button class="btn btn-ghost" data-cmd="showHelp">
        <span>❓</span>
        <span>Help</span>
      </button>
      <button class="btn btn-ghost" data-cmd="showAbout">
        <span>ℹ️</span>
        <span>About</span>
      </button>
    </div>
  </div>
</body>
</html>`;
  }

  private _renderProjectButton(): string {
    if (!this.state.hasProject) {
      // No project - always show provision button
      return `
        <button class="btn btn-success" data-cmd="provisionProject">
          <span class="btn-icon">📁</span>
          <span>Provision New Project</span>
        </button>
      `;
    } else {
      // Has project - show status
      const status = this.state.projectStatus === 'active' ? 'Project Active ✓' : 'Project Suspended ⏸';
      return `
        <button class="btn btn-secondary" disabled>
          <span class="btn-icon">📁</span>
          <span>${status}</span>
        </button>
      `;
    }
  }

  private _renderStatusRow(): string {
    let statusText: string;
    let statusClass: string;
    let icon: string;

    switch (this.state.processingStatus) {
      case 'processing':
        const taskInfo = this.state.currentTaskId 
          ? `${this.state.currentTaskId}/${this.state.totalTasks ?? '?'}`
          : '...';
        statusText = `Processing ${taskInfo}`;
        statusClass = 'processing processing-indicator';
        icon = '⚡';
        break;
      case 'stopped':
        statusText = 'Awaiting Resume';
        statusClass = 'stopped';
        icon = '⏸';
        break;
      case 'finished':
        statusText = 'Finished';
        statusClass = 'finished';
        icon = '✓';
        break;
      default:
        statusText = 'Idle';
        statusClass = '';
        icon = '○';
    }

    return `
      <div class="status-row">
        <span class="status-label">Processing Status</span>
        <span class="status-value ${statusClass}">${icon} ${statusText}</span>
      </div>
    `;
  }

  private _renderControlButtons(): string {
    const buttons: string[] = [];

    // Main work status button - always visible, changes style based on state
    buttons.push(this._renderWorkStatusButton());

    // Stop button - only when processing
    if (this.state.processingStatus === 'processing') {
      buttons.push(`
        <button class="btn btn-warning" data-cmd="stopProcessing">
          <span class="btn-icon">⏸</span>
          <span>Pause</span>
        </button>
      `);
    }

    // Resume button - only when stopped
    if (this.state.processingStatus === 'stopped') {
      buttons.push(`
        <button class="btn btn-success" data-cmd="resumeProcessing">
          <span class="btn-icon">▶</span>
          <span>Resume</span>
        </button>
      `);
    }

    // Kill button - when processing or stopped
    if (this.state.hasProject && (this.state.processingStatus === 'processing' || this.state.processingStatus === 'stopped')) {
      buttons.push(`
        <button class="btn btn-danger" data-cmd="killProcessing">
          <span class="btn-icon">🛑</span>
          <span>KILL</span>
        </button>
      `);
    }

    return buttons.join('');
  }

  private _renderWorkStatusButton(): string {
    // Determine state and styling
    let statusClass: string;
    let icon: string;
    let label: string;
    let isClickable: boolean;
    let cmd: string;

    if (!this.state.hasProject) {
      // No project = grey, disabled
      statusClass = 'no-task';
      icon = '○';
      label = 'No Task to Run';
      isClickable = false;
      cmd = '';
    } else if (this.state.processingStatus === 'processing') {
      // Working = green, pulsing
      statusClass = 'working';
      icon = '⚡';
      label = 'Work in Progress';
      isClickable = false;
      cmd = '';
    } else if (this.state.processingStatus === 'stopped') {
      // Paused = yellow
      statusClass = 'ready';
      icon = '⏸';
      label = 'Paused';
      isClickable = false;
      cmd = '';
    } else {
      // Idle with project = yellow, ready to start
      statusClass = 'ready';
      icon = '▶';
      label = 'Ready to Start';
      isClickable = true;
      cmd = 'startProcessing';
    }

    return `
      <button 
        class="btn btn-work-status ${statusClass}" 
        ${isClickable ? `data-cmd="${cmd}"` : 'disabled'}
      >
        <span class="btn-icon">${icon}</span>
        <span>${label}</span>
      </button>
    `;
  }

  private _getRoleIcon(role: RoleType): string {
    switch (role) {
      case 'manager': return '👔';
      case 'teamleader': return '👥';
      case 'worker': return '🥚';
      default: return '○';
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// =============================================================================
// FACTORY
// =============================================================================

let sidebarProvider: ADGSidebarWebviewProvider | undefined;

export function createSidebarProvider(context: vscode.ExtensionContext): ADGSidebarWebviewProvider {
  sidebarProvider = new ADGSidebarWebviewProvider(context);
  return sidebarProvider;
}

export function getSidebarProvider(): ADGSidebarWebviewProvider | undefined {
  return sidebarProvider;
}
