/**
 * Code Generation Wizard
 * 
 * Multi-step wizard for configuring code generation projects.
 * Steps: Language/Framework → Task Description → Code Style → Testing → Review Config → Summary
 */

import * as vscode from 'vscode';
import { getBaseStyles, getNonce } from './shared';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const LANGUAGES = [
    { id: 'typescript', label: 'TypeScript', icon: '🔷' },
    { id: 'javascript', label: 'JavaScript', icon: '🟡' },
    { id: 'python', label: 'Python', icon: '🐍' },
    { id: 'java', label: 'Java', icon: '☕' },
    { id: 'csharp', label: 'C#', icon: '🟣' },
    { id: 'go', label: 'Go', icon: '🔵' },
    { id: 'rust', label: 'Rust', icon: '🦀' },
    { id: 'cpp', label: 'C++', icon: '⚡' },
    { id: 'php', label: 'PHP', icon: '🐘' },
    { id: 'ruby', label: 'Ruby', icon: '💎' },
    { id: 'kotlin', label: 'Kotlin', icon: '🟠' },
    { id: 'swift', label: 'Swift', icon: '🍎' }
];

export const FRAMEWORKS = {
    typescript: [
        { id: 'none', label: 'Vanilla TypeScript' },
        { id: 'react', label: 'React' },
        { id: 'angular', label: 'Angular' },
        { id: 'vue', label: 'Vue.js' },
        { id: 'node', label: 'Node.js' },
        { id: 'express', label: 'Express.js' },
        { id: 'nestjs', label: 'NestJS' },
        { id: 'nextjs', label: 'Next.js' }
    ],
    javascript: [
        { id: 'none', label: 'Vanilla JavaScript' },
        { id: 'react', label: 'React' },
        { id: 'vue', label: 'Vue.js' },
        { id: 'node', label: 'Node.js' },
        { id: 'express', label: 'Express.js' }
    ],
    python: [
        { id: 'none', label: 'Vanilla Python' },
        { id: 'django', label: 'Django' },
        { id: 'flask', label: 'Flask' },
        { id: 'fastapi', label: 'FastAPI' },
        { id: 'pytorch', label: 'PyTorch' },
        { id: 'tensorflow', label: 'TensorFlow' }
    ],
    java: [
        { id: 'none', label: 'Vanilla Java' },
        { id: 'spring', label: 'Spring Boot' },
        { id: 'quarkus', label: 'Quarkus' }
    ],
    csharp: [
        { id: 'none', label: 'Vanilla C#' },
        { id: 'aspnet', label: 'ASP.NET Core' },
        { id: 'blazor', label: 'Blazor' }
    ],
    go: [
        { id: 'none', label: 'Vanilla Go' },
        { id: 'gin', label: 'Gin' },
        { id: 'echo', label: 'Echo' }
    ],
    rust: [
        { id: 'none', label: 'Vanilla Rust' },
        { id: 'actix', label: 'Actix Web' },
        { id: 'tokio', label: 'Tokio' }
    ],
    cpp: [
        { id: 'none', label: 'Vanilla C++' },
        { id: 'qt', label: 'Qt' },
        { id: 'boost', label: 'Boost' }
    ],
    php: [
        { id: 'none', label: 'Vanilla PHP' },
        { id: 'laravel', label: 'Laravel' },
        { id: 'symfony', label: 'Symfony' }
    ],
    ruby: [
        { id: 'none', label: 'Vanilla Ruby' },
        { id: 'rails', label: 'Ruby on Rails' },
        { id: 'sinatra', label: 'Sinatra' }
    ],
    kotlin: [
        { id: 'none', label: 'Vanilla Kotlin' },
        { id: 'ktor', label: 'Ktor' },
        { id: 'android', label: 'Android' }
    ],
    swift: [
        { id: 'none', label: 'Vanilla Swift' },
        { id: 'swiftui', label: 'SwiftUI' },
        { id: 'vapor', label: 'Vapor' }
    ]
};

