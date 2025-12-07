/**
 * ADG-Parallels Article Generation Wizard
 * 
 * Dedicated wizard for creating article generation projects.
 * Collects: topic, tone, length, structure, language, audit settings.
 * 
 * v0.3.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getNonce, getBaseStyles } from './shared';
import { ensureDir, writeJson, pathExists } from '../../utils/file-operations';
import { logger } from '../../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

interface ArticleWizardState {
  currentStep: number;
  totalSteps: number;
  
  // Step 1: Project
  projectCodename: string;
  
  // Step 2: Topic & Purpose
  articleTopic: string;
  articleDescription: string;
  purpose: string;
  customPurpose: string;
  targetAudience: string;
  customAudience: string;
  
  // Step 3: Style & Format
  tone: string;
  customTone: string;
  length: string;
  customLength: string;
  structure: string;
  customStructure: string;
  language: string;
  customLanguage: string;
  
  // Step 4: Quality & Audit
  enableProofreading: boolean;
  enableAudit: boolean;
  auditLevel: string;
  customAuditCriteria: string;
  forbiddenPatterns: string[];
  customForbiddenPatterns: string;
  
  // Step 5: Workers & Output
  workerCount: number;
  outputFormat: string;
  customOutputFormat: string;
  maxRetries: number;
  
  // Validation
  isValid: boolean;
  errors: Record<string, string>;
}

const PURPOSES = [
  { value: 'inform', label: 'Inform', desc: 'Provide information and facts' },
  { value: 'educate', label: 'Educate', desc: 'Teach concepts and skills' },
  { value: 'persuade', label: 'Persuade', desc: 'Convince readers to act' },
  { value: 'entertain', label: 'Entertain', desc: 'Engage and amuse' },
  { value: 'document', label: 'Document', desc: 'Record for reference' },
  { value: 'analyze', label: 'Analyze', desc: 'Examine and evaluate' },
  { value: 'compare', label: 'Compare', desc: 'Compare alternatives' },
  { value: 'CUSTOM', label: 'Custom', desc: 'Define your own purpose' },
];

const AUDIENCES = [
  { value: 'general', label: 'General Public', desc: 'Broad audience' },
  { value: 'technical', label: 'Technical', desc: 'Developers, engineers' },
  { value: 'business', label: 'Business', desc: 'Executives, managers' },
  { value: 'academic', label: 'Academic', desc: 'Researchers, students' },
  { value: 'beginners', label: 'Beginners', desc: 'New to the topic' },
  { value: 'experts', label: 'Experts', desc: 'Deep domain knowledge' },
  { value: 'children', label: 'Children', desc: 'Young readers' },
  { value: 'CUSTOM', label: 'Custom', desc: 'Describe your audience' },
];

const TONES = [
  { value: 'formal', label: 'Formal', desc: 'Professional, business-like' },
  { value: 'casual', label: 'Casual', desc: 'Friendly, conversational' },
  { value: 'technical', label: 'Technical', desc: 'Precise, detailed' },
  { value: 'academic', label: 'Academic', desc: 'Scholarly, citations' },
  { value: 'marketing', label: 'Marketing', desc: 'Persuasive, engaging' },
  { value: 'journalistic', label: 'Journalistic', desc: 'Factual, news-style' },
  { value: 'humorous', label: 'Humorous', desc: 'Light, witty' },
  { value: 'inspirational', label: 'Inspirational', desc: 'Motivating, uplifting' },
  { value: 'CUSTOM', label: 'Custom', desc: 'Define your tone' },
];

const LENGTHS = [
  { value: 'short', label: 'Short', desc: '300-500 words' },
  { value: 'medium', label: 'Medium', desc: '500-1000 words' },
  { value: 'long', label: 'Long', desc: '1000-2000 words' },
  { value: 'extended', label: 'Extended', desc: '2000-4000 words' },
  { value: 'comprehensive', label: 'Comprehensive', desc: '4000+ words' },
  { value: 'CUSTOM', label: 'Custom', desc: 'Specify word count' },
];

const STRUCTURES = [
  { value: 'standard', label: 'Standard', desc: 'Intro, body, conclusion' },
  { value: 'listicle', label: 'Listicle', desc: 'Numbered list format' },
  { value: 'tutorial', label: 'Tutorial', desc: 'Step-by-step guide' },
  { value: 'qa', label: 'Q&A', desc: 'Question and answer' },
  { value: 'narrative', label: 'Narrative', desc: 'Story-based' },
  { value: 'comparison', label: 'Comparison', desc: 'Pros/cons, alternatives' },
  { value: 'case-study', label: 'Case Study', desc: 'Real-world example' },
  { value: 'CUSTOM', label: 'Custom', desc: 'Define structure' },
];

const LANGUAGES = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'pl', label: 'Polish', flag: '🇵🇱' },
  { value: 'de', label: 'German', flag: '🇩🇪' },
  { value: 'fr', label: 'French', flag: '🇫🇷' },
  { value: 'es', label: 'Spanish', flag: '🇪🇸' },
  { value: 'it', label: 'Italian', flag: '🇮🇹' },
  { value: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { value: 'nl', label: 'Dutch', flag: '🇳🇱' },
  { value: 'ru', label: 'Russian', flag: '🇷🇺' },
  { value: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { value: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { value: 'CUSTOM', label: 'Other', flag: '🌐' },
];

const AUDIT_LEVELS = [
  { value: 'basic', label: 'Basic', desc: 'Check completeness only' },
  { value: 'standard', label: 'Standard', desc: 'Quality + forbidden patterns' },
  { value: 'strict', label: 'Strict', desc: 'Detailed review + scoring' },
  { value: 'CUSTOM', label: 'Custom', desc: 'Define criteria' },
];

const DEFAULT_FORBIDDEN = [
  'Lorem ipsum',
  'TODO',
  'PLACEHOLDER',
  '[insert',
  '[do uzupełnienia]',
  'As an AI',
  'I\'m just an AI',
  'As a language model',
];

const DEFAULT_STATE: ArticleWizardState = {
  currentStep: 1,
  totalSteps: 6,
  projectCodename: '',
  articleTopic: '',
  articleDescription: '',
  purpose: 'inform',
  customPurpose: '',
  targetAudience: 'general',
  customAudience: '',
  tone: 'formal',
  customTone: '',
  length: 'medium',
  customLength: '',
  structure: 'standard',
  customStructure: '',
  language: 'en',
  customLanguage: '',
  enableProofreading: true,
  enableAudit: true,
  auditLevel: 'standard',
  customAuditCriteria: '',
  forbiddenPatterns: [...DEFAULT_FORBIDDEN],
  customForbiddenPatterns: '',
  workerCount: 4,
  outputFormat: 'markdown',
  customOutputFormat: '',
  maxRetries: 3,
  isValid: false,
  errors: {},
};

// =============================================================================
// WIZARD PANEL
// =============================================================================

export class ArticleWizardPanel {
  public static currentPanel: ArticleWizardPanel | undefined;
  private static readonly viewType = 'adgArticleWizard';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _state: ArticleWizardState;
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
          case 'toggleForbiddenPattern':
            this._toggleForbiddenPattern(message.pattern);
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
        }
      },
      null,
      this._disposables
    );
  }

  public static show(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (ArticleWizardPanel.currentPanel) {
      ArticleWizardPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ArticleWizardPanel.viewType,
      '📝 Article Generator Wizard',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    ArticleWizardPanel.currentPanel = new ArticleWizardPanel(panel, extensionUri);
  }

  public dispose(): void {
    ArticleWizardPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
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

  private _toggleForbiddenPattern(pattern: string): void {
    const idx = this._state.forbiddenPatterns.indexOf(pattern);
    if (idx >= 0) {
      this._state.forbiddenPatterns.splice(idx, 1);
    } else {
      this._state.forbiddenPatterns.push(pattern);
    }
    this._update();
  }

  private _validate(): void {
    const errors: Record<string, string> = {};
    const s = this._state;

    if (!s.projectCodename || s.projectCodename.length < 3) {
      errors.projectCodename = 'Codename must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9-_]+$/.test(s.projectCodename)) {
      errors.projectCodename = 'Only letters, numbers, hyphens, underscores';
    }

    if (!s.articleTopic) {
      errors.articleTopic = 'Topic is required';
    }

    if (s.purpose === 'CUSTOM' && !s.customPurpose) {
      errors.customPurpose = 'Please describe the purpose';
    }

    if (s.targetAudience === 'CUSTOM' && !s.customAudience) {
      errors.customAudience = 'Please describe your audience';
    }

    if (s.tone === 'CUSTOM' && !s.customTone) {
      errors.customTone = 'Please describe the tone';
    }

    if (s.length === 'CUSTOM' && !s.customLength) {
      errors.customLength = 'Please specify length';
    }

    if (s.structure === 'CUSTOM' && !s.customStructure) {
      errors.customStructure = 'Please describe structure';
    }

    if (s.language === 'CUSTOM' && !s.customLanguage) {
      errors.customLanguage = 'Please specify language';
    }

    if (s.enableAudit && s.auditLevel === 'CUSTOM' && !s.customAuditCriteria) {
      errors.customAuditCriteria = 'Please define audit criteria';
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
    if (this._state.currentStep > 1) {
      this._state.currentStep--;
      this._update();
    }
  }

  private _goToStep(step: number): void {
    if (step >= 1 && step <= this._state.totalSteps) {
      this._state.currentStep = step;
      this._update();
    }
  }

  // ===========================================================================
  // PROJECT CREATION
  // ===========================================================================

  private async _createProject(): Promise<void> {
    this._validate();
    if (!this._state.isValid) return;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    try {
      await this._createProjectStructure(workspaceFolder.uri.fsPath);
      vscode.window.showInformationMessage(
        `✅ Article project "${this._state.projectCodename}" created!`
      );
      this.dispose();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create project: ${error}`);
      logger.error('Article project creation failed', error);
    }
  }

  private async _createProjectStructure(workspaceRoot: string): Promise<void> {
    const s = this._state;
    const adgRoot = path.join(workspaceRoot, '.adg-parallels');
    const managementDir = path.join(adgRoot, 'management');
    const adaptersDir = path.join(adgRoot, 'adapters');
    const workersDir = path.join(adgRoot, 'workers');
    const outputsDir = path.join(adgRoot, 'outputs');

    ensureDir(managementDir);
    ensureDir(adaptersDir);
    ensureDir(workersDir);
    ensureDir(outputsDir);

    // Hierarchy config
    const hierarchyConfig = {
      projectCodename: s.projectCodename,
      adapterType: 'article-with-audit',
      createdAt: new Date().toISOString(),
      maxDepth: 3,
      currentDepth: 0,
      healthMonitoring: {
        enabled: true,
        heartbeatIntervalSeconds: 60,
        unresponsiveThresholdSeconds: 180,
        maxConsecutiveFailures: 3,
        autoRestart: true,
      },
      articleConfig: {
        topic: s.articleTopic,
        description: s.articleDescription,
        purpose: s.purpose === 'CUSTOM' ? s.customPurpose : s.purpose,
        audience: s.targetAudience === 'CUSTOM' ? s.customAudience : s.targetAudience,
        tone: s.tone === 'CUSTOM' ? s.customTone : s.tone,
        length: s.length === 'CUSTOM' ? s.customLength : s.length,
        structure: s.structure === 'CUSTOM' ? s.customStructure : s.structure,
        language: s.language === 'CUSTOM' ? s.customLanguage : s.language,
      },
      qualityConfig: {
        enableProofreading: s.enableProofreading,
        enableAudit: s.enableAudit,
        auditLevel: s.auditLevel === 'CUSTOM' ? 'custom' : s.auditLevel,
        customAuditCriteria: s.customAuditCriteria,
        forbiddenPatterns: s.forbiddenPatterns,
      },
    };

    writeJson(path.join(managementDir, 'hierarchy-config.json'), hierarchyConfig);

    // Create worker directories
    for (let i = 1; i <= s.workerCount; i++) {
      const workerDir = path.join(workersDir, `worker-${String(i).padStart(3, '0')}`);
      ensureDir(workerDir);
    }

    // Tasks file with sample task
    const tasksFile = {
      projectCodename: s.projectCodename,
      adapterType: 'article-with-audit',
      createdAt: new Date().toISOString(),
      config: {
        workerCount: s.workerCount,
        maxRetries: s.maxRetries,
        outputFormat: s.outputFormat === 'custom' ? s.customOutputFormat : s.outputFormat,
      },
      tasks: [
        {
          id: 1,
          status: 'pending',
          title: s.articleTopic,
          description: s.articleDescription || `Write an article about: ${s.articleTopic}`,
          params: {
            purpose: s.purpose === 'CUSTOM' ? s.customPurpose : s.purpose,
            audience: s.targetAudience === 'CUSTOM' ? s.customAudience : s.targetAudience,
            tone: s.tone === 'CUSTOM' ? s.customTone : s.tone,
            length: s.length === 'CUSTOM' ? s.customLength : s.length,
            structure: s.structure === 'CUSTOM' ? s.customStructure : s.structure,
            language: s.language === 'CUSTOM' ? s.customLanguage : s.language,
          },
          retryCount: 0,
          maxRetries: s.maxRetries,
        },
      ],
    };

    writeJson(
      path.join(managementDir, `project_${s.projectCodename}_adg-tasks.json`),
      tasksFile
    );

    // Open tasks file
    const tasksPath = path.join(managementDir, `project_${s.projectCodename}_adg-tasks.json`);
    const doc = await vscode.workspace.openTextDocument(tasksPath);
    await vscode.window.showTextDocument(doc);

    logger.info(`Article project "${s.projectCodename}" created`);
  }

  // ===========================================================================
  // HTML
  // ===========================================================================

  private _update(): void {
    this._panel.webview.html = this._getHtml();
  }

  private _getHtml(): string {
    const nonce = getNonce();
    const s = this._state;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Article Generator Wizard</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="wizard-container">
    <div class="wizard-header">
      <div class="logo">📝</div>
      <h1>Article Generator</h1>
      <p class="subtitle">Create articles with proofreading and quality audit</p>
    </div>

    <div class="progress-bar">
      ${this._renderProgress()}
    </div>

    <div class="step-container">
      ${this._renderStep()}
    </div>

    <div class="nav-buttons">
      <button class="btn btn-secondary" onclick="send('prevStep')" ${s.currentStep === 1 ? 'disabled' : ''}>← Back</button>
      <button class="btn btn-ghost" onclick="send('cancel')">Cancel</button>
      ${s.currentStep < s.totalSteps 
        ? `<button class="btn btn-primary" onclick="send('nextStep')">Next →</button>`
        : `<button class="btn btn-success" onclick="send('createProject')" ${!s.isValid ? 'disabled' : ''}>🚀 Create Project</button>`
      }
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function send(cmd, data = {}) { vscode.postMessage({ command: cmd, ...data }); }
    function updateField(field, value) { vscode.postMessage({ command: 'updateField', field, value }); }
    function togglePattern(pattern) { vscode.postMessage({ command: 'toggleForbiddenPattern', pattern }); }
    function goToStep(step) { vscode.postMessage({ command: 'goToStep', step }); }
  </script>
</body>
</html>`;
  }

  private _renderProgress(): string {
    const steps = [
      { num: 1, label: 'Project', icon: '📁' },
      { num: 2, label: 'Topic', icon: '💡' },
      { num: 3, label: 'Style', icon: '🎨' },
      { num: 4, label: 'Quality', icon: '✓' },
      { num: 5, label: 'Workers', icon: '🥚' },
      { num: 6, label: 'Review', icon: '🚀' },
    ];

    return steps.map((step, i) => {
      const isActive = step.num === this._state.currentStep;
      const isComplete = step.num < this._state.currentStep;
      const cls = `step ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`;
      const line = i < steps.length - 1 ? '<div class="step-line"></div>' : '';

      return `
        <div class="${cls}" onclick="goToStep(${step.num})">
          <div class="step-circle">${isComplete ? '✓' : step.icon}</div>
          <div class="step-label">${step.label}</div>
        </div>
        ${line}
      `;
    }).join('');
  }

  private _renderStep(): string {
    switch (this._state.currentStep) {
      case 1: return this._renderStep1();
      case 2: return this._renderStep2();
      case 3: return this._renderStep3();
      case 4: return this._renderStep4();
      case 5: return this._renderStep5();
      case 6: return this._renderStep6();
      default: return '';
    }
  }

  private _renderStep1(): string {
    const s = this._state;
    const err = s.errors.projectCodename;
    return `
      <div class="step-content fade-in">
        <h2>📁 Project Setup</h2>
        <p class="step-description">Give your article project a unique codename.</p>
        
        <div class="form-group">
          <label>Project Codename</label>
          <input type="text" class="input ${err ? 'input-error' : ''}" 
            value="${s.projectCodename}" placeholder="e.g., blog-articles-q1"
            oninput="updateField('projectCodename', this.value)" autofocus />
          ${err ? `<div class="error-text">${err}</div>` : ''}
          <div class="hint">Use letters, numbers, hyphens, underscores</div>
        </div>
      </div>
    `;
  }

  private _renderStep2(): string {
    const s = this._state;
    return `
      <div class="step-content fade-in">
        <h2>💡 Topic & Purpose</h2>
        <p class="step-description">Define what the article should be about.</p>
        
        <div class="form-group">
          <label>Article Topic / Title</label>
          <input type="text" class="input ${s.errors.articleTopic ? 'input-error' : ''}" 
            value="${s.articleTopic}" placeholder="e.g., How to Build a VS Code Extension"
            oninput="updateField('articleTopic', this.value)" />
          ${s.errors.articleTopic ? `<div class="error-text">${s.errors.articleTopic}</div>` : ''}
        </div>
        
        <div class="form-group">
          <label>Description / Brief (optional)</label>
          <textarea class="textarea" placeholder="Additional details about what the article should cover..."
            oninput="updateField('articleDescription', this.value)">${s.articleDescription}</textarea>
        </div>
        
        <div class="form-group">
          <label>Purpose</label>
          <div class="radio-grid">
            ${PURPOSES.map(p => `
              <label class="radio-card ${s.purpose === p.value ? 'selected' : ''}">
                <input type="radio" name="purpose" value="${p.value}" 
                  ${s.purpose === p.value ? 'checked' : ''} onchange="updateField('purpose', '${p.value}')" />
                <div class="radio-card-content">
                  <span class="radio-label">${p.label}</span>
                  <span class="radio-desc">${p.desc}</span>
                </div>
              </label>
            `).join('')}
          </div>
          ${s.purpose === 'CUSTOM' ? `
            <div class="custom-section">
              <label>Custom Purpose</label>
              <input type="text" class="input ${s.errors.customPurpose ? 'input-error' : ''}" 
                value="${s.customPurpose}" placeholder="Describe the purpose..."
                oninput="updateField('customPurpose', this.value)" />
              ${s.errors.customPurpose ? `<div class="error-text">${s.errors.customPurpose}</div>` : ''}
            </div>
          ` : ''}
        </div>
        
        <div class="form-group">
          <label>Target Audience</label>
          <div class="radio-grid">
            ${AUDIENCES.map(a => `
              <label class="radio-card ${s.targetAudience === a.value ? 'selected' : ''}">
                <input type="radio" name="audience" value="${a.value}" 
                  ${s.targetAudience === a.value ? 'checked' : ''} onchange="updateField('targetAudience', '${a.value}')" />
                <div class="radio-card-content">
                  <span class="radio-label">${a.label}</span>
                  <span class="radio-desc">${a.desc}</span>
                </div>
              </label>
            `).join('')}
          </div>
          ${s.targetAudience === 'CUSTOM' ? `
            <div class="custom-section">
              <label>Custom Audience</label>
              <input type="text" class="input ${s.errors.customAudience ? 'input-error' : ''}" 
                value="${s.customAudience}" placeholder="Describe your target audience..."
                oninput="updateField('customAudience', this.value)" />
              ${s.errors.customAudience ? `<div class="error-text">${s.errors.customAudience}</div>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private _renderStep3(): string {
    const s = this._state;
    return `
      <div class="step-content fade-in">
        <h2>🎨 Style & Format</h2>
        <p class="step-description">Define how the article should be written.</p>
        
        <div class="form-row">
          <div class="form-group">
            <label>Tone</label>
            <select class="select" onchange="updateField('tone', this.value)">
              ${TONES.map(t => `<option value="${t.value}" ${s.tone === t.value ? 'selected' : ''}>${t.label} - ${t.desc}</option>`).join('')}
            </select>
            ${s.tone === 'CUSTOM' ? `
              <input type="text" class="input" style="margin-top:8px" value="${s.customTone}" 
                placeholder="Describe tone..." oninput="updateField('customTone', this.value)" />
            ` : ''}
          </div>
          
          <div class="form-group">
            <label>Length</label>
            <select class="select" onchange="updateField('length', this.value)">
              ${LENGTHS.map(l => `<option value="${l.value}" ${s.length === l.value ? 'selected' : ''}>${l.label} - ${l.desc}</option>`).join('')}
            </select>
            ${s.length === 'CUSTOM' ? `
              <input type="text" class="input" style="margin-top:8px" value="${s.customLength}" 
                placeholder="e.g., 1500 words" oninput="updateField('customLength', this.value)" />
            ` : ''}
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Structure</label>
            <select class="select" onchange="updateField('structure', this.value)">
              ${STRUCTURES.map(st => `<option value="${st.value}" ${s.structure === st.value ? 'selected' : ''}>${st.label} - ${st.desc}</option>`).join('')}
            </select>
            ${s.structure === 'CUSTOM' ? `
              <input type="text" class="input" style="margin-top:8px" value="${s.customStructure}" 
                placeholder="Describe structure..." oninput="updateField('customStructure', this.value)" />
            ` : ''}
          </div>
          
          <div class="form-group">
            <label>Language</label>
            <select class="select" onchange="updateField('language', this.value)">
              ${LANGUAGES.map(l => `<option value="${l.value}" ${s.language === l.value ? 'selected' : ''}>${l.flag} ${l.label}</option>`).join('')}
            </select>
            ${s.language === 'CUSTOM' ? `
              <input type="text" class="input" style="margin-top:8px" value="${s.customLanguage}" 
                placeholder="e.g., Ukrainian" oninput="updateField('customLanguage', this.value)" />
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  private _renderStep4(): string {
    const s = this._state;
    return `
      <div class="step-content fade-in">
        <h2>✓ Quality & Audit</h2>
        <p class="step-description">Configure quality checks and auditing.</p>
        
        <div class="form-group">
          <label class="checkbox-label" style="padding:12px;background:var(--vscode-editor-background);border-radius:6px;">
            <input type="checkbox" ${s.enableProofreading ? 'checked' : ''} 
              onchange="updateField('enableProofreading', this.checked)" />
            <span><strong>Enable Proofreading</strong> - AI reviews and corrects grammar, style</span>
          </label>
        </div>
        
        <div class="form-group">
          <label class="checkbox-label" style="padding:12px;background:var(--vscode-editor-background);border-radius:6px;">
            <input type="checkbox" ${s.enableAudit ? 'checked' : ''} 
              onchange="updateField('enableAudit', this.checked)" />
            <span><strong>Enable Quality Audit</strong> - Final review with pass/fail verdict</span>
          </label>
        </div>
        
        ${s.enableAudit ? `
          <div class="form-group">
            <label>Audit Level</label>
            <div class="radio-grid">
              ${AUDIT_LEVELS.map(a => `
                <label class="radio-card ${s.auditLevel === a.value ? 'selected' : ''}">
                  <input type="radio" name="auditLevel" value="${a.value}" 
                    ${s.auditLevel === a.value ? 'checked' : ''} onchange="updateField('auditLevel', '${a.value}')" />
                  <div class="radio-card-content">
                    <span class="radio-label">${a.label}</span>
                    <span class="radio-desc">${a.desc}</span>
                  </div>
                </label>
              `).join('')}
            </div>
            ${s.auditLevel === 'CUSTOM' ? `
              <div class="custom-section">
                <label>Custom Audit Criteria</label>
                <textarea class="textarea" placeholder="Define what should be checked..."
                  oninput="updateField('customAuditCriteria', this.value)">${s.customAuditCriteria}</textarea>
              </div>
            ` : ''}
          </div>
          
          <div class="form-group">
            <label>Forbidden Patterns</label>
            <p class="hint" style="margin-bottom:8px">Text patterns that should NOT appear in the article:</p>
            <div class="checkbox-group">
              ${DEFAULT_FORBIDDEN.map(p => `
                <label class="checkbox-label">
                  <input type="checkbox" ${s.forbiddenPatterns.includes(p) ? 'checked' : ''} 
                    onchange="togglePattern('${p.replace(/'/g, "\\'")}')" />
                  <code>${p}</code>
                </label>
              `).join('')}
            </div>
            <div style="margin-top:12px">
              <label>Additional forbidden patterns (one per line)</label>
              <textarea class="textarea" placeholder="Add custom patterns..."
                oninput="updateField('customForbiddenPatterns', this.value)">${s.customForbiddenPatterns}</textarea>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private _renderStep5(): string {
    const s = this._state;
    const eggs = '🥚'.repeat(s.workerCount);
    return `
      <div class="step-content fade-in">
        <h2>🥚 Workers & Output</h2>
        <p class="step-description">Configure parallel processing and output format.</p>
        
        <div class="form-group">
          <label>Number of Workers: <strong>${s.workerCount}</strong></label>
          <div class="slider-container">
            <span class="slider-label">1</span>
            <input type="range" class="slider" min="1" max="10" value="${s.workerCount}"
              oninput="updateField('workerCount', parseInt(this.value))" />
            <span class="slider-label">10</span>
          </div>
          <div style="text-align:center;font-size:28px;margin-top:12px;letter-spacing:6px">${eggs}</div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Output Format</label>
            <select class="select" onchange="updateField('outputFormat', this.value)">
              <option value="markdown" ${s.outputFormat === 'markdown' ? 'selected' : ''}>Markdown (.md)</option>
              <option value="html" ${s.outputFormat === 'html' ? 'selected' : ''}>HTML (.html)</option>
              <option value="text" ${s.outputFormat === 'text' ? 'selected' : ''}>Plain Text (.txt)</option>
              <option value="custom" ${s.outputFormat === 'custom' ? 'selected' : ''}>Custom...</option>
            </select>
            ${s.outputFormat === 'custom' ? `
              <input type="text" class="input" style="margin-top:8px" value="${s.customOutputFormat}"
                placeholder="Describe format..." oninput="updateField('customOutputFormat', this.value)" />
            ` : ''}
          </div>
          
          <div class="form-group">
            <label>Max Retries: <strong>${s.maxRetries}</strong></label>
            <div class="slider-container">
              <span class="slider-label">0</span>
              <input type="range" class="slider" min="0" max="5" value="${s.maxRetries}"
                oninput="updateField('maxRetries', parseInt(this.value))" />
              <span class="slider-label">5</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderStep6(): string {
    const s = this._state;
    const getValue = (field: string, custom: string, opts: any[]) => {
      const val = (s as any)[field];
      if (val === 'CUSTOM') return (s as any)[custom] || '(custom)';
      const opt = opts.find(o => o.value === val);
      return opt ? opt.label : val;
    };

    return `
      <div class="step-content fade-in">
        <h2>🚀 Review & Create</h2>
        <p class="step-description">Review your article project configuration.</p>
        
        <div class="review-card">
          <div class="review-section">
            <h3>📁 Project</h3>
            <div class="review-row"><span class="review-label">Codename:</span><span class="review-value">${s.projectCodename || '(not set)'}</span></div>
            <div class="review-row"><span class="review-label">Workers:</span><span class="review-value">${s.workerCount}</span></div>
          </div>
          
          <div class="review-section">
            <h3>💡 Topic</h3>
            <div class="review-row"><span class="review-label">Topic:</span><span class="review-value">${s.articleTopic || '(not set)'}</span></div>
            <div class="review-row"><span class="review-label">Purpose:</span><span class="review-value">${getValue('purpose', 'customPurpose', PURPOSES)}</span></div>
            <div class="review-row"><span class="review-label">Audience:</span><span class="review-value">${getValue('targetAudience', 'customAudience', AUDIENCES)}</span></div>
          </div>
          
          <div class="review-section">
            <h3>🎨 Style</h3>
            <div class="review-row"><span class="review-label">Tone:</span><span class="review-value">${getValue('tone', 'customTone', TONES)}</span></div>
            <div class="review-row"><span class="review-label">Length:</span><span class="review-value">${getValue('length', 'customLength', LENGTHS)}</span></div>
            <div class="review-row"><span class="review-label">Structure:</span><span class="review-value">${getValue('structure', 'customStructure', STRUCTURES)}</span></div>
            <div class="review-row"><span class="review-label">Language:</span><span class="review-value">${getValue('language', 'customLanguage', LANGUAGES)}</span></div>
          </div>
          
          <div class="review-section">
            <h3>✓ Quality</h3>
            <div class="review-row"><span class="review-label">Proofreading:</span><span class="review-value">${s.enableProofreading ? '✅ Enabled' : '❌ Disabled'}</span></div>
            <div class="review-row"><span class="review-label">Audit:</span><span class="review-value">${s.enableAudit ? '✅ ' + getValue('auditLevel', 'customAuditCriteria', AUDIT_LEVELS) : '❌ Disabled'}</span></div>
            ${s.enableAudit && s.forbiddenPatterns.length > 0 ? `
              <div class="review-row"><span class="review-label">Forbidden:</span><span class="review-value">${s.forbiddenPatterns.length} patterns</span></div>
            ` : ''}
          </div>
        </div>
        
        ${!s.isValid ? `
          <div class="validation-errors">
            <h4>⚠️ Please fix:</h4>
            <ul>${Object.values(s.errors).map(e => `<li>${e}</li>`).join('')}</ul>
          </div>
        ` : `
          <div class="ready-message">✅ Ready to create article project!</div>
        `}
      </div>
    `;
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export function showArticleWizard(context: vscode.ExtensionContext): void {
  ArticleWizardPanel.show(context.extensionUri);
}
