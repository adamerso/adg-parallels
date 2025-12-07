/**
 * Research Report Wizard
 * 
 * Multi-step wizard for configuring research and report generation projects.
 * Steps: Topic & Scope → Research Depth → Sources → Report Format → Review → Summary
 */

import * as vscode from 'vscode';
import { getBaseStyles, getNonce } from './shared';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const RESEARCH_TYPES = [
    { id: 'literature', label: 'Literature Review', icon: '📚', description: 'Analyze existing papers and publications' },
    { id: 'market', label: 'Market Research', icon: '📈', description: 'Market analysis, competitors, trends' },
    { id: 'technical', label: 'Technical Research', icon: '🔬', description: 'Technical comparison, architecture analysis' },
    { id: 'user', label: 'User Research', icon: '👥', description: 'User needs, behavior patterns, UX insights' },
    { id: 'competitive', label: 'Competitive Analysis', icon: '🏆', description: 'Competitor products and strategies' },
    { id: 'trend', label: 'Trend Analysis', icon: '📊', description: 'Industry trends and forecasts' },
    { id: 'case-study', label: 'Case Study', icon: '📋', description: 'In-depth analysis of specific example' },
    { id: 'overview', label: 'General Overview', icon: '🌐', description: 'Broad topic introduction and summary' }
];

export const RESEARCH_DEPTHS = [
    { id: 'quick', label: 'Quick Summary', time: '5-10 min', description: 'Brief overview with key points' },
    { id: 'standard', label: 'Standard Report', time: '15-30 min', description: 'Balanced depth and coverage' },
    { id: 'deep', label: 'Deep Dive', time: '45-60 min', description: 'Comprehensive analysis with details' },
    { id: 'exhaustive', label: 'Exhaustive Study', time: '2+ hours', description: 'Complete coverage, multiple angles' }
];

export const SOURCE_TYPES = [
    { id: 'academic', label: 'Academic Papers', icon: '🎓', description: 'Peer-reviewed research papers' },
    { id: 'industry', label: 'Industry Reports', icon: '📑', description: 'Reports from analysts and firms' },
    { id: 'news', label: 'News & Media', icon: '📰', description: 'Recent news articles and coverage' },
    { id: 'blogs', label: 'Technical Blogs', icon: '✍️', description: 'Expert blogs and tutorials' },
    { id: 'documentation', label: 'Documentation', icon: '📖', description: 'Official docs and specifications' },
    { id: 'github', label: 'GitHub & Code', icon: '🐙', description: 'Open source projects and code' },
    { id: 'forums', label: 'Forums & Discussions', icon: '💬', description: 'Community discussions and Q&A' },
    { id: 'video', label: 'Video & Presentations', icon: '🎥', description: 'Talks, tutorials, conferences' }
];

export const REPORT_FORMATS = [
    { id: 'executive', label: 'Executive Summary', icon: '👔', description: 'High-level summary for stakeholders' },
    { id: 'technical', label: 'Technical Report', icon: '⚙️', description: 'Detailed technical documentation' },
    { id: 'presentation', label: 'Presentation-Ready', icon: '📊', description: 'Slides-friendly format with visuals' },
    { id: 'blog', label: 'Blog Post Style', icon: '📝', description: 'Engaging, readable content' },
    { id: 'academic', label: 'Academic Style', icon: '🎓', description: 'Formal with citations and references' },
    { id: 'comparison', label: 'Comparison Table', icon: '📋', description: 'Side-by-side feature comparison' }
];

export const LANGUAGES = [
    { id: 'en', label: 'English', flag: '🇺🇸' },
    { id: 'pl', label: 'Polish', flag: '🇵🇱' },
    { id: 'de', label: 'German', flag: '🇩🇪' },
    { id: 'fr', label: 'French', flag: '🇫🇷' },
    { id: 'es', label: 'Spanish', flag: '🇪🇸' },
    { id: 'it', label: 'Italian', flag: '🇮🇹' },
    { id: 'pt', label: 'Portuguese', flag: '🇵🇹' },
    { id: 'ja', label: 'Japanese', flag: '🇯🇵' },
    { id: 'zh', label: 'Chinese', flag: '🇨🇳' },
    { id: 'ko', label: 'Korean', flag: '🇰🇷' }
];

export const REVIEW_LEVELS = [
    { id: 'none', label: 'No Review', description: 'Skip quality review' },
    { id: 'basic', label: 'Basic Review', description: 'Check for completeness and coherence' },
    { id: 'thorough', label: 'Thorough Review', description: 'Fact-check and validate sources' },
    { id: 'expert', label: 'Expert Review', description: 'Domain expert-level verification' }
];

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD STATE
// ═══════════════════════════════════════════════════════════════════════════

