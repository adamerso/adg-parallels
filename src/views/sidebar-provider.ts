/**
 * ADG-Parallels Sidebar View Provider
 * 
 * Provides the main sidebar panel in the Activity Bar with:
 * - Processing switch (ON/OFF)
 * - Project status and provisioning
 * - Progress dashboard access
 * - Processing controls (stop/resume/kill)
 * - Help and About buttons
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
  // Global stats
  totalTasksProcessed: number;
  
  // Main switch
  isProcessingEnabled: boolean;
  
  // Project state
  projectStatus: ProjectStatus;
  hasProject: boolean;
  
  // Processing state
  processingStatus: ProcessingStatus;
  currentTaskId?: number;
  totalTasks?: number;
  
  // Role
  currentRole: RoleType;
}

// =============================================================================
// TREE ITEMS
// =============================================================================

type TreeItemType = 
  | 'header'
  | 'stats'
  | 'switch'
  | 'project-button'
  | 'dashboard-button'
  | 'status'
  | 'role'
  | 'control-button'
  | 'spacer'
  | 'help-button'
  | 'about-button';

class SidebarItem extends vscode.TreeItem {
  constructor(
    public readonly itemType: TreeItemType,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly commandId?: string,
    public readonly isEnabled: boolean = true
  ) {
    super(label, collapsibleState);
    
    // Set context value for when clauses
    this.contextValue = itemType;
    
    // Style based on enabled state
    if (!isEnabled) {
      this.description = '(disabled)';
    }
  }
}

// =============================================================================
// VIEW PROVIDER
// =============================================================================

export class ADGSidebarProvider implements vscode.TreeDataProvider<SidebarItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SidebarItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private state: SidebarState = {
    totalTasksProcessed: 0,
    isProcessingEnabled: false,
    projectStatus: 'none',
    hasProject: false,
    processingStatus: 'idle',
    currentRole: 'none',
  };
  
  private context: vscode.ExtensionContext;
  
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadState();
  }
  
  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================
  
  private loadState(): void {
    const saved = this.context.globalState.get<Partial<SidebarState>>('adg.sidebarState');
    if (saved) {
      this.state = { ...this.state, ...saved };
    }
    
    // Detect project in current workspace
    this.detectProject();
  }
  
  private async saveState(): Promise<void> {
    await this.context.globalState.update('adg.sidebarState', {
      totalTasksProcessed: this.state.totalTasksProcessed,
      isProcessingEnabled: this.state.isProcessingEnabled,
    });
  }
  
  /**
   * Detect if there's an ADG project in the workspace
   */
  detectProject(): void {
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
  
  /**
   * Update state and refresh view
   */
  updateState(updates: Partial<SidebarState>): void {
    this.state = { ...this.state, ...updates };
    this.saveState();
    this.refresh();
  }
  
  /**
   * Get current state
   */
  getState(): SidebarState {
    return { ...this.state };
  }
  
  /**
   * Increment total tasks processed
   */
  incrementTasksProcessed(count: number = 1): void {
    this.state.totalTasksProcessed += count;
    this.saveState();
    this.refresh();
  }
  
  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
  
  // ===========================================================================
  // TREE DATA PROVIDER
  // ===========================================================================
  
  getTreeItem(element: SidebarItem): vscode.TreeItem {
    return element;
  }
  
  getChildren(element?: SidebarItem): Thenable<SidebarItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    
    return Promise.resolve(this.buildTreeItems());
  }
  
  private buildTreeItems(): SidebarItem[] {
    const items: SidebarItem[] = [];
    
    // === HEADER ===
    const header = new SidebarItem('header', 'ADG-Parallels');
    header.iconPath = new vscode.ThemeIcon('symbol-namespace');
    header.description = 'v0.4.2';
    items.push(header);
    
    // === STATS ===
    const stats = new SidebarItem(
      'stats',
      `Tasks processed: ${this.state.totalTasksProcessed}`
    );
    stats.iconPath = new vscode.ThemeIcon('graph');
    stats.tooltip = 'Total tasks successfully processed since installation';
    items.push(stats);
    
    // === SPACER ===
    items.push(this.createSpacer());
    
    // === MAIN SWITCH ===
    const switchItem = this.createSwitchItem();
    items.push(switchItem);
    
    // === SPACER ===
    items.push(this.createSpacer());
    
    // === PROJECT BUTTON ===
    const projectItem = this.createProjectButton();
    items.push(projectItem);
    
    // === DASHBOARD BUTTON (only if project exists) ===
    if (this.state.hasProject) {
      const dashboardItem = new SidebarItem(
        'dashboard-button',
        'Open Progress Dashboard',
        vscode.TreeItemCollapsibleState.None,
        'adg-parallels.openProgressDashboard',
        this.state.isProcessingEnabled
      );
      dashboardItem.iconPath = new vscode.ThemeIcon('dashboard');
      dashboardItem.command = {
        command: 'adg-parallels.openProgressDashboard',
        title: 'Open Progress Dashboard',
      };
      items.push(dashboardItem);
    }
    
    // === PROCESSING STATUS (only if project exists) ===
    if (this.state.hasProject) {
      const statusItem = this.createStatusItem();
      items.push(statusItem);
    }
    
    // === ROLE ===
    const roleItem = new SidebarItem('role', `Role: ${this.state.currentRole}`);
    roleItem.iconPath = new vscode.ThemeIcon(this.getRoleIcon(this.state.currentRole));
    roleItem.tooltip = this.getRoleTooltip(this.state.currentRole);
    items.push(roleItem);
    
    // === SPACER ===
    items.push(this.createSpacer());
    
    // === CONTROL BUTTONS ===
    const controlItems = this.createControlButtons();
    items.push(...controlItems);
    
    // === SPACER ===
    items.push(this.createSpacer());
    
    // === HELP & ABOUT ===
    const helpItem = new SidebarItem(
      'help-button',
      'Help',
      vscode.TreeItemCollapsibleState.None,
      'adg-parallels.showHelp'
    );
    helpItem.iconPath = new vscode.ThemeIcon('question');
    helpItem.command = {
      command: 'adg-parallels.showHelp',
      title: 'Help',
    };
    items.push(helpItem);
    
    const aboutItem = new SidebarItem(
      'about-button',
      'About',
      vscode.TreeItemCollapsibleState.None,
      'adg-parallels.showAbout'
    );
    aboutItem.iconPath = new vscode.ThemeIcon('info');
    aboutItem.command = {
      command: 'adg-parallels.showAbout',
      title: 'About',
    };
    items.push(aboutItem);
    
    return items;
  }
  
  // ===========================================================================
  // ITEM BUILDERS
  // ===========================================================================
  
  private createSpacer(): SidebarItem {
    const spacer = new SidebarItem('spacer', '');
    spacer.description = '─────────────────';
    return spacer;
  }
  
  private createSwitchItem(): SidebarItem {
    const isOn = this.state.isProcessingEnabled;
    const label = isOn ? '$(check) Processing: ON' : '$(circle-slash) Processing: OFF';
    
    const switchItem = new SidebarItem(
      'switch',
      label,
      vscode.TreeItemCollapsibleState.None,
      'adg-parallels.toggleProcessing'
    );
    
    switchItem.iconPath = new vscode.ThemeIcon(isOn ? 'debug-start' : 'debug-stop');
    switchItem.tooltip = isOn 
      ? 'Click to disable processing' 
      : 'Click to enable processing';
    switchItem.command = {
      command: 'adg-parallels.toggleProcessing',
      title: 'Toggle Processing',
    };
    
    // Color based on state
    if (isOn) {
      switchItem.description = '🟢';
    } else {
      switchItem.description = '🔴';
    }
    
    return switchItem;
  }
  
  private createProjectButton(): SidebarItem {
    if (!this.state.hasProject && this.state.isProcessingEnabled) {
      // Can provision new project
      const provisionItem = new SidebarItem(
        'project-button',
        'Provision New Project',
        vscode.TreeItemCollapsibleState.None,
        'adg-parallels.provisionProject',
        true
      );
      provisionItem.iconPath = new vscode.ThemeIcon('new-folder');
      provisionItem.command = {
        command: 'adg-parallels.provisionProject',
        title: 'Provision New Project',
      };
      provisionItem.tooltip = 'Create a new ADG project in this workspace';
      return provisionItem;
    } else if (this.state.hasProject) {
      // Project active or suspended
      const status = this.state.projectStatus === 'active' ? 'Project Active' : 'Project Suspended';
      const projectItem = new SidebarItem(
        'project-button',
        status,
        vscode.TreeItemCollapsibleState.None,
        undefined,
        false
      );
      projectItem.iconPath = new vscode.ThemeIcon('folder');
      projectItem.description = this.state.projectStatus === 'active' ? '✓' : '⏸';
      return projectItem;
    } else {
      // Extension suspended, no project
      const suspendedItem = new SidebarItem(
        'project-button',
        'Extension Suspended',
        vscode.TreeItemCollapsibleState.None,
        undefined,
        false
      );
      suspendedItem.iconPath = new vscode.ThemeIcon('folder');
      suspendedItem.description = '⏸';
      return suspendedItem;
    }
  }
  
  private createStatusItem(): SidebarItem {
    let label: string;
    let icon: string;
    
    switch (this.state.processingStatus) {
      case 'processing':
        const taskInfo = this.state.currentTaskId 
          ? `${this.state.currentTaskId}/${this.state.totalTasks ?? '?'}`
          : '';
        label = `Processing ${taskInfo}`;
        icon = 'sync~spin';
        break;
      case 'stopped':
        label = 'Awaiting Resume';
        icon = 'debug-pause';
        break;
      case 'finished':
        label = 'Processing Finished';
        icon = 'check-all';
        break;
      default:
        label = 'Idle';
        icon = 'circle-outline';
    }
    
    const statusItem = new SidebarItem('status', `Status: ${label}`);
    statusItem.iconPath = new vscode.ThemeIcon(icon);
    return statusItem;
  }
  
  private createControlButtons(): SidebarItem[] {
    const items: SidebarItem[] = [];
    
    // STOP / PROCESSING STOPPED button
    if (this.state.processingStatus === 'processing') {
      const stopItem = new SidebarItem(
        'control-button',
        'STOP PROCESSING',
        vscode.TreeItemCollapsibleState.None,
        'adg-parallels.stopProcessing',
        true
      );
      stopItem.iconPath = new vscode.ThemeIcon('debug-pause');
      stopItem.command = {
        command: 'adg-parallels.stopProcessing',
        title: 'Stop Processing',
      };
      stopItem.tooltip = 'Stop distributing new tasks (current tasks will complete)';
      items.push(stopItem);
    } else if (this.state.processingStatus === 'stopped') {
      const stoppedItem = new SidebarItem(
        'control-button',
        'PROCESSING STOPPED',
        vscode.TreeItemCollapsibleState.None,
        undefined,
        false
      );
      stoppedItem.iconPath = new vscode.ThemeIcon('debug-pause');
      stoppedItem.description = '⏸';
      items.push(stoppedItem);
    }
    
    // RESUME button (only when stopped)
    if (this.state.processingStatus === 'stopped') {
      const resumeItem = new SidebarItem(
        'control-button',
        'Resume Processing',
        vscode.TreeItemCollapsibleState.None,
        'adg-parallels.resumeProcessing',
        true
      );
      resumeItem.iconPath = new vscode.ThemeIcon('debug-continue');
      resumeItem.command = {
        command: 'adg-parallels.resumeProcessing',
        title: 'Resume Processing',
      };
      items.push(resumeItem);
    }
    
    // KILL button (always visible when there's a project)
    if (this.state.hasProject && this.state.processingStatus !== 'idle') {
      const killItem = new SidebarItem(
        'control-button',
        'KILL PROCESSING',
        vscode.TreeItemCollapsibleState.None,
        'adg-parallels.killProcessing',
        true
      );
      killItem.iconPath = new vscode.ThemeIcon('stop-circle');
      killItem.command = {
        command: 'adg-parallels.killProcessing',
        title: 'Kill Processing',
      };
      killItem.tooltip = '⚠️ Emergency stop - terminates all workers immediately';
      killItem.description = '⚠️';
      items.push(killItem);
    }
    
    return items;
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private getRoleIcon(role: RoleType): string {
    switch (role) {
      case 'manager': return 'account';
      case 'teamleader': return 'organization';
      case 'worker': return 'person';
      default: return 'circle-outline';
    }
  }
  
  private getRoleTooltip(role: RoleType): string {
    switch (role) {
      case 'manager': 
        return 'Manager: Coordinates workers and distributes tasks';
      case 'teamleader': 
        return 'Team Leader: Manages a subset of workers';
      case 'worker': 
        return 'Worker: Executes individual tasks';
      default: 
        return 'No active role in this workspace';
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let sidebarProvider: ADGSidebarProvider | undefined;

export function createSidebarProvider(context: vscode.ExtensionContext): ADGSidebarProvider {
  sidebarProvider = new ADGSidebarProvider(context);
  return sidebarProvider;
}

export function getSidebarProvider(): ADGSidebarProvider | undefined {
  return sidebarProvider;
}