export const CODE_TASKS = [
    { id: 'function', label: 'Single Function / Utility', icon: '🔧', description: 'Implement a single function or helper utility' },
    { id: 'class', label: 'Class / Module', icon: '📦', description: 'Create a class or module with methods' },
    { id: 'api-endpoint', label: 'API Endpoint', icon: '🌐', description: 'Implement REST/GraphQL endpoint' },
    { id: 'data-model', label: 'Data Model', icon: '💾', description: 'Design data structures and models' },
    { id: 'algorithm', label: 'Algorithm', icon: '🧮', description: 'Implement a specific algorithm' },
    { id: 'cli', label: 'CLI Tool', icon: '⌨️', description: 'Command-line interface tool' },
    { id: 'script', label: 'Script / Automation', icon: '🤖', description: 'Automation or processing script' },
    { id: 'refactor', label: 'Refactoring', icon: '♻️', description: 'Refactor existing code' },
    { id: 'fix', label: 'Bug Fix', icon: '🐛', description: 'Fix a bug or issue' }
];

export const CODE_STYLES = [
    { id: 'clean', label: 'Clean Code', description: 'Readable, well-structured, follows SOLID principles' },
    { id: 'functional', label: 'Functional', description: 'Immutable, pure functions, composition' },
    { id: 'oop', label: 'Object-Oriented', description: 'Classes, inheritance, encapsulation' },
    { id: 'minimal', label: 'Minimal', description: 'Concise, pragmatic, least code needed' },
    { id: 'defensive', label: 'Defensive', description: 'Extensive validation, error handling' },
    { id: 'performance', label: 'Performance-First', description: 'Optimized for speed and memory' }
];

export const TESTING_LEVELS = [
    { id: 'none', label: 'No Tests', description: 'Generate code without tests' },
    { id: 'basic', label: 'Basic Tests', description: 'Happy path tests only' },
    { id: 'full', label: 'Full Coverage', description: 'Unit tests with edge cases' },
    { id: 'tdd', label: 'TDD Style', description: 'Tests first, then implementation' }
];

export const REVIEW_LEVELS = [
    { id: 'none', label: 'No Review', description: 'Skip code review stage' },
    { id: 'quick', label: 'Quick Review', description: 'Basic quality check' },
    { id: 'standard', label: 'Standard Review', description: 'Full code review with suggestions' },
    { id: 'strict', label: 'Strict Review', description: 'Thorough review, may request changes' }
];

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD STATE
// ═══════════════════════════════════════════════════════════════════════════

interface CodeGenerationWizardState {
    currentStep: number;
    // Step 1: Language & Framework
    language: string;
    framework: string;
    // Step 2: Task Description
    taskType: string;
    taskDescription: string;
    existingCode?: string;
    // Step 3: Code Style
    codeStyle: string;
    namingConvention: 'camelCase' | 'snake_case' | 'PascalCase';
    includeComments: boolean;
    includeDocstrings: boolean;
    // Step 4: Testing
    testingLevel: string;
    testingFramework?: string;
    // Step 5: Review Config
    reviewLevel: string;
    workerCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class CodeGenerationWizard {
    private panel: vscode.WebviewPanel | undefined;
    private state: CodeGenerationWizardState;
    private readonly extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
        this.state = {
            currentStep: 1,
            language: 'typescript',
            framework: 'none',
            taskType: 'function',
            taskDescription: '',
            codeStyle: 'clean',
            namingConvention: 'camelCase',
            includeComments: true,
            includeDocstrings: true,
            testingLevel: 'basic',
            reviewLevel: 'standard',
            workerCount: 3
        };
    }

    public show(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        
        this.panel = vscode.window.createWebviewPanel(
            'codeGenerationWizard',
            '💻 Code Generator Wizard',
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
                await this.createProject();
                break;
            case 'cancel':
                this.panel?.dispose();
                break;
        }
    }

    private updatePanel(): void {
        if (this.panel) {
            this.panel.webview.html = this.getHtml();
        }
    }