interface ResearchWizardState {
    currentStep: number;
    // Step 1: Topic & Scope
    researchType: string;
    topic: string;
    specificQuestions: string;
    // Step 2: Research Depth
    researchDepth: string;
    focusAreas: string[];
    // Step 3: Sources
    sourcePriorities: string[];
    excludedSources: string[];
    dateRange: 'all' | 'year' | '3years' | '5years';
    // Step 4: Report Format
    reportFormat: string;
    outputLanguage: string;
    includeSections: {
        executive: boolean;
        methodology: boolean;
        findings: boolean;
        recommendations: boolean;
        appendix: boolean;
    };
    // Step 5: Review
    reviewLevel: string;
    workerCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ResearchReportWizard {
    private panel: vscode.WebviewPanel | undefined;
    private state: ResearchWizardState;
    private readonly extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
        this.state = {
            currentStep: 1,
            researchType: 'technical',
            topic: '',
            specificQuestions: '',
            researchDepth: 'standard',
            focusAreas: [],
            sourcePriorities: ['documentation', 'blogs', 'github'],
            excludedSources: [],
            dateRange: '3years',
            reportFormat: 'technical',
            outputLanguage: 'en',
            includeSections: {
                executive: true,
                methodology: true,
                findings: true,
                recommendations: true,
                appendix: false
            },
            reviewLevel: 'basic',
            workerCount: 3
        };
    }

