/**
 * ADG-Parallels Project Wizard
 * 
 * Multi-step webview wizard for creating new projects.
 * Features smooth transitions, real-time validation, and preview.
 * 
 * v0.3.0 - Now with adapter selection as Step 0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getSidebarProvider } from './sidebar-webview';
import { ensureDir, writeJson, pathExists } from '../utils/file-operations';
import { logger } from '../utils/logger';
import { ADAPTER_REGISTRY, getAdapterInfo } from './adapter-wizards';

// =============================================================================
// TYPES
// =============================================================================

export interface WizardState {
  currentStep: number;
  totalSteps: number;
  selectedAdapter: string | null;  // null means Step 0 (adapter selection)
  projectCodename: string;
  workerCount: number;
  taskType: string;
  customTaskType: string;
  pipelineType: string;
  enableHealthMonitoring: boolean;
  heartbeatInterval: number;
  maxRetries: number;
  outputFormat: string;
  customOutputFormat: string;
  isValid: boolean;
  errors: Record<string, string>;
}

const DEFAULT_STATE: WizardState = {
  currentStep: 0,  // Start at Step 0 (adapter selection)
  totalSteps: 5,   // Step 0 + 4 legacy steps
  selectedAdapter: null,
  projectCodename: '',
  workerCount: 4,
  taskType: 'article-generation',
  customTaskType: '',
  pipelineType: 'default-3-stage',
  enableHealthMonitoring: true,
  heartbeatInterval: 30,
  maxRetries: 3,
  outputFormat: 'markdown',
  customOutputFormat: '',
  isValid: false,
  errors: {},
};

// =============================================================================
// WIZARD PANEL
// =============================================================================

export class ProjectWizardPanel {
  public static currentPanel: ProjectWizardPanel | undefined;
  private static readonly viewType = 'adgProjectWizard';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _state: WizardState;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._state = { ...DEFAULT_STATE };

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'updateField':
            this._updateField(message.field, message.value);
            break;
          case 'nextStep':
            this._nextStep();
            break;
          case 'prevStep':
            this._prevStep();
            break;
          case 'goToStep':
            this._goToStep(message.step);
            break;
          case 'createProject':
            await this._createProject();
            break;
          case 'cancel':
            this.dispose();
            break;
          case 'selectAdapter':
            await this._selectAdapter(message.adapterId);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public static show(extensionUri: vscode.Uri, context?: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ProjectWizardPanel.currentPanel) {
      ProjectWizardPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ProjectWizardPanel.viewType,
      '🥚 New Project Wizard',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    ProjectWizardPanel.currentPanel = new ProjectWizardPanel(panel, extensionUri);
    if (context) {
      ProjectWizardPanel.currentPanel.setContext(context);
    }
  }

  public dispose(): void {
    ProjectWizardPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================

  private _updateField(field: string, value: any): void {
    (this._state as any)[field] = value;
    this._validate();
    this._update();
  }

  private _validate(): void {
    const errors: Record<string, string> = {};

    // Step 1: Project codename
    if (!this._state.projectCodename || this._state.projectCodename.length < 3) {
      errors.projectCodename = 'Codename must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9-_]+$/.test(this._state.projectCodename)) {
      errors.projectCodename = 'Only letters, numbers, hyphens, underscores allowed';
    }

    // Step 2: Worker count
    if (this._state.workerCount < 1 || this._state.workerCount > 10) {
      errors.workerCount = 'Worker count must be between 1 and 10';
    }

    // Step 3: Task type
    if (this._state.taskType === 'custom' && !this._state.customTaskType) {
      errors.customTaskType = 'Please enter a custom task type name';
    }

    // Step 1: Custom output format
    if (this._state.outputFormat === 'custom' && !this._state.customOutputFormat) {
      errors.customOutputFormat = 'Please describe the custom output format';
    }

    this._state.errors = errors;
    this._state.isValid = Object.keys(errors).length === 0;
  }

  private _nextStep(): void {
    if (this._state.currentStep < this._state.totalSteps) {
      this._state.currentStep++;
      this._update();
    }
  }

  private _prevStep(): void {
    if (this._state.currentStep > 0) {
      this._state.currentStep--;
      // If going back to Step 0, reset adapter selection
      if (this._state.currentStep === 0) {
        this._state.selectedAdapter = null;
      }
      this._update();
    }
  }

  private _goToStep(step: number): void {
    if (step >= 0 && step <= this._state.totalSteps) {
      this._state.currentStep = step;
      this._update();
    }
  }

  private async _selectAdapter(adapterId: string): Promise<void> {
    const adapterInfo = getAdapterInfo(adapterId);
    if (!adapterInfo) {
      vscode.window.showErrorMessage(`Unknown adapter: ${adapterId}`);
      return;
    }

    // If custom-legacy, continue with this wizard
    if (adapterId === 'custom-legacy') {
      this._state.selectedAdapter = adapterId;
      this._state.currentStep = 1;
      this._update();
      return;
    }

    // For other adapters, close this panel and open their wizard
    this.dispose();
    
    // Get the extension context from somewhere (we need to pass it)
    // For now, call the showWizard function
    adapterInfo.showWizard(this._context);
  }

  // Store extension context for adapter switching
  private _context!: vscode.ExtensionContext;
  
  public setContext(context: vscode.ExtensionContext): void {
    this._context = context;
  }

  // ===========================================================================
  // PROJECT CREATION
  // ===========================================================================

  private async _createProject(): Promise<void> {
    this._validate();
    if (!this._state.isValid) {
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    const adgRoot = path.join(workspaceRoot, '.adg-parallels');

    // Check if project already exists
    if (pathExists(adgRoot)) {
      const overwrite = await vscode.window.showWarningMessage(
        'A project already exists. Overwrite?',
        { modal: true },
        'Overwrite',
        'Cancel'
      );
      if (overwrite !== 'Overwrite') {
        return;
      }
    }

    try {
      await this._createProjectStructure(workspaceRoot);

      // Update sidebar
      const sidebarProvider = getSidebarProvider();
      if (sidebarProvider) {
        const state = sidebarProvider.getState();
        sidebarProvider.updateState({
          hasProject: true,
          projectStatus: state.isProcessingEnabled ? 'active' : 'suspended',
          currentRole: 'manager',
        });

        if (state.isProcessingEnabled) {
          vscode.window.showInformationMessage(
            `🚀 Project "${this._state.projectCodename}" created & auto-started!`
          );
        } else {
          vscode.window.showInformationMessage(
            `✅ Project "${this._state.projectCodename}" created! Turn ON processing to start.`
          );
        }
      }

      // Open tasks file
      const tasksFilePath = path.join(
        workspaceRoot,
        '.adg-parallels',
        'management',
        `project_${this._state.projectCodename}_adg-tasks.json`
      );
      const doc = await vscode.workspace.openTextDocument(tasksFilePath);
      await vscode.window.showTextDocument(doc);

      this.dispose();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create project: ${error}`);
      logger.error('Project creation failed', error);
    }
  }

  private async _createProjectStructure(workspaceRoot: string): Promise<void> {
    const adgRoot = path.join(workspaceRoot, '.adg-parallels');
    const managementDir = path.join(adgRoot, 'management');
    const jobsDir = path.join(adgRoot, 'jobs');
    const adaptersDir = path.join(adgRoot, 'adapters');
    const workersDir = path.join(adgRoot, 'workers');

    ensureDir(managementDir);
    ensureDir(jobsDir);
    ensureDir(adaptersDir);
    ensureDir(workersDir);

    const taskType = this._state.taskType === 'custom' 
      ? this._state.customTaskType 
      : this._state.taskType;

    // Hierarchy config
    const hierarchyConfig = {
      projectCodename: this._state.projectCodename,
      createdAt: new Date().toISOString(),
      maxDepth: 3,
      currentDepth: 0,
      levelConfig: [
        { level: 0, role: 'ceo', canDelegate: true, maxSubordinates: 1, subordinateRole: 'manager' },
        { level: 1, role: 'manager', canDelegate: true, maxSubordinates: 10, subordinateRole: 'worker' },
        { level: 2, role: 'worker', canDelegate: false, maxSubordinates: 0, subordinateRole: null },
      ],
      healthMonitoring: {
        enabled: this._state.enableHealthMonitoring,
        heartbeatIntervalSeconds: this._state.heartbeatInterval,
        unresponsiveThresholdSeconds: this._state.heartbeatInterval * 3,
        maxConsecutiveFailures: 3,
        autoRestart: true,
        alertCeoOnFaulty: true,
      },
      adapters: {
        path: './adapters',
        defaultAdapter: taskType,
        availableAdapters: [taskType],
      },
      pipeline: {
        type: this._state.pipelineType,
        maxRetries: this._state.maxRetries,
      },
      emergencyBrake: {
        maxTotalInstances: 10,
        maxTasksPerWorker: 5,
        timeoutMinutes: 60,
      },
    };

    writeJson(path.join(managementDir, 'hierarchy-config.json'), hierarchyConfig);

    // Worker configs
    for (let i = 1; i <= this._state.workerCount; i++) {
      const workerDir = path.join(workersDir, `worker-${String(i).padStart(3, '0')}`);
      ensureDir(workerDir);
      
      const workerConfig = {
        workerId: `worker-${String(i).padStart(3, '0')}`,
        status: 'idle',
        createdAt: new Date().toISOString(),
        taskType: taskType,
        pipeline: this._state.pipelineType,
      };
      writeJson(path.join(workerDir, 'worker.json'), workerConfig);
    }

    // Sample tasks file
    const tasksFilePath = path.join(
      managementDir,
      `project_${this._state.projectCodename}_adg-tasks.json`
    );

    const outputFormat = this._state.outputFormat === 'custom'
      ? { type: 'custom', description: this._state.customOutputFormat }
      : { type: this._state.outputFormat };

    const sampleTasks = {
      projectCodename: this._state.projectCodename,
      taskType: taskType,
      outputFormat: outputFormat,
      createdAt: new Date().toISOString(),
      tasks: [
        {
          id: 1,
          status: 'pending',
          title: 'Sample Task 1',
          description: 'This is a sample task. Replace with your actual tasks.',
          input: { topic: 'Sample topic' },
          retryCount: 0,
          maxRetries: this._state.maxRetries,
        },
      ],
    };

    writeJson(tasksFilePath, sampleTasks);

    logger.info(`Project "${this._state.projectCodename}" created with ${this._state.workerCount} workers`);
  }

  // ===========================================================================
  // HTML GENERATION
  // ===========================================================================

  private _update(): void {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview(): string {
    const nonce = getNonce();
    const state = this._state;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>New Project Wizard</title>
  <style>
    ${this._getStyles()}
  </style>
</head>
<body>
  <div class="wizard-container">
    <!-- Header -->
    <div class="wizard-header">
      <div class="logo">🥚</div>
      <h1>ADG-Parallels Project Wizard</h1>
      <p class="subtitle">Create a new parallel processing project</p>
    </div>

    <!-- Progress Steps -->
    <div class="progress-bar">
      ${this._renderProgressSteps()}
    </div>

    <!-- Step Content -->
    <div class="step-container">
      ${this._renderCurrentStep()}
    </div>

    <!-- Navigation -->
    <div class="nav-buttons">
      ${state.currentStep === 0 ? `
        <!-- Step 0: Only Cancel button, adapter cards handle navigation -->
        <button class="btn btn-ghost" onclick="send('cancel')">
          Cancel
        </button>
      ` : `
        <button 
          class="btn btn-secondary" 
          onclick="send('prevStep')"
          ${state.currentStep <= 1 ? 'disabled' : ''}
        >
          ← Back
        </button>
        
        <button class="btn btn-ghost" onclick="send('cancel')">
          Cancel
        </button>
        
        ${state.currentStep < state.totalSteps ? `
          <button 
            class="btn btn-primary" 
            onclick="send('nextStep')"
          >
            Next Step →
          </button>
        ` : `
          <button 
            class="btn btn-success" 
            onclick="send('createProject')"
            \${!state.isValid ? 'disabled' : ''}
          >
            🚀 Create Project
          </button>
        `}
      `}
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    
    function send(command, data = {}) {
      vscode.postMessage({ command, ...data });
    }
    
    function updateField(field, value) {
      vscode.postMessage({ command: 'updateField', field, value });
    }
    
    function goToStep(step) {
      vscode.postMessage({ command: 'goToStep', step });
    }
  </script>
</body>
</html>`;
  }

  private _renderProgressSteps(): string {
    // If we're at Step 0 (adapter selection), show a simplified progress bar
    if (this._state.currentStep === 0) {
      return `
        <div class="step active">
          <div class="step-circle">🔌</div>
          <div class="step-label">Choose Adapter</div>
        </div>
        <div class="step-line"></div>
        <div class="step">
          <div class="step-circle">⋯</div>
          <div class="step-label">Configure</div>
        </div>
        <div class="step-line"></div>
        <div class="step">
          <div class="step-circle">🚀</div>
          <div class="step-label">Create</div>
        </div>
      `;
    }
    
    // Legacy steps (after choosing custom-legacy adapter)
    const steps = [
      { num: 0, label: 'Adapter', icon: '🔌' },
      { num: 1, label: 'Project Info', icon: '📝' },
      { num: 2, label: 'Workers', icon: '🥚' },
      { num: 3, label: 'Task Type', icon: '⚙️' },
      { num: 4, label: 'Review', icon: '✓' },
    ];

    return steps.map(step => {
      const isActive = step.num === this._state.currentStep;
      const isComplete = step.num < this._state.currentStep;
      const classes = [
        'step',
        isActive ? 'active' : '',
        isComplete ? 'complete' : '',
      ].filter(Boolean).join(' ');

      return `
        <div class="${classes}" onclick="goToStep(${step.num})">
          <div class="step-circle">
            ${isComplete ? '✓' : step.icon}
          </div>
          <div class="step-label">${step.label}</div>
        </div>
      `;
    }).join('<div class="step-line"></div>');
  }

  private _renderCurrentStep(): string {
    switch (this._state.currentStep) {
      case 0: return this._renderStep0();  // Adapter selection
      case 1: return this._renderStep1();
      case 2: return this._renderStep2();
      case 3: return this._renderStep3();
      case 4: return this._renderStep4();
      default: return '';
    }
  }

  private _renderStep0(): string {
    // Step 0: Adapter Selection
    return `
      <div class="step-content fade-in">
        <h2>🔌 Choose Your Adapter</h2>
        <p class="step-description">
          Select a pipeline adapter that matches your task. Each adapter provides 
          specialized workflows optimized for specific content types.
        </p>
        
        <div class="adapter-grid">
          ${ADAPTER_REGISTRY.map(adapter => `
            <div class="adapter-card" onclick="send('selectAdapter', {adapterId: '${adapter.id}'})">
              <div class="adapter-icon">${adapter.icon}</div>
              <div class="adapter-name">${adapter.name}</div>
              <div class="adapter-desc">${adapter.description}</div>
              <div class="adapter-stages">
                <span class="stages-label">${adapter.stages} stages</span>
                ${adapter.hasAudit ? '<span class="audit-badge">🔍 Audit</span>' : ''}
              </div>
            </div>
          `).join('')}
        </div>
        
        <div class="adapter-help">
          <h4>💡 Not sure which to choose?</h4>
          <ul>
            <li><strong>Article Generator</strong> - Best for blog posts, documentation, marketing content</li>
            <li><strong>Code Generator</strong> - For generating code with automated review</li>
            <li><strong>Research Report</strong> - For in-depth research and analysis</li>
            <li><strong>Translation</strong> - For translating content between languages</li>
            <li><strong>Custom (Legacy)</strong> - Full manual control over configuration</li>
          </ul>
        </div>
      </div>
    `;
  }

  private _renderStep1(): string {
    const error = this._state.errors.projectCodename;
    return `
      <div class="step-content fade-in">
        <h2>📝 Project Information</h2>
        <p class="step-description">
          Give your project a unique codename. This will be used for folder names and identification.
        </p>
        
        <div class="form-group">
          <label for="projectCodename">Project Codename</label>
          <input 
            type="text" 
            id="projectCodename"
            class="input ${error ? 'input-error' : ''}"
            value="${this._state.projectCodename}"
            placeholder="e.g., article-batch-001"
            oninput="updateField('projectCodename', this.value)"
            autofocus
          />
          ${error ? `<div class="error-text">${error}</div>` : ''}
          <div class="hint">Use letters, numbers, hyphens, or underscores</div>
        </div>
        
        <div class="form-group">
          <label for="outputFormat">Output Format</label>
          <select 
            id="outputFormat"
            class="select"
            onchange="updateField('outputFormat', this.value)"
          >
            <option value="markdown" ${this._state.outputFormat === 'markdown' ? 'selected' : ''}>Markdown (.md)</option>
            <option value="html" ${this._state.outputFormat === 'html' ? 'selected' : ''}>HTML (.html)</option>
            <option value="json" ${this._state.outputFormat === 'json' ? 'selected' : ''}>JSON (.json)</option>
            <option value="text" ${this._state.outputFormat === 'text' ? 'selected' : ''}>Plain Text (.txt)</option>
            <option value="code" ${this._state.outputFormat === 'code' ? 'selected' : ''}>Source Code (various)</option>
            <option value="custom" ${this._state.outputFormat === 'custom' ? 'selected' : ''}>CUSTOM...</option>
          </select>
        </div>
        
        ${this._state.outputFormat === 'custom' ? `
          <div class="form-group">
            <label for="customOutputFormat">Custom Output Description</label>
            <textarea 
              id="customOutputFormat"
              class="input textarea ${this._state.errors.customOutputFormat ? 'input-error' : ''}"
              placeholder="e.g., TypeScript modules (.ts), Python scripts with docstrings, React components with tests..."
              oninput="updateField('customOutputFormat', this.value)"
              rows="3"
            >${this._state.customOutputFormat}</textarea>
            ${this._state.errors.customOutputFormat ? `<div class="error-text">${this._state.errors.customOutputFormat}</div>` : ''}
            <div class="hint">Describe what kind of output files workers should generate</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private _renderStep2(): string {
    const workerIcons = Array(this._state.workerCount)
      .fill('🥚')
      .join(' ');

    return `
      <div class="step-content fade-in">
        <h2>🥚 Worker Configuration</h2>
        <p class="step-description">
          Choose how many parallel workers (Ejajkas) will process your tasks.
        </p>
        
        <div class="form-group">
          <label>Number of Workers: <strong>${this._state.workerCount}</strong></label>
          <div class="slider-container">
            <span class="slider-label">1</span>
            <input 
              type="range" 
              min="1" 
              max="10" 
              value="${this._state.workerCount}"
              class="slider"
              oninput="updateField('workerCount', parseInt(this.value))"
            />
            <span class="slider-label">10</span>
          </div>
          
          <div class="worker-preview">
            ${workerIcons}
          </div>
          <div class="hint">More workers = faster processing, but requires more resources</div>
        </div>
        
        <div class="form-group">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              ${this._state.enableHealthMonitoring ? 'checked' : ''}
              onchange="updateField('enableHealthMonitoring', this.checked)"
            />
            Enable Health Monitoring
          </label>
          <div class="hint">Workers will send heartbeats and auto-restart if unresponsive</div>
        </div>
        
        ${this._state.enableHealthMonitoring ? `
          <div class="form-group">
            <label>Heartbeat Interval: ${this._state.heartbeatInterval}s</label>
            <input 
              type="range" 
              min="10" 
              max="120" 
              step="10"
              value="${this._state.heartbeatInterval}"
              class="slider"
              oninput="updateField('heartbeatInterval', parseInt(this.value))"
            />
          </div>
        ` : ''}
      </div>
    `;
  }

  private _renderStep3(): string {
    const taskTypes = [
      { value: 'article-generation', label: 'Article Generation', icon: '📝', desc: 'Generate articles from topics' },
      { value: 'code-review', label: 'Code Review', icon: '🔍', desc: 'Review and analyze code files' },
      { value: 'documentation', label: 'Documentation', icon: '📚', desc: 'Generate technical documentation' },
      { value: 'translation', label: 'Translation', icon: '🌍', desc: 'Translate content between languages' },
      { value: 'custom', label: 'Custom', icon: '⚙️', desc: 'Define your own task type' },
    ];

    const pipelineTypes = [
      { value: 'default-3-stage', label: 'Default 3-Stage', desc: 'Draft → Review → Polish' },
      { value: 'simple-2-stage', label: 'Simple 2-Stage', desc: 'Generate → Review' },
      { value: 'comprehensive-4-stage', label: 'Comprehensive 4-Stage', desc: 'Research → Draft → Review → Polish' },
    ];

    return `
      <div class="step-content fade-in">
        <h2>⚙️ Task Configuration</h2>
        <p class="step-description">
          Select the type of tasks your workers will process.
        </p>
        
        <div class="form-group">
          <label>Task Type</label>
          <div class="radio-grid">
            ${taskTypes.map(type => `
              <label class="radio-card ${this._state.taskType === type.value ? 'selected' : ''}">
                <input 
                  type="radio" 
                  name="taskType" 
                  value="${type.value}"
                  ${this._state.taskType === type.value ? 'checked' : ''}
                  onchange="updateField('taskType', '${type.value}')"
                />
                <div class="radio-card-content">
                  <span class="radio-icon">${type.icon}</span>
                  <span class="radio-label">${type.label}</span>
                  <span class="radio-desc">${type.desc}</span>
                </div>
              </label>
            `).join('')}
          </div>
        </div>
        
        ${this._state.taskType === 'custom' ? `
          <div class="form-group">
            <label for="customTaskType">Custom Task Type Name</label>
            <input 
              type="text" 
              id="customTaskType"
              class="input ${this._state.errors.customTaskType ? 'input-error' : ''}"
              value="${this._state.customTaskType}"
              placeholder="e.g., email-response"
              oninput="updateField('customTaskType', this.value)"
            />
            ${this._state.errors.customTaskType ? `<div class="error-text">${this._state.errors.customTaskType}</div>` : ''}
          </div>
        ` : ''}
        
        <div class="form-group">
          <label>Pipeline Type</label>
          <select 
            class="select"
            onchange="updateField('pipelineType', this.value)"
          >
            ${pipelineTypes.map(p => `
              <option value="${p.value}" ${this._state.pipelineType === p.value ? 'selected' : ''}>
                ${p.label} - ${p.desc}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="form-group">
          <label>Max Retries per Task: ${this._state.maxRetries}</label>
          <input 
            type="range" 
            min="0" 
            max="5" 
            value="${this._state.maxRetries}"
            class="slider"
            oninput="updateField('maxRetries', parseInt(this.value))"
          />
        </div>
      </div>
    `;
  }

  private _renderStep4(): string {
    const taskType = this._state.taskType === 'custom' 
      ? this._state.customTaskType 
      : this._state.taskType;

    return `
      <div class="step-content fade-in">
        <h2>✓ Review & Create</h2>
        <p class="step-description">
          Review your project configuration before creating.
        </p>
        
        <div class="review-card">
          <div class="review-section">
            <h3>📝 Project</h3>
            <div class="review-row">
              <span class="review-label">Codename:</span>
              <span class="review-value">${this._state.projectCodename || '(not set)'}</span>
            </div>
            <div class="review-row">
              <span class="review-label">Output Format:</span>
              <span class="review-value">${this._state.outputFormat === 'custom' ? `CUSTOM: ${this._state.customOutputFormat}` : this._state.outputFormat}</span>
            </div>
          </div>
          
          <div class="review-section">
            <h3>🥚 Workers</h3>
            <div class="review-row">
              <span class="review-label">Count:</span>
              <span class="review-value">${this._state.workerCount} workers</span>
            </div>
            <div class="review-row">
              <span class="review-label">Health Monitoring:</span>
              <span class="review-value">${this._state.enableHealthMonitoring ? 'Enabled' : 'Disabled'}</span>
            </div>
            ${this._state.enableHealthMonitoring ? `
              <div class="review-row">
                <span class="review-label">Heartbeat:</span>
                <span class="review-value">Every ${this._state.heartbeatInterval}s</span>
              </div>
            ` : ''}
          </div>
          
          <div class="review-section">
            <h3>⚙️ Tasks</h3>
            <div class="review-row">
              <span class="review-label">Type:</span>
              <span class="review-value">${taskType}</span>
            </div>
            <div class="review-row">
              <span class="review-label">Pipeline:</span>
              <span class="review-value">${this._state.pipelineType}</span>
            </div>
            <div class="review-row">
              <span class="review-label">Max Retries:</span>
              <span class="review-value">${this._state.maxRetries}</span>
            </div>
          </div>
        </div>
        
        <div class="folder-preview">
          <h3>📁 Folder Structure Preview</h3>
          <pre class="folder-tree">
.adg-parallels/
├── management/
│   ├── hierarchy-config.json
│   └── project_${this._state.projectCodename || 'xxx'}_adg-tasks.json
├── adapters/
├── jobs/
└── workers/
    ${Array.from({length: Math.min(this._state.workerCount, 3)}, (_, i) => 
      `├── worker-${String(i + 1).padStart(3, '0')}/`
    ).join('\n    ')}
    ${this._state.workerCount > 3 ? `└── ... (${this._state.workerCount - 3} more)` : `└── worker-${String(this._state.workerCount).padStart(3, '0')}/`}
          </pre>
        </div>
        
        ${!this._state.isValid ? `
          <div class="validation-errors">
            <h4>⚠️ Please fix these issues:</h4>
            <ul>
              ${Object.values(this._state.errors).map(e => `<li>${e}</li>`).join('')}
            </ul>
          </div>
        ` : `
          <div class="ready-message">
            ✅ Configuration is valid. Ready to create project!
          </div>
        `}
      </div>
    `;
  }

  private _getStyles(): string {
    return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 0;
        margin: 0;
        min-height: 100vh;
      }
      
      .wizard-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 40px 20px;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      
      /* Header */
      .wizard-header {
        text-align: center;
        margin-bottom: 40px;
      }
      
      .logo {
        font-size: 64px;
        margin-bottom: 16px;
        animation: bounce 2s ease-in-out infinite;
      }
      
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      
      .wizard-header h1 {
        font-size: 28px;
        font-weight: 600;
        color: var(--vscode-textLink-foreground);
        margin-bottom: 8px;
      }
      
      .subtitle {
        color: var(--vscode-descriptionForeground);
        font-size: 16px;
      }
      
      /* Progress Bar */
      .progress-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        margin-bottom: 40px;
        padding: 0 20px;
      }
      
      .step {
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      
      .step:hover {
        transform: scale(1.05);
      }
      
      .step-circle {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        transition: all 0.3s ease;
        border: 3px solid transparent;
      }
      
      .step.active .step-circle {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border-color: var(--vscode-focusBorder);
        transform: scale(1.1);
        box-shadow: 0 0 20px rgba(0, 120, 212, 0.4);
      }
      
      .step.complete .step-circle {
        background: #238636;
        color: white;
      }
      
      .step-label {
        margin-top: 8px;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        transition: color 0.3s ease;
      }
      
      .step.active .step-label {
        color: var(--vscode-foreground);
        font-weight: 600;
      }
      
      .step-line {
        width: 60px;
        height: 3px;
        background: var(--vscode-panel-border);
        margin: 0 8px;
        margin-bottom: 28px;
      }
      
      /* Step Content */
      .step-container {
        flex: 1;
        background: var(--vscode-sideBar-background);
        border-radius: 12px;
        padding: 32px;
        margin-bottom: 24px;
        border: 1px solid var(--vscode-panel-border);
      }
      
      .step-content h2 {
        font-size: 24px;
        margin-bottom: 8px;
        color: var(--vscode-foreground);
      }
      
      .step-description {
        color: var(--vscode-descriptionForeground);
        margin-bottom: 32px;
        font-size: 14px;
      }
      
      .fade-in {
        animation: fadeIn 0.3s ease-in-out;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }
      
      /* Form Elements */
      .form-group {
        margin-bottom: 24px;
      }
      
      .form-group label {
        display: block;
        margin-bottom: 8px;
        font-weight: 500;
        color: var(--vscode-foreground);
      }
      
      .input, .select {
        width: 100%;
        padding: 12px 16px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 6px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        font-size: 14px;
        transition: all 0.2s ease;
      }
      
      .textarea {
        resize: vertical;
        min-height: 80px;
        font-family: var(--vscode-font-family);
      }
      
      .input:focus, .select:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
        box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.2);
      }
      
      .input-error {
        border-color: #f85149;
      }
      
      .error-text {
        color: #f85149;
        font-size: 12px;
        margin-top: 4px;
      }
      
      .hint {
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        margin-top: 4px;
      }
      
      /* Slider */
      .slider-container {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      
      .slider-label {
        color: var(--vscode-descriptionForeground);
        font-size: 14px;
        min-width: 24px;
        text-align: center;
      }
      
      .slider {
        flex: 1;
        -webkit-appearance: none;
        height: 8px;
        border-radius: 4px;
        background: var(--vscode-input-background);
        outline: none;
      }
      
      .slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: var(--vscode-button-background);
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
        box-shadow: 0 0 10px rgba(0, 120, 212, 0.4);
      }
      
      /* Worker Preview */
      .worker-preview {
        text-align: center;
        font-size: 32px;
        padding: 20px;
        background: var(--vscode-editor-background);
        border-radius: 8px;
        margin-top: 16px;
        letter-spacing: 8px;
      }
      
      /* Checkbox */
      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }
      
      .checkbox-label input {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }
      
      /* Radio Cards */
      .radio-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
      }
      
      .radio-card {
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .radio-card input {
        display: none;
      }
      
      .radio-card-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 16px;
        background: var(--vscode-editor-background);
        border: 2px solid var(--vscode-panel-border);
        border-radius: 8px;
        transition: all 0.2s ease;
      }
      
      .radio-card:hover .radio-card-content {
        border-color: var(--vscode-focusBorder);
      }
      
      .radio-card.selected .radio-card-content {
        border-color: var(--vscode-button-background);
        background: rgba(0, 120, 212, 0.1);
      }
      
      .radio-icon {
        font-size: 28px;
        margin-bottom: 8px;
      }
      
      .radio-label {
        font-weight: 600;
        font-size: 13px;
        text-align: center;
      }
      
      .radio-desc {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        text-align: center;
        margin-top: 4px;
      }
      
      /* Review Card */
      .review-card {
        background: var(--vscode-editor-background);
        border-radius: 8px;
        padding: 24px;
        margin-bottom: 24px;
      }
      
      .review-section {
        margin-bottom: 20px;
      }
      
      .review-section:last-child {
        margin-bottom: 0;
      }
      
      .review-section h3 {
        font-size: 16px;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
      
      .review-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
      }
      
      .review-label {
        color: var(--vscode-descriptionForeground);
      }
      
      .review-value {
        font-weight: 500;
      }
      
      /* Folder Preview */
      .folder-preview {
        background: var(--vscode-editor-background);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 24px;
      }
      
      .folder-preview h3 {
        font-size: 14px;
        margin-bottom: 12px;
      }
      
      .folder-tree {
        font-family: var(--vscode-editor-font-family);
        font-size: 13px;
        color: var(--vscode-descriptionForeground);
        white-space: pre;
        overflow-x: auto;
      }
      
      /* Validation */
      .validation-errors {
        background: rgba(248, 81, 73, 0.1);
        border: 1px solid #f85149;
        border-radius: 8px;
        padding: 16px;
      }
      
      .validation-errors h4 {
        color: #f85149;
        margin-bottom: 8px;
      }
      
      .validation-errors ul {
        margin-left: 20px;
        color: #f85149;
      }
      
      .ready-message {
        background: rgba(35, 134, 54, 0.1);
        border: 1px solid #238636;
        border-radius: 8px;
        padding: 16px;
        color: #3fb950;
        text-align: center;
        font-weight: 500;
      }
      
      /* Navigation Buttons */
      .nav-buttons {
        display: flex;
        gap: 12px;
        justify-content: center;
      }
      
      .btn {
        padding: 12px 24px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        min-width: 120px;
      }
      
      .btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .btn-primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
      
      .btn-primary:hover:not(:disabled) {
        background: var(--vscode-button-hoverBackground);
      }
      
      .btn-secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }
      
      .btn-success {
        background: #238636;
        color: white;
        min-width: 160px;
      }
      
      .btn-success:hover:not(:disabled) {
        background: #2ea043;
      }
      
      .btn-ghost {
        background: transparent;
        color: var(--vscode-descriptionForeground);
        border: 1px solid var(--vscode-panel-border);
      }
      
      .btn-ghost:hover:not(:disabled) {
        background: var(--vscode-list-hoverBackground);
      }
      
      /* Adapter Selection Grid (Step 0) */
      .adapter-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      
      .adapter-card {
        background: var(--vscode-editor-background);
        border: 2px solid var(--vscode-panel-border);
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: center;
      }
      
      .adapter-card:hover {
        border-color: var(--vscode-focusBorder);
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      }
      
      .adapter-card:active {
        transform: translateY(-2px);
      }
      
      .adapter-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }
      
      .adapter-name {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--vscode-foreground);
      }
      
      .adapter-desc {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 12px;
        line-height: 1.4;
      }
      
      .adapter-stages {
        display: flex;
        gap: 8px;
        justify-content: center;
        flex-wrap: wrap;
      }
      
      .stages-label {
        background: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
      }
      
      .audit-badge {
        background: rgba(255, 165, 0, 0.2);
        color: #ffa500;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
      }
      
      .adapter-help {
        background: rgba(0, 120, 212, 0.05);
        border: 1px dashed var(--vscode-focusBorder);
        border-radius: 8px;
        padding: 16px;
        margin-top: 24px;
      }
      
      .adapter-help h4 {
        font-size: 14px;
        margin-bottom: 12px;
        color: var(--vscode-textLink-foreground);
      }
      
      .adapter-help ul {
        margin-left: 20px;
        font-size: 13px;
        color: var(--vscode-descriptionForeground);
      }
      
      .adapter-help li {
        margin-bottom: 6px;
      }
      
      .adapter-help strong {
        color: var(--vscode-foreground);
      }
    `;
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
// COMMAND
// =============================================================================

export function showProjectWizard(context: vscode.ExtensionContext): void {
  ProjectWizardPanel.show(context.extensionUri, context);
}