    private async createProject(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const projectName = `code-gen-${Date.now()}`;
        const projectPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.adg-local-no-repo', 'projects', projectName);

        // Create project structure
        const configContent = {
            adapterId: 'code-generation',
            created: new Date().toISOString(),
            config: this.state
        };

        try {
            await vscode.workspace.fs.createDirectory(projectPath);
            await vscode.workspace.fs.writeFile(
                vscode.Uri.joinPath(projectPath, 'config.json'),
                Buffer.from(JSON.stringify(configContent, null, 2))
            );
            
            vscode.window.showInformationMessage(`✅ Code generation project created: ${projectName}`);
            this.panel?.dispose();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create project: ${error}`);
        }
    }

    private getHtml(): string {
        const nonce = getNonce();
        const steps = ['Language', 'Task', 'Style', 'Testing', 'Review', 'Summary'];
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Code Generation Wizard</title>
    <style>
        ${getBaseStyles()}
        
        .language-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
        }
        
        .language-card {
            padding: 16px;
            text-align: center;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .language-card:hover {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-hoverBackground);
        }
        
        .language-card.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .language-icon {
            font-size: 32px;
            margin-bottom: 8px;
        }
        
        .framework-select {
            margin-top: 20px;
        }
        
        .task-cards {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        }
        
        .task-card {
            padding: 16px;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .task-card:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .task-card.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .task-icon {
            font-size: 24px;
            margin-right: 8px;
        }
        
        .style-options {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .style-option {
            display: flex;
            align-items: center;
            padding: 12px;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
        }
        
        .style-option:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .style-option.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .code-block {
            background: var(--vscode-textCodeBlock-background);
            padding: 8px 12px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            margin-top: 8px;
        }
        
        .checkbox-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 20px;
        }
        
        .checkbox-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .checkbox-item input[type="checkbox"] {
            width: 18px;
            height: 18px;
        }
        
        .summary-section {
            background: var(--vscode-textCodeBlock-background);
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 16px;
        }
        
        .summary-section h4 {
            margin: 0 0 8px 0;
            color: var(--vscode-textLink-foreground);
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
        }
    </style>
</head>
<body>
    <div class="wizard-container">
        <div class="wizard-header">
            <h1>💻 Code Generation Wizard</h1>
            <p>Configure your code generation project with review pipeline</p>
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
                    '<button class="btn btn-primary" onclick="submit()">🚀 Create Project</button>'}
            </div>
        </div>
    </div>
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let state = ${JSON.stringify(this.state)};
        
        const FRAMEWORKS = ${JSON.stringify(FRAMEWORKS)};
        
        function selectLanguage(langId) {
            state.language = langId;
            state.framework = 'none';
            document.querySelectorAll('.language-card').forEach(card => {
                card.classList.toggle('selected', card.dataset.lang === langId);
            });
            updateFrameworkOptions();
        }
        
        function updateFrameworkOptions() {
            const frameworks = FRAMEWORKS[state.language] || [];
            const select = document.getElementById('frameworkSelect');
            if (select) {
                select.innerHTML = frameworks.map(f => 
                    '<option value="' + f.id + '"' + (f.id === state.framework ? ' selected' : '') + '>' + f.label + '</option>'
                ).join('');
            }
        }
        
        function selectTaskType(taskId) {
            state.taskType = taskId;
            document.querySelectorAll('.task-card').forEach(card => {
                card.classList.toggle('selected', card.dataset.task === taskId);
            });
        }
        
        function selectOption(type, value) {
            state[type] = value;
            document.querySelectorAll('.' + type + '-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.value === value);
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
            const frameworkSelect = document.getElementById('frameworkSelect');
            if (frameworkSelect) state.framework = frameworkSelect.value;
            
            const taskDesc = document.getElementById('taskDescription');
            if (taskDesc) state.taskDescription = taskDesc.value;
            
            const existingCode = document.getElementById('existingCode');
            if (existingCode) state.existingCode = existingCode.value;
            
            const includeComments = document.getElementById('includeComments');
            if (includeComments) state.includeComments = includeComments.checked;
            
            const includeDocstrings = document.getElementById('includeDocstrings');
            if (includeDocstrings) state.includeDocstrings = includeDocstrings.checked;
            
            const namingConvention = document.getElementById('namingConvention');
            if (namingConvention) state.namingConvention = namingConvention.value;
            
            const testingFramework = document.getElementById('testingFramework');
            if (testingFramework) state.testingFramework = testingFramework.value;
            
            const workerCount = document.getElementById('workerCount');
            if (workerCount) state.workerCount = parseInt(workerCount.value);
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
                <h2>Step 1: Select Language & Framework</h2>
                <p>Choose the programming language and framework for your code generation task.</p>
                
                <h3>Language</h3>
                <div class="language-grid">
                    ${LANGUAGES.map(lang => `
                        <div class="language-card ${this.state.language === lang.id ? 'selected' : ''}" 
                             data-lang="${lang.id}" 
                             onclick="selectLanguage('${lang.id}')">
                            <div class="language-icon">${lang.icon}</div>
                            <div>${lang.label}</div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="framework-select">
                    <h3>Framework (optional)</h3>
                    <select id="frameworkSelect" class="form-input">
                        ${(FRAMEWORKS[this.state.language as keyof typeof FRAMEWORKS] || []).map(f => `
                            <option value="${f.id}" ${this.state.framework === f.id ? 'selected' : ''}>${f.label}</option>
                        `).join('')}
                    </select>
                </div>
            </div>
        `;
    }

    private renderStep2(): string {
        return `
            <div class="step-content">
                <h2>Step 2: Describe Your Task</h2>
                <p>What type of code do you want to generate?</p>
                
                <div class="task-cards">
                    ${CODE_TASKS.map(task => `
                        <div class="task-card ${this.state.taskType === task.id ? 'selected' : ''}"
                             data-task="${task.id}"
                             onclick="selectTaskType('${task.id}')">
                            <div><span class="task-icon">${task.icon}</span>${task.label}</div>
                            <small style="opacity: 0.7;">${task.description}</small>
                        </div>
                    `).join('')}
                </div>
                
                <h3 style="margin-top: 24px;">Task Description</h3>
                <textarea id="taskDescription" class="form-input" rows="4" 
                    placeholder="Describe what you want to generate...">${this.state.taskDescription || ''}</textarea>
                
                <h3 style="margin-top: 16px;">Existing Code (optional)</h3>
                <textarea id="existingCode" class="form-input" rows="4" 
                    placeholder="Paste existing code to refactor or extend...">${this.state.existingCode || ''}</textarea>
            </div>
        `;
    }

    private renderStep3(): string {
        return `
            <div class="step-content">
                <h2>Step 3: Code Style Preferences</h2>
                <p>How should the generated code be structured?</p>
                
                <div class="style-options">
                    ${CODE_STYLES.map(style => `
                        <div class="style-option codeStyle-option ${this.state.codeStyle === style.id ? 'selected' : ''}"
                             data-value="${style.id}"
                             onclick="selectOption('codeStyle', '${style.id}')">
                            <div>
                                <strong>${style.label}</strong><br>
                                <small style="opacity: 0.7;">${style.description}</small>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <h3 style="margin-top: 24px;">Naming Convention</h3>
                <select id="namingConvention" class="form-input">
                    <option value="camelCase" ${this.state.namingConvention === 'camelCase' ? 'selected' : ''}>camelCase (JavaScript/TypeScript)</option>
                    <option value="snake_case" ${this.state.namingConvention === 'snake_case' ? 'selected' : ''}>snake_case (Python/Rust)</option>
                    <option value="PascalCase" ${this.state.namingConvention === 'PascalCase' ? 'selected' : ''}>PascalCase (C#/Java classes)</option>
                </select>
                
                <div class="checkbox-group">
                    <label class="checkbox-item">
                        <input type="checkbox" id="includeComments" ${this.state.includeComments ? 'checked' : ''}>
                        <span>Include inline comments</span>
                    </label>
                    <label class="checkbox-item">
                        <input type="checkbox" id="includeDocstrings" ${this.state.includeDocstrings ? 'checked' : ''}>
                        <span>Include docstrings / JSDoc</span>
                    </label>
                </div>
            </div>
        `;
    }

    private renderStep4(): string {
        const testFrameworks: { [key: string]: string[] } = {
            typescript: ['Jest', 'Vitest', 'Mocha', 'Ava'],
            javascript: ['Jest', 'Mocha', 'Jasmine', 'Ava'],
            python: ['pytest', 'unittest', 'nose2'],
            java: ['JUnit 5', 'TestNG', 'Mockito'],
            csharp: ['xUnit', 'NUnit', 'MSTest'],
            go: ['testing', 'testify', 'ginkgo'],
            rust: ['cargo test', 'rstest'],
            cpp: ['Google Test', 'Catch2', 'doctest'],
            php: ['PHPUnit', 'Pest', 'Codeception'],
            ruby: ['RSpec', 'Minitest'],
            kotlin: ['JUnit 5', 'Kotest', 'MockK'],
            swift: ['XCTest', 'Quick/Nimble']
        };

        const frameworks = testFrameworks[this.state.language] || ['Default'];

        return `
            <div class="step-content">
                <h2>Step 4: Testing Configuration</h2>
                <p>Configure how tests should be generated.</p>
                
                <div class="style-options">
                    ${TESTING_LEVELS.map(level => `
                        <div class="style-option testingLevel-option ${this.state.testingLevel === level.id ? 'selected' : ''}"
                             data-value="${level.id}"
                             onclick="selectOption('testingLevel', '${level.id}')">
                            <div>
                                <strong>${level.label}</strong><br>
                                <small style="opacity: 0.7;">${level.description}</small>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                ${this.state.testingLevel !== 'none' ? `
                    <h3 style="margin-top: 24px;">Testing Framework</h3>
                    <select id="testingFramework" class="form-input">
                        ${frameworks.map(f => `<option value="${f}">${f}</option>`).join('')}
                    </select>
                ` : ''}
            </div>
        `;
    }

    private renderStep5(): string {
        return `
            <div class="step-content">
                <h2>Step 5: Code Review Configuration</h2>
                <p>Configure the automated code review stage.</p>
                
                <div class="style-options">
                    ${REVIEW_LEVELS.map(level => `
                        <div class="style-option reviewLevel-option ${this.state.reviewLevel === level.id ? 'selected' : ''}"
                             data-value="${level.id}"
                             onclick="selectOption('reviewLevel', '${level.id}')">
                            <div>
                                <strong>${level.label}</strong><br>
                                <small style="opacity: 0.7;">${level.description}</small>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <h3 style="margin-top: 24px;">Parallel Workers</h3>
                <p style="opacity: 0.7;">Number of parallel code variants to generate and compare.</p>
                <input type="range" id="workerCount" class="form-input" 
                       min="1" max="5" step="1" value="${this.state.workerCount}"
                       oninput="document.getElementById('workerDisplay').textContent = this.value">
                <div style="text-align: center; font-size: 24px; margin-top: 8px;">
                    <span id="workerDisplay">${this.state.workerCount}</span> workers
                </div>
            </div>
        `;
    }

    private renderSummary(): string {
        const langInfo = LANGUAGES.find(l => l.id === this.state.language);
        const frameworkInfo = (FRAMEWORKS[this.state.language as keyof typeof FRAMEWORKS] || [])
            .find(f => f.id === this.state.framework);
        const taskInfo = CODE_TASKS.find(t => t.id === this.state.taskType);
        const styleInfo = CODE_STYLES.find(s => s.id === this.state.codeStyle);
        const testInfo = TESTING_LEVELS.find(t => t.id === this.state.testingLevel);
        const reviewInfo = REVIEW_LEVELS.find(r => r.id === this.state.reviewLevel);

        return `
            <div class="step-content">
                <h2>Step 6: Review & Create</h2>
                <p>Review your code generation project configuration.</p>
                
                <div class="summary-grid">
                    <div class="summary-section">
                        <h4>🔷 Language & Framework</h4>
                        <div><strong>${langInfo?.icon} ${langInfo?.label}</strong></div>
                        <div>${frameworkInfo?.label || 'None'}</div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>📝 Task Type</h4>
                        <div><strong>${taskInfo?.icon} ${taskInfo?.label}</strong></div>
                        <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">${this.state.taskDescription?.substring(0, 100) || 'No description'}${this.state.taskDescription?.length > 100 ? '...' : ''}</div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>🎨 Code Style</h4>
                        <div><strong>${styleInfo?.label}</strong></div>
                        <div>Naming: ${this.state.namingConvention}</div>
                        <div>Comments: ${this.state.includeComments ? '✅' : '❌'} | Docs: ${this.state.includeDocstrings ? '✅' : '❌'}</div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>🧪 Testing</h4>
                        <div><strong>${testInfo?.label}</strong></div>
                        ${this.state.testingLevel !== 'none' ? `<div>Framework: ${this.state.testingFramework || 'Default'}</div>` : ''}
                    </div>
                    
                    <div class="summary-section">
                        <h4>👀 Code Review</h4>
                        <div><strong>${reviewInfo?.label}</strong></div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>⚙️ Workers</h4>
                        <div><strong>${this.state.workerCount}</strong> parallel workers</div>
                    </div>
                </div>
                
                <div class="summary-section" style="background: var(--vscode-inputValidation-infoBackground); margin-top: 16px;">
                    <h4>📋 Pipeline Stages</h4>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">1. Analyze Requirements</span>
                        <span style="padding: 4px;">→</span>
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">2. Generate Code</span>
                        <span style="padding: 4px;">→</span>
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">3. Code Review</span>
                        <span style="padding: 4px;">→</span>
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">4. Completed</span>
                    </div>
                </div>
            </div>
        `;
    }
}