    public show(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        // Direct values - avoid circular dependency with ADAPTER_REGISTRY
        
        this.panel = vscode.window.createWebviewPanel(
            'researchWizard',
            '🔬 Research Report Wizard',
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

        const projectName = `research-${Date.now()}`;
        const projectPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.adg-local-no-repo', 'projects', projectName);

        const configContent = {
            adapterId: 'research-report',
            created: new Date().toISOString(),
            config: this.state
        };

        try {
            await vscode.workspace.fs.createDirectory(projectPath);
            await vscode.workspace.fs.writeFile(
                vscode.Uri.joinPath(projectPath, 'config.json'),
                Buffer.from(JSON.stringify(configContent, null, 2))
            );
            
            vscode.window.showInformationMessage(`✅ Research project created: ${projectName}`);
            this.panel?.dispose();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create project: ${error}`);
        }
    }

    private getHtml(): string {
        const nonce = getNonce();
        const steps = ['Topic', 'Depth', 'Sources', 'Format', 'Review', 'Summary'];
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Research Report Wizard</title>
    <style>
        ${getBaseStyles()}
        
        .type-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
        }
        
        .type-card {
            padding: 16px;
            text-align: center;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .type-card:hover {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-hoverBackground);
        }
        
        .type-card.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .type-icon {
            font-size: 28px;
            margin-bottom: 8px;
        }
        
        .depth-cards {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .depth-card {
            display: flex;
            align-items: center;
            padding: 16px;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .depth-card:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .depth-card.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .depth-time {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            margin-left: auto;
        }
        
        .source-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
        }
        
        .source-card {
            padding: 12px;
            text-align: center;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            opacity: 0.6;
        }
        
        .source-card.selected {
            opacity: 1;
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .source-card.excluded {
            opacity: 0.4;
            border-color: var(--vscode-errorForeground);
            text-decoration: line-through;
        }
        
        .format-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        }
        
        .format-card {
            padding: 20px;
            text-align: center;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .format-card:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .format-card.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .section-toggles {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-top: 20px;
        }
        
        .section-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
        }
        
        .section-toggle input[type="checkbox"] {
            width: 18px;
            height: 18px;
        }
        
        .language-select {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 16px;
        }
        
        .language-option {
            padding: 8px 16px;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 20px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .language-option:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .language-option.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-button-background);
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
        
        .tag-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 8px;
        }
        
        .tag {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
        }
    </style>
</head>
<body>
    <div class="wizard-container">
        <div class="wizard-header">
            <h1>🔍 Research Report Wizard</h1>
            <p>Configure your research project with intelligent synthesis</p>
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
                    '<button class="btn btn-primary" onclick="submit()">🚀 Start Research</button>'}
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
        
        function toggleSource(sourceId) {
            const idx = state.sourcePriorities.indexOf(sourceId);
            if (idx > -1) {
                state.sourcePriorities.splice(idx, 1);
            } else {
                state.sourcePriorities.push(sourceId);
            }
            document.querySelectorAll('.source-card').forEach(card => {
                card.classList.toggle('selected', state.sourcePriorities.includes(card.dataset.value));
            });
        }
        
        function selectLanguage(langId) {
            state.outputLanguage = langId;
            document.querySelectorAll('.language-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.lang === langId);
            });
        }
        
        function selectFormat(formatId) {
            state.reportFormat = formatId;
            document.querySelectorAll('.format-card').forEach(card => {
                card.classList.toggle('selected', card.dataset.format === formatId);
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
            const topic = document.getElementById('topic');
            if (topic) state.topic = topic.value;
            
            const questions = document.getElementById('specificQuestions');
            if (questions) state.specificQuestions = questions.value;
            
            const dateRange = document.getElementById('dateRange');
            if (dateRange) state.dateRange = dateRange.value;
            
            const workerCount = document.getElementById('workerCount');
            if (workerCount) state.workerCount = parseInt(workerCount.value);
            
            // Collect section toggles
            ['executive', 'methodology', 'findings', 'recommendations', 'appendix'].forEach(section => {
                const el = document.getElementById('section_' + section);
                if (el) state.includeSections[section] = el.checked;
            });
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
                <h2>Step 1: Research Topic & Scope</h2>
                <p>What do you want to research?</p>
                
                <h3>Research Type</h3>
                <div class="type-grid">
                    ${RESEARCH_TYPES.map(type => `
                        <div class="type-card researchType-card ${this.state.researchType === type.id ? 'selected' : ''}"
                             data-value="${type.id}"
                             onclick="selectType('researchType', '${type.id}')">
                            <div class="type-icon">${type.icon}</div>
                            <div><strong>${type.label}</strong></div>
                            <small style="opacity: 0.7; font-size: 11px;">${type.description}</small>
                        </div>
                    `).join('')}
                </div>
                
                <h3 style="margin-top: 24px;">Research Topic</h3>
                <input type="text" id="topic" class="form-input" 
                       placeholder="e.g., Comparison of state management solutions in React"
                       value="${this.state.topic || ''}">
                
                <h3 style="margin-top: 16px;">Specific Questions (optional)</h3>
                <textarea id="specificQuestions" class="form-input" rows="3"
                    placeholder="What specific questions should the research answer?">${this.state.specificQuestions || ''}</textarea>
            </div>
        `;
    }

    private renderStep2(): string {
        return `
            <div class="step-content">
                <h2>Step 2: Research Depth</h2>
                <p>How thorough should the research be?</p>
                
                <div class="depth-cards">
                    ${RESEARCH_DEPTHS.map(depth => `
                        <div class="depth-card researchDepth-card ${this.state.researchDepth === depth.id ? 'selected' : ''}"
                             data-value="${depth.id}"
                             onclick="selectType('researchDepth', '${depth.id}')">
                            <div>
                                <strong>${depth.label}</strong><br>
                                <small style="opacity: 0.7;">${depth.description}</small>
                            </div>
                            <span class="depth-time">~${depth.time}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    private renderStep3(): string {
        return `
            <div class="step-content">
                <h2>Step 3: Source Preferences</h2>
                <p>Which sources should be prioritized? Click to toggle.</p>
                
                <div class="source-grid">
                    ${SOURCE_TYPES.map(source => `
                        <div class="source-card ${this.state.sourcePriorities.includes(source.id) ? 'selected' : ''}"
                             data-value="${source.id}"
                             onclick="toggleSource('${source.id}')">
                            <div style="font-size: 24px;">${source.icon}</div>
                            <div><strong>${source.label}</strong></div>
                            <small style="opacity: 0.7; font-size: 10px;">${source.description}</small>
                        </div>
                    `).join('')}
                </div>
                
                <h3 style="margin-top: 24px;">Date Range</h3>
                <select id="dateRange" class="form-input">
                    <option value="all" ${this.state.dateRange === 'all' ? 'selected' : ''}>All time</option>
                    <option value="year" ${this.state.dateRange === 'year' ? 'selected' : ''}>Last year</option>
                    <option value="3years" ${this.state.dateRange === '3years' ? 'selected' : ''}>Last 3 years</option>
                    <option value="5years" ${this.state.dateRange === '5years' ? 'selected' : ''}>Last 5 years</option>
                </select>
            </div>
        `;
    }

    private renderStep4(): string {
        return `
            <div class="step-content">
                <h2>Step 4: Report Format</h2>
                <p>How should the final report be formatted?</p>
                
                <div class="format-grid">
                    ${REPORT_FORMATS.map(format => `
                        <div class="format-card ${this.state.reportFormat === format.id ? 'selected' : ''}"
                             data-format="${format.id}"
                             onclick="selectFormat('${format.id}')">
                            <div style="font-size: 32px; margin-bottom: 8px;">${format.icon}</div>
                            <div><strong>${format.label}</strong></div>
                            <small style="opacity: 0.7;">${format.description}</small>
                        </div>
                    `).join('')}
                </div>
                
                <h3 style="margin-top: 24px;">Output Language</h3>
                <div class="language-select">
                    ${LANGUAGES.map(lang => `
                        <div class="language-option ${this.state.outputLanguage === lang.id ? 'selected' : ''}"
                             data-lang="${lang.id}"
                             onclick="selectLanguage('${lang.id}')">
                            ${lang.flag} ${lang.label}
                        </div>
                    `).join('')}
                </div>
                
                <h3 style="margin-top: 24px;">Report Sections</h3>
                <div class="section-toggles">
                    <label class="section-toggle">
                        <input type="checkbox" id="section_executive" ${this.state.includeSections.executive ? 'checked' : ''}>
                        <span>Executive Summary</span>
                    </label>
                    <label class="section-toggle">
                        <input type="checkbox" id="section_methodology" ${this.state.includeSections.methodology ? 'checked' : ''}>
                        <span>Methodology</span>
                    </label>
                    <label class="section-toggle">
                        <input type="checkbox" id="section_findings" ${this.state.includeSections.findings ? 'checked' : ''}>
                        <span>Key Findings</span>
                    </label>
                    <label class="section-toggle">
                        <input type="checkbox" id="section_recommendations" ${this.state.includeSections.recommendations ? 'checked' : ''}>
                        <span>Recommendations</span>
                    </label>
                    <label class="section-toggle">
                        <input type="checkbox" id="section_appendix" ${this.state.includeSections.appendix ? 'checked' : ''}>
                        <span>Appendix</span>
                    </label>
                </div>
            </div>
        `;
    }

    private renderStep5(): string {
        return `
            <div class="step-content">
                <h2>Step 5: Review & Quality</h2>
                <p>Configure quality verification for the report.</p>
                
                <div class="depth-cards">
                    ${REVIEW_LEVELS.map(level => `
                        <div class="depth-card reviewLevel-card ${this.state.reviewLevel === level.id ? 'selected' : ''}"
                             data-value="${level.id}"
                             onclick="selectType('reviewLevel', '${level.id}')">
                            <div>
                                <strong>${level.label}</strong><br>
                                <small style="opacity: 0.7;">${level.description}</small>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <h3 style="margin-top: 24px;">Parallel Workers</h3>
                <p style="opacity: 0.7;">Number of parallel research threads for faster synthesis.</p>
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
        const typeInfo = RESEARCH_TYPES.find(t => t.id === this.state.researchType);
        const depthInfo = RESEARCH_DEPTHS.find(d => d.id === this.state.researchDepth);
        const formatInfo = REPORT_FORMATS.find(f => f.id === this.state.reportFormat);
        const langInfo = LANGUAGES.find(l => l.id === this.state.outputLanguage);
        const reviewInfo = REVIEW_LEVELS.find(r => r.id === this.state.reviewLevel);
        const activeSources = SOURCE_TYPES.filter(s => this.state.sourcePriorities.includes(s.id));
        const activeSections = Object.entries(this.state.includeSections)
            .filter(([_, v]) => v)
            .map(([k, _]) => k);

        return `
            <div class="step-content">
                <h2>Step 6: Review & Start</h2>
                <p>Review your research configuration.</p>
                
                <div class="summary-grid">
                    <div class="summary-section">
                        <h4>${typeInfo?.icon} Research Type</h4>
                        <div><strong>${typeInfo?.label}</strong></div>
                        <div style="font-size: 12px; margin-top: 4px; opacity: 0.8;">${this.state.topic || 'No topic specified'}</div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>📊 Depth & Duration</h4>
                        <div><strong>${depthInfo?.label}</strong></div>
                        <div>Estimated: ~${depthInfo?.time}</div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>📚 Sources</h4>
                        <div class="tag-list">
                            ${activeSources.map(s => `<span class="tag">${s.icon} ${s.label}</span>`).join('')}
                        </div>
                        <div style="margin-top: 8px;">Date range: ${this.state.dateRange === 'all' ? 'All time' : 'Last ' + this.state.dateRange.replace('years', ' years').replace('year', ' year')}</div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>${formatInfo?.icon} Output Format</h4>
                        <div><strong>${formatInfo?.label}</strong></div>
                        <div>${langInfo?.flag} ${langInfo?.label}</div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>📑 Report Sections</h4>
                        <div class="tag-list">
                            ${activeSections.map(s => `<span class="tag">${s}</span>`).join('')}
                        </div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>⚙️ Processing</h4>
                        <div>Review: <strong>${reviewInfo?.label}</strong></div>
                        <div>Workers: <strong>${this.state.workerCount}</strong></div>
                    </div>
                </div>
                
                <div class="summary-section" style="background: var(--vscode-inputValidation-infoBackground); margin-top: 16px;">
                    <h4>🔄 Pipeline Stages</h4>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">1. Define Scope</span>
                        <span>→</span>
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">2. Research</span>
                        <span>→</span>
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">3. Synthesize</span>
                        <span>→</span>
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">4. Format</span>
                        <span>→</span>
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">5. Review</span>
                    </div>
                </div>
            </div>
        `;
    }
}
