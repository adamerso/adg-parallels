/**
 * Adapter Generator Wizard (Meta-Adapter)
 * 
 * Multi-step wizard for creating new pipeline adapters.
 * This is a meta-adapter that generates XML adapter files.
 * 
 * Steps: Basic Info → Pipeline Stages → Stage Details → I/O Config → Output → Summary
 */

import * as vscode from 'vscode';
import { getBaseStyles, getNonce } from './shared';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const ADAPTER_TYPES = [
    { id: 'normal', label: 'Normal', icon: '📦', description: 'Standard processing pipeline' },
    { id: 'meta', label: 'Meta', icon: '🔮', description: 'Adapter that generates other adapters' },
    { id: 'audit', label: 'Audit-Heavy', icon: '🔍', description: 'Multiple review/audit stages' }
];

export const OUTPUT_FORMATS = [
    { id: 'text', label: 'Plain Text', icon: '📄' },
    { id: 'markdown', label: 'Markdown', icon: '📝' },
    { id: 'json', label: 'JSON', icon: '{}' },
    { id: 'code', label: 'Source Code', icon: '💻' },
    { id: 'xml', label: 'XML', icon: '📋' },
    { id: 'html', label: 'HTML', icon: '🌐' }
];

export const EXECUTORS = [
    { id: 'gpt-4o', label: 'GPT-4o', description: 'Best quality, slower', tier: 'premium' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Good balance of speed/quality', tier: 'standard' },
    { id: 'claude-sonnet', label: 'Claude Sonnet', description: 'Great for code and analysis', tier: 'premium' },
    { id: 'claude-opus', label: 'Claude Opus', description: 'Highest quality available', tier: 'enterprise' }
];

export const TASK_TYPES = [
    { id: 'generation', label: 'Generation', description: 'Create new content' },
    { id: 'transformation', label: 'Transformation', description: 'Transform existing content' },
    { id: 'analysis', label: 'Analysis', description: 'Analyze and extract insights' },
    { id: 'review', label: 'Review/Audit', description: 'Quality check and validation' },
    { id: 'synthesis', label: 'Synthesis', description: 'Combine multiple inputs' },
    { id: 'translation', label: 'Translation', description: 'Language or format translation' },
    { id: 'localization', label: 'Localization', description: 'Cultural adaptation' }
];

// ═══════════════════════════════════════════════════════════════════════════
// STAGE TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

export const STAGE_TEMPLATES = [
    {
        id: 'planning',
        name: 'Planning Stage',
        template: {
            name: 'during_planning',
            taskType: 'analysis',
            executor: 'gpt-4o',
            taskDescription: 'Analyze requirements and create execution plan',
            isAudit: false
        }
    },
    {
        id: 'generation',
        name: 'Generation Stage',
        template: {
            name: 'during_generation',
            taskType: 'generation',
            executor: 'gpt-4o',
            taskDescription: 'Generate the main content/output',
            isAudit: false
        }
    },
    {
        id: 'review',
        name: 'Review Stage',
        template: {
            name: 'during_review',
            taskType: 'review',
            executor: 'claude-sonnet',
            taskDescription: 'Review and validate the output',
            isAudit: true
        }
    },
    {
        id: 'refinement',
        name: 'Refinement Stage',
        template: {
            name: 'during_refinement',
            taskType: 'transformation',
            executor: 'gpt-4o',
            taskDescription: 'Apply improvements based on review feedback',
            isAudit: false
        }
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD STATE
// ═══════════════════════════════════════════════════════════════════════════

interface PipelineStage {
    id: number;
    name: string;
    taskType: string;
    executor: string;
    taskDescription: string;
    isAudit: boolean;
    isTerminal: boolean;
    inputs: Array<{ name: string; fromStage: string; description: string }>;
    outputInstructions: string;
    forbiddenPatterns: string[];
}

interface AdapterGeneratorState {
    currentStep: number;
    // Step 1: Basic Info
    adapterId: string;
    adapterName: string;
    adapterDescription: string;
    adapterType: string;
    outputFormat: string;
    // Step 2: Pipeline Overview
    stageCount: number;
    stages: PipelineStage[];
    // Step 3: Current stage being edited
    editingStageIndex: number;
    // Step 4: Output Config
    saveLocation: string;
    fileExtension: string;
    filenamePattern: string;
    // Step 5: Retry Config
    maxRetries: number;
    retryOnFail: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class AdapterGeneratorWizard {
    private panel: vscode.WebviewPanel | undefined;
    private state: AdapterGeneratorState;
    private readonly extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
        this.state = this.getInitialState();
    }

    private getInitialState(): AdapterGeneratorState {
        return {
            currentStep: 1,
            adapterId: '',
            adapterName: '',
            adapterDescription: '',
            adapterType: 'normal',
            outputFormat: 'markdown',
            stageCount: 4,
            stages: this.createDefaultStages(),
            editingStageIndex: -1,
            saveLocation: 'outputs/',
            fileExtension: '.md',
            filenamePattern: 'task_ID_output',
            maxRetries: 3,
            retryOnFail: true
        };
    }

    private createDefaultStages(): PipelineStage[] {
        return [
            {
                id: 1,
                name: 'unassigned',
                taskType: 'generation',
                executor: 'gpt-4o',
                taskDescription: 'Task awaiting assignment',
                isAudit: false,
                isTerminal: false,
                inputs: [],
                outputInstructions: '',
                forbiddenPatterns: []
            },
            {
                id: 2,
                name: 'during_processing',
                taskType: 'generation',
                executor: 'gpt-4o',
                taskDescription: 'Main processing stage',
                isAudit: false,
                isTerminal: false,
                inputs: [{ name: 'input', fromStage: 'initial', description: 'Initial input' }],
                outputInstructions: 'Generate output based on requirements',
                forbiddenPatterns: []
            },
            {
                id: 3,
                name: 'completed',
                taskType: 'generation',
                executor: 'gpt-4o',
                taskDescription: 'Processing completed successfully',
                isAudit: false,
                isTerminal: true,
                inputs: [],
                outputInstructions: '',
                forbiddenPatterns: []
            },
            {
                id: 4,
                name: 'failed',
                taskType: 'generation',
                executor: 'gpt-4o',
                taskDescription: 'Processing failed after max retries',
                isAudit: false,
                isTerminal: true,
                inputs: [],
                outputInstructions: '',
                forbiddenPatterns: []
            }
        ];
    }

    public show(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        // Direct values - avoid circular dependency with ADAPTER_REGISTRY
        
        this.panel = vscode.window.createWebviewPanel(
            'adapterGeneratorWizard',
            '🔧 Adapter Generator',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getHtml();
        
        this.panel.webview.onDidReceiveMessage(
            async (message) => await this.handleMessage(message),
            undefined
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }

    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'next':
                this.state = { ...this.state, ...message.data };
                this.state.currentStep++;
                this.updatePanel();
                break;
            case 'back':
                this.state.currentStep--;
                this.updatePanel();
                break;
            case 'submit':
                this.state = { ...this.state, ...message.data };
                await this.generateAdapter();
                break;
            case 'cancel':
                this.panel?.dispose();
                break;
            case 'addStage':
                this.addStage();
                this.updatePanel();
                break;
            case 'removeStage':
                this.removeStage(message.index);
                this.updatePanel();
                break;
            case 'editStage':
                this.state.editingStageIndex = message.index;
                this.updatePanel();
                break;
            case 'saveStage':
                this.saveStage(message.stageData);
                this.state.editingStageIndex = -1;
                this.updatePanel();
                break;
            case 'applyTemplate':
                this.applyTemplate(message.templateId, message.stageIndex);
                this.updatePanel();
                break;
            case 'updateStages':
                this.state.stages = message.stages;
                this.updatePanel();
                break;
        }
    }

    private addStage(): void {
        const newId = this.state.stages.length + 1;
        const insertIndex = this.state.stages.findIndex(s => s.name === 'completed');
        
        const newStage: PipelineStage = {
            id: newId,
            name: `stage_${newId}`,
            taskType: 'generation',
            executor: 'gpt-4o',
            taskDescription: 'New stage description',
            isAudit: false,
            isTerminal: false,
            inputs: [],
            outputInstructions: '',
            forbiddenPatterns: []
        };
        
        if (insertIndex >= 0) {
            this.state.stages.splice(insertIndex, 0, newStage);
        } else {
            this.state.stages.push(newStage);
        }
        
        // Renumber stages
        this.state.stages.forEach((s, i) => s.id = i + 1);
    }

    private removeStage(index: number): void {
        const stage = this.state.stages[index];
        if (stage.name === 'unassigned' || stage.name === 'completed' || stage.name === 'failed') {
            vscode.window.showWarningMessage('Cannot remove required stages (unassigned, completed, failed)');
            return;
        }
        this.state.stages.splice(index, 1);
        this.state.stages.forEach((s, i) => s.id = i + 1);
    }

    private saveStage(stageData: Partial<PipelineStage>): void {
        if (this.state.editingStageIndex >= 0) {
            this.state.stages[this.state.editingStageIndex] = {
                ...this.state.stages[this.state.editingStageIndex],
                ...stageData
            };
        }
    }

    private applyTemplate(templateId: string, stageIndex: number): void {
        const template = STAGE_TEMPLATES.find(t => t.id === templateId);
        if (template && stageIndex >= 0) {
            this.state.stages[stageIndex] = {
                ...this.state.stages[stageIndex],
                ...template.template
            };
        }
    }

    private updatePanel(): void {
        if (this.panel) {
            this.panel.webview.html = this.getHtml();
        }
    }

    private async generateAdapter(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        // Generate XML content
        const xmlContent = this.generateXml();
        
        // Save to resources/adapters
        const adapterPath = vscode.Uri.joinPath(
            workspaceFolders[0].uri, 
            'resources', 
            'adapters', 
            `${this.state.adapterId}.adapter.xml`
        );

        try {
            await vscode.workspace.fs.writeFile(adapterPath, Buffer.from(xmlContent));
            
            vscode.window.showInformationMessage(
                `✅ Adapter created: ${this.state.adapterId}.adapter.xml`,
                'Open File'
            ).then(selection => {
                if (selection === 'Open File') {
                    vscode.window.showTextDocument(adapterPath);
                }
            });
            
            this.panel?.dispose();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create adapter: ${error}`);
        }
    }

    private generateXml(): string {
        const escapeXml = (str: string) => str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        const generateStageXml = (stage: PipelineStage): string => {
            if (stage.isTerminal) {
                return `
        <!-- Stage ${stage.id}: ${stage.name} -->
        <stage id="${stage.id}" name="${stage.name}" is-terminal="true">
            <task-to-fulfill>
                ${escapeXml(stage.taskDescription)}
            </task-to-fulfill>
        </stage>`;
            }

            if (stage.name === 'unassigned') {
                return `
        <!-- Stage ${stage.id}: Unassigned -->
        <stage id="${stage.id}" name="unassigned">
            <task-to-fulfill>
                ${escapeXml(stage.taskDescription)}
            </task-to-fulfill>
            <next-stage>
                <routing>Automatically → next processing stage</routing>
            </next-stage>
        </stage>`;
            }

            return `
        <!-- Stage ${stage.id}: ${stage.name} -->
        <stage id="${stage.id}" name="${stage.name}"${stage.isAudit ? ' is-audit="true"' : ''}>
            <allowed-task-types>
                <type>${stage.taskType}</type>
                <type>CUSTOM</type>
            </allowed-task-types>
            <task-type>${stage.taskType}</task-type>
            
            <task-to-fulfill>
                ${escapeXml(stage.taskDescription)}
            </task-to-fulfill>
            
            <executor>${stage.executor}</executor>
            
            ${stage.inputs.length > 0 ? `<input>
                ${stage.inputs.map(inp => `<source name="${inp.name}" stage="${inp.fromStage}">
                    <description>${escapeXml(inp.description)}</description>
                </source>`).join('\n                ')}
            </input>` : ''}
            
            ${stage.outputInstructions ? `<output>
                <instructions>
                    ${escapeXml(stage.outputInstructions)}
                </instructions>
            </output>` : ''}
            
            ${stage.forbiddenPatterns.length > 0 ? `<forbidden-patterns>
                ${stage.forbiddenPatterns.map(p => `<pattern reason="custom">${escapeXml(p)}</pattern>`).join('\n                ')}
            </forbidden-patterns>` : ''}
            
            ${stage.isAudit ? `<audit-result>
                <pass-criteria>Quality meets requirements</pass-criteria>
                <on-pass>
                    <routing>→ completed</routing>
                </on-pass>
                <on-fail>
                    <routing>→ previous stage for revision</routing>
                </on-fail>
            </audit-result>` : `<next-stage>
                <routing>→ next stage</routing>
            </next-stage>`}
        </stage>`;
        };

        return `<?xml version="1.0" encoding="UTF-8"?>
<!--
    ADG-Parallels v0.3.0 - Pipeline Adapter
    ${this.state.adapterName}
    
    Generated by Adapter Generator Wizard
    Created: ${new Date().toISOString()}
-->
<adapter xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="../schemas/adapter.xsd">
    
    <!-- METADATA -->
    <metadata>
        <id>${this.state.adapterId}</id>
        <name>${escapeXml(this.state.adapterName)}</name>
        <version>1.0.0</version>
        <description>${escapeXml(this.state.adapterDescription)}</description>
    </metadata>
    
    <!-- ADAPTER TYPE -->
    <allowed-adapter-types>
        <type>normal</type>
        <type>meta</type>
        <type>CUSTOM</type>
    </allowed-adapter-types>
    <adapter-type>${this.state.adapterType}</adapter-type>
    
    <!-- OUTPUT FORMAT -->
    <allowed-output-formats>
        <format>text</format>
        <format>markdown</format>
        <format>json</format>
        <format>code</format>
        <format>CUSTOM</format>
    </allowed-output-formats>
    <output-format>${this.state.outputFormat}</output-format>
    
    <!-- PIPELINE DEFINITION -->
    <pipeline>
        ${this.state.stages.map(generateStageXml).join('\n')}
    </pipeline>
    
    <!-- OUTPUT CONFIGURATION -->
    <output-config>
        <save-location>${this.state.saveLocation}</save-location>
        <file-extension>${this.state.fileExtension}</file-extension>
        <filename-pattern>
            <instructions>
                ${escapeXml(this.state.filenamePattern)}
            </instructions>
        </filename-pattern>
    </output-config>
    
    <!-- RETRY CONFIGURATION -->
    <retry-config>
        <max-retries>${this.state.maxRetries}</max-retries>
        <retry-on-fail>${this.state.retryOnFail}</retry-on-fail>
        <backoff-strategy>linear</backoff-strategy>
    </retry-config>
    
</adapter>`;
    }

    private getHtml(): string {
        const nonce = getNonce();
        const steps = ['Info', 'Stages', 'Details', 'Output', 'Config', 'Generate'];
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Adapter Generator</title>
    <style>
        ${getBaseStyles()}
        
        .type-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
        }
        
        .type-card {
            padding: 20px;
            text-align: center;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .type-card:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .type-card.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .type-icon {
            font-size: 36px;
            margin-bottom: 12px;
        }
        
        .format-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 12px;
            margin-top: 16px;
        }
        
        .format-card {
            padding: 12px;
            text-align: center;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
        }
        
        .format-card:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .format-card.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .pipeline-visual {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            padding: 20px;
            background: var(--vscode-textCodeBlock-background);
            border-radius: 8px;
            margin: 20px 0;
        }
        
        .stage-node {
            padding: 12px 16px;
            background: var(--vscode-button-secondaryBackground);
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            min-width: 120px;
            text-align: center;
        }
        
        .stage-node:hover {
            border-color: var(--vscode-focusBorder);
            transform: translateY(-2px);
        }
        
        .stage-node.terminal {
            background: var(--vscode-inputValidation-infoBackground);
        }
        
        .stage-node.audit {
            border-color: var(--vscode-charts-orange);
        }
        
        .stage-arrow {
            font-size: 20px;
            color: var(--vscode-foreground);
            opacity: 0.5;
        }
        
        .stage-editor {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin-top: 20px;
        }
        
        .stage-editor h3 {
            margin-top: 0;
        }
        
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 16px;
        }
        
        .executor-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
        }
        
        .executor-card {
            padding: 10px;
            text-align: center;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
        }
        
        .executor-card:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .executor-card.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .checkbox-inline {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .checkbox-inline input[type="checkbox"] {
            width: 18px;
            height: 18px;
        }
        
        .templates-bar {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
        }
        
        .template-btn {
            padding: 6px 12px;
            background: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        
        .template-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
        }
        
        .summary-section {
            background: var(--vscode-textCodeBlock-background);
            padding: 16px;
            border-radius: 8px;
        }
        
        .summary-section h4 {
            margin: 0 0 12px 0;
            color: var(--vscode-textLink-foreground);
        }
        
        .xml-preview {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 16px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            max-height: 300px;
            overflow: auto;
            white-space: pre-wrap;
        }
        
        .add-stage-btn {
            padding: 12px 16px;
            background: var(--vscode-button-secondaryBackground);
            border: 2px dashed var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        
        .add-stage-btn:hover {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="wizard-container">
        <div class="wizard-header">
            <h1>🧬 Adapter Generator</h1>
            <p>Create a new pipeline adapter XML file</p>
        </div>
        
        <div class="progress-bar">
            ${steps.map((step, i) => `
                <div class="progress-step ${i + 1 === this.state.currentStep ? 'active' : ''} ${i + 1 < this.state.currentStep ? 'completed' : ''}">
                    <div class="step-number">${i + 1 < this.state.currentStep ? '✓' : i + 1}</div>
                    <div class="step-label">${step}</div>
                </div>
            `).join('')}
        </div>
        
        <div class="wizard-content">
            ${this.renderCurrentStep()}
        </div>
        
        <div class="wizard-footer">
            <button class="btn btn-secondary" onclick="cancel()">Cancel</button>
            <div>
                ${this.state.currentStep > 1 ? '<button class="btn btn-secondary" onclick="back()">← Back</button>' : ''}
                ${this.state.currentStep < 6 ? 
                    '<button class="btn btn-primary" onclick="next()">Next →</button>' : 
                    '<button class="btn btn-primary" onclick="submit()">🧬 Generate Adapter</button>'}
            </div>
        </div>
    </div>
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let state = ${JSON.stringify(this.state)};
        
        function selectType(type, value) {
            state[type] = value;
            document.querySelectorAll('.' + type + '-card').forEach(card => {
                card.classList.toggle('selected', card.dataset.value === value);
            });
        }
        
        function editStage(index) {
            vscode.postMessage({ command: 'editStage', index });
        }
        
        function addStage() {
            vscode.postMessage({ command: 'addStage' });
        }
        
        function removeStage(index) {
            vscode.postMessage({ command: 'removeStage', index });
        }
        
        function applyTemplate(templateId) {
            vscode.postMessage({ command: 'applyTemplate', templateId, stageIndex: state.editingStageIndex });
        }
        
        function saveStage() {
            const stageData = {
                name: document.getElementById('stageName').value,
                taskType: document.getElementById('stageTaskType').value,
                executor: state.stages[state.editingStageIndex]?.executor || 'gpt-4o',
                taskDescription: document.getElementById('stageDescription').value,
                isAudit: document.getElementById('stageIsAudit').checked,
                outputInstructions: document.getElementById('stageOutputInstructions')?.value || ''
            };
            vscode.postMessage({ command: 'saveStage', stageData });
        }
        
        function selectExecutor(executor) {
            if (state.editingStageIndex >= 0) {
                state.stages[state.editingStageIndex].executor = executor;
            }
            document.querySelectorAll('.executor-card').forEach(card => {
                card.classList.toggle('selected', card.dataset.executor === executor);
            });
        }
        
        function next() {
            collectData();
            vscode.postMessage({ command: 'next', data: state });
        }
        
        function back() {
            vscode.postMessage({ command: 'back' });
        }
        
        function submit() {
            collectData();
            vscode.postMessage({ command: 'submit', data: state });
        }
        
        function cancel() {
            vscode.postMessage({ command: 'cancel' });
        }
        
        function collectData() {
            const adapterId = document.getElementById('adapterId');
            if (adapterId) state.adapterId = adapterId.value;
            
            const adapterName = document.getElementById('adapterName');
            if (adapterName) state.adapterName = adapterName.value;
            
            const adapterDescription = document.getElementById('adapterDescription');
            if (adapterDescription) state.adapterDescription = adapterDescription.value;
            
            const saveLocation = document.getElementById('saveLocation');
            if (saveLocation) state.saveLocation = saveLocation.value;
            
            const fileExtension = document.getElementById('fileExtension');
            if (fileExtension) state.fileExtension = fileExtension.value;
            
            const filenamePattern = document.getElementById('filenamePattern');
            if (filenamePattern) state.filenamePattern = filenamePattern.value;
            
            const maxRetries = document.getElementById('maxRetries');
            if (maxRetries) state.maxRetries = parseInt(maxRetries.value);
            
            const retryOnFail = document.getElementById('retryOnFail');
            if (retryOnFail) state.retryOnFail = retryOnFail.checked;
        }
    </script>
</body>
</html>`;
    }

    private renderCurrentStep(): string {
        switch (this.state.currentStep) {
            case 1: return this.renderStep1();
            case 2: return this.renderStep2();
            case 3: return this.renderStep3();
            case 4: return this.renderStep4();
            case 5: return this.renderStep5();
            case 6: return this.renderSummary();
            default: return '';
        }
    }

    private renderStep1(): string {
        return `
            <div class="step-content">
                <h2>Step 1: Basic Information</h2>
                <p>Define the basic properties of your adapter.</p>
                
                <div class="form-row">
                    <div>
                        <label>Adapter ID</label>
                        <input type="text" id="adapterId" class="form-input" 
                               placeholder="my-adapter (kebab-case)"
                               value="${this.state.adapterId || ''}"
                               pattern="[a-z0-9-]+">
                        <small style="opacity: 0.7;">Used in filenames and code references</small>
                    </div>
                    <div>
                        <label>Adapter Name</label>
                        <input type="text" id="adapterName" class="form-input" 
                               placeholder="My Custom Adapter"
                               value="${this.state.adapterName || ''}">
                        <small style="opacity: 0.7;">Human-readable display name</small>
                    </div>
                </div>
                
                <div>
                    <label>Description</label>
                    <textarea id="adapterDescription" class="form-input" rows="2"
                        placeholder="Describe what this adapter does...">${this.state.adapterDescription || ''}</textarea>
                </div>
                
                <h3 style="margin-top: 24px;">Adapter Type</h3>
                <div class="type-grid">
                    ${ADAPTER_TYPES.map(type => `
                        <div class="type-card adapterType-card ${this.state.adapterType === type.id ? 'selected' : ''}"
                             data-value="${type.id}"
                             onclick="selectType('adapterType', '${type.id}')">
                            <div class="type-icon">${type.icon}</div>
                            <div><strong>${type.label}</strong></div>
                            <small style="opacity: 0.7;">${type.description}</small>
                        </div>
                    `).join('')}
                </div>
                
                <h3 style="margin-top: 24px;">Output Format</h3>
                <div class="format-grid">
                    ${OUTPUT_FORMATS.map(fmt => `
                        <div class="format-card outputFormat-card ${this.state.outputFormat === fmt.id ? 'selected' : ''}"
                             data-value="${fmt.id}"
                             onclick="selectType('outputFormat', '${fmt.id}')">
                            <div style="font-size: 20px;">${fmt.icon}</div>
                            <div>${fmt.label}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    private renderStep2(): string {
        return `
            <div class="step-content">
                <h2>Step 2: Pipeline Stages</h2>
                <p>Design your processing pipeline. Click on a stage to edit it.</p>
                
                <div class="pipeline-visual">
                    ${this.state.stages.map((stage, idx) => `
                        ${idx > 0 ? '<span class="stage-arrow">→</span>' : ''}
                        <div class="stage-node ${stage.isTerminal ? 'terminal' : ''} ${stage.isAudit ? 'audit' : ''}"
                             onclick="editStage(${idx})"
                             title="Click to edit">
                            <div><strong>${stage.name}</strong></div>
                            <small style="opacity: 0.7;">${stage.taskType}</small>
                            ${stage.isAudit ? '<div style="font-size: 10px; color: orange;">🔍 audit</div>' : ''}
                        </div>
                    `).join('')}
                    
                    <div class="add-stage-btn" onclick="addStage()">
                        <span>➕</span> Add Stage
                    </div>
                </div>
                
                <div style="background: var(--vscode-inputValidation-infoBackground); padding: 12px; border-radius: 8px;">
                    <strong>💡 Tips:</strong>
                    <ul style="margin: 8px 0 0 0; padding-left: 20px;">
                        <li>Every pipeline needs <code>unassigned</code>, <code>completed</code>, and <code>failed</code> stages</li>
                        <li>Audit stages can route back to previous stages on failure</li>
                        <li>Click a stage to edit its details in Step 3</li>
                    </ul>
                </div>
            </div>
        `;
    }

    private renderStep3(): string {
        const editingStage = this.state.editingStageIndex >= 0 
            ? this.state.stages[this.state.editingStageIndex] 
            : null;

        if (!editingStage) {
            return `
                <div class="step-content">
                    <h2>Step 3: Stage Details</h2>
                    <p>Select a stage from Step 2 to edit its details, or continue to the next step.</p>
                    
                    <div style="text-align: center; padding: 40px; opacity: 0.6;">
                        <div style="font-size: 48px;">📋</div>
                        <p>No stage selected for editing.</p>
                        <p>Go back to Step 2 and click on a stage to configure it.</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="step-content">
                <h2>Step 3: Edit Stage - ${editingStage.name}</h2>
                
                <div class="templates-bar">
                    <span style="opacity: 0.7;">Apply template:</span>
                    ${STAGE_TEMPLATES.map(t => `
                        <button class="template-btn" onclick="applyTemplate('${t.id}')">${t.name}</button>
                    `).join('')}
                </div>
                
                <div class="stage-editor">
                    <div class="form-row">
                        <div>
                            <label>Stage Name</label>
                            <input type="text" id="stageName" class="form-input" 
                                   value="${editingStage.name}"
                                   ${editingStage.name === 'unassigned' || editingStage.name === 'completed' || editingStage.name === 'failed' ? 'readonly' : ''}>
                        </div>
                        <div>
                            <label>Task Type</label>
                            <select id="stageTaskType" class="form-input">
                                ${TASK_TYPES.map(t => `
                                    <option value="${t.id}" ${editingStage.taskType === t.id ? 'selected' : ''}>${t.label}</option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                    
                    ${!editingStage.isTerminal ? `
                        <div>
                            <label>Executor (AI Model)</label>
                            <div class="executor-grid">
                                ${EXECUTORS.map(e => `
                                    <div class="executor-card ${editingStage.executor === e.id ? 'selected' : ''}"
                                         data-executor="${e.id}"
                                         onclick="selectExecutor('${e.id}')">
                                        <strong>${e.label}</strong><br>
                                        <small style="opacity: 0.7;">${e.description}</small>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div style="margin-top: 16px;">
                        <label>Task Description</label>
                        <textarea id="stageDescription" class="form-input" rows="3">${editingStage.taskDescription}</textarea>
                    </div>
                    
                    ${!editingStage.isTerminal ? `
                        <div style="margin-top: 16px;">
                            <label>Output Instructions (optional)</label>
                            <textarea id="stageOutputInstructions" class="form-input" rows="3"
                                placeholder="Instructions for output format...">${editingStage.outputInstructions || ''}</textarea>
                        </div>
                        
                        <div style="margin-top: 16px;">
                            <label class="checkbox-inline">
                                <input type="checkbox" id="stageIsAudit" ${editingStage.isAudit ? 'checked' : ''}>
                                <span>This is an audit/review stage (can reject and route back)</span>
                            </label>
                        </div>
                    ` : ''}
                    
                    <div style="margin-top: 20px; display: flex; gap: 12px;">
                        <button class="btn btn-primary" onclick="saveStage()">💾 Save Stage</button>
                        ${editingStage.name !== 'unassigned' && editingStage.name !== 'completed' && editingStage.name !== 'failed' ? 
                            `<button class="btn btn-secondary" onclick="removeStage(${this.state.editingStageIndex})">🗑️ Remove Stage</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    private renderStep4(): string {
        return `
            <div class="step-content">
                <h2>Step 4: Output Configuration</h2>
                <p>Configure how outputs are saved.</p>
                
                <div class="form-row">
                    <div>
                        <label>Save Location</label>
                        <input type="text" id="saveLocation" class="form-input" 
                               value="${this.state.saveLocation}"
                               placeholder="outputs/">
                        <small style="opacity: 0.7;">Relative path from project root</small>
                    </div>
                    <div>
                        <label>File Extension</label>
                        <input type="text" id="fileExtension" class="form-input" 
                               value="${this.state.fileExtension}"
                               placeholder=".md">
                    </div>
                </div>
                
                <div>
                    <label>Filename Pattern</label>
                    <input type="text" id="filenamePattern" class="form-input" 
                           value="${this.state.filenamePattern}"
                           placeholder="task_ID_output">
                    <small style="opacity: 0.7;">Use task_ID as placeholder for task identifier</small>
                </div>
            </div>
        `;
    }

    private renderStep5(): string {
        return `
            <div class="step-content">
                <h2>Step 5: Retry Configuration</h2>
                <p>Configure retry behavior for failed stages.</p>
                
                <div class="form-row">
                    <div>
                        <label>Maximum Retries</label>
                        <input type="number" id="maxRetries" class="form-input" 
                               value="${this.state.maxRetries}"
                               min="0" max="10">
                    </div>
                    <div style="display: flex; align-items: center;">
                        <label class="checkbox-inline">
                            <input type="checkbox" id="retryOnFail" ${this.state.retryOnFail ? 'checked' : ''}>
                            <span>Enable automatic retry on failure</span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    private renderSummary(): string {
        const typeInfo = ADAPTER_TYPES.find(t => t.id === this.state.adapterType);
        const formatInfo = OUTPUT_FORMATS.find(f => f.id === this.state.outputFormat);
        const processingStages = this.state.stages.filter(s => !s.isTerminal && s.name !== 'unassigned');

        return `
            <div class="step-content">
                <h2>Step 6: Review & Generate</h2>
                <p>Review your adapter configuration before generating the XML file.</p>
                
                <div class="summary-grid">
                    <div class="summary-section">
                        <h4>📋 Basic Info</h4>
                        <div><strong>ID:</strong> ${this.state.adapterId || '(not set)'}</div>
                        <div><strong>Name:</strong> ${this.state.adapterName || '(not set)'}</div>
                        <div><strong>Type:</strong> ${typeInfo?.icon} ${typeInfo?.label}</div>
                        <div><strong>Format:</strong> ${formatInfo?.icon} ${formatInfo?.label}</div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>🔄 Pipeline</h4>
                        <div><strong>${this.state.stages.length}</strong> total stages</div>
                        <div><strong>${processingStages.length}</strong> processing stages</div>
                        <div><strong>${this.state.stages.filter(s => s.isAudit).length}</strong> audit stages</div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>💾 Output</h4>
                        <div><strong>Location:</strong> ${this.state.saveLocation}</div>
                        <div><strong>Extension:</strong> ${this.state.fileExtension}</div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>🔁 Retry</h4>
                        <div><strong>Max retries:</strong> ${this.state.maxRetries}</div>
                        <div><strong>Auto-retry:</strong> ${this.state.retryOnFail ? '✅ Enabled' : '❌ Disabled'}</div>
                    </div>
                </div>
                
                <h3 style="margin-top: 24px;">Pipeline Preview</h3>
                <div class="pipeline-visual">
                    ${this.state.stages.map((stage, idx) => `
                        ${idx > 0 ? '<span class="stage-arrow">→</span>' : ''}
                        <div class="stage-node ${stage.isTerminal ? 'terminal' : ''} ${stage.isAudit ? 'audit' : ''}">
                            <div><strong>${stage.name}</strong></div>
                            <small>${stage.executor}</small>
                        </div>
                    `).join('')}
                </div>
                
                <div style="background: var(--vscode-inputValidation-infoBackground); padding: 16px; border-radius: 8px; margin-top: 20px;">
                    <strong>📁 Output file:</strong><br>
                    <code>resources/adapters/${this.state.adapterId || 'my-adapter'}.adapter.xml</code>
                </div>
            </div>
        `;
    }
}
