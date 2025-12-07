/**
 * Translation Wizard
 * 
 * Multi-step wizard for configuring translation projects.
 * Steps: Languages → Content Type → Style → Terminology → Review → Summary
 */

import * as vscode from 'vscode';
import { getBaseStyles, getNonce } from './shared';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const LANGUAGES = [
    { id: 'en', label: 'English', flag: '🇺🇸', native: 'English' },
    { id: 'pl', label: 'Polish', flag: '🇵🇱', native: 'Polski' },
    { id: 'de', label: 'German', flag: '🇩🇪', native: 'Deutsch' },
    { id: 'fr', label: 'French', flag: '🇫🇷', native: 'Français' },
    { id: 'es', label: 'Spanish', flag: '🇪🇸', native: 'Español' },
    { id: 'it', label: 'Italian', flag: '🇮🇹', native: 'Italiano' },
    { id: 'pt', label: 'Portuguese', flag: '🇵🇹', native: 'Português' },
    { id: 'nl', label: 'Dutch', flag: '🇳🇱', native: 'Nederlands' },
    { id: 'ru', label: 'Russian', flag: '🇷🇺', native: 'Русский' },
    { id: 'uk', label: 'Ukrainian', flag: '🇺🇦', native: 'Українська' },
    { id: 'ja', label: 'Japanese', flag: '🇯🇵', native: '日本語' },
    { id: 'zh', label: 'Chinese', flag: '🇨🇳', native: '中文' },
    { id: 'ko', label: 'Korean', flag: '🇰🇷', native: '한국어' },
    { id: 'ar', label: 'Arabic', flag: '🇸🇦', native: 'العربية' },
    { id: 'hi', label: 'Hindi', flag: '🇮🇳', native: 'हिन्दी' },
    { id: 'tr', label: 'Turkish', flag: '🇹🇷', native: 'Türkçe' },
    { id: 'cs', label: 'Czech', flag: '🇨🇿', native: 'Čeština' },
    { id: 'sv', label: 'Swedish', flag: '🇸🇪', native: 'Svenska' }
];

export const CONTENT_TYPES = [
    { id: 'technical', label: 'Technical Documentation', icon: '📖', description: 'API docs, manuals, specifications' },
    { id: 'marketing', label: 'Marketing Content', icon: '📣', description: 'Ads, campaigns, promotional materials' },
    { id: 'legal', label: 'Legal Text', icon: '⚖️', description: 'Contracts, terms, compliance documents' },
    { id: 'medical', label: 'Medical/Scientific', icon: '🔬', description: 'Research papers, medical documents' },
    { id: 'software', label: 'Software UI', icon: '💻', description: 'Interface strings, error messages' },
    { id: 'code-comments', label: 'Code Comments', icon: '💬', description: 'Inline comments, docstrings' },
    { id: 'website', label: 'Website Content', icon: '🌐', description: 'Web pages, blog posts' },
    { id: 'general', label: 'General Text', icon: '📝', description: 'General purpose translation' }
];

export const TRANSLATION_STYLES = [
    { id: 'literal', label: 'Literal', icon: '📐', description: 'Word-for-word, preserve structure' },
    { id: 'adaptive', label: 'Adaptive', icon: '🔄', description: 'Natural in target language' },
    { id: 'creative', label: 'Creative', icon: '🎨', description: 'Free adaptation, localization' },
    { id: 'formal', label: 'Formal', icon: '🎩', description: 'Official, professional tone' },
    { id: 'casual', label: 'Casual', icon: '👋', description: 'Friendly, conversational' }
];

export const FORMALITY_LEVELS = [
    { id: 'formal', label: 'Formal (Sie/Vous/Usted)', description: 'Polite form for business' },
    { id: 'informal', label: 'Informal (Du/Tu/Tú)', description: 'Casual form for friendly content' },
    { id: 'neutral', label: 'Neutral', description: 'Avoid personal pronouns when possible' }
];

export const REVIEW_LEVELS = [
    { id: 'none', label: 'No Review', description: 'Direct output without review' },
    { id: 'quick', label: 'Quick Check', description: 'Basic grammar and spelling' },
    { id: 'standard', label: 'Standard Review', description: 'Full quality review' },
    { id: 'expert', label: 'Expert Review', description: 'Domain-specific verification' }
];

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD STATE
// ═══════════════════════════════════════════════════════════════════════════

interface TranslationWizardState {
    currentStep: number;
    // Step 1: Languages
    sourceLanguage: string;
    targetLanguage: string;
    detectSource: boolean;
    // Step 2: Content Type
    contentType: string;
    preserveFormatting: boolean;
    preserveCode: boolean;
    // Step 3: Style
    translationStyle: string;
    formalityLevel: string;
    // Step 4: Terminology
    glossaryTerms: Array<{ source: string; target: string }>;
    doNotTranslate: string[];
    // Step 5: Review
    reviewLevel: string;
    workerCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class TranslationWizard {
    private panel: vscode.WebviewPanel | undefined;
    private state: TranslationWizardState;
    private readonly extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
        this.state = {
            currentStep: 1,
            sourceLanguage: 'en',
            targetLanguage: 'pl',
            detectSource: false,
            contentType: 'general',
            preserveFormatting: true,
            preserveCode: true,
            translationStyle: 'adaptive',
            formalityLevel: 'neutral',
            glossaryTerms: [],
            doNotTranslate: [],
            reviewLevel: 'standard',
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
            'translationWizard',
            '🌍 Translation Wizard',
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
            case 'addGlossaryTerm':
                this.state.glossaryTerms.push({ source: message.source, target: message.target });
                this.updatePanel();
                break;
            case 'removeGlossaryTerm':
                this.state.glossaryTerms.splice(message.index, 1);
                this.updatePanel();
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

        const projectName = `translation-${Date.now()}`;
        const projectPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.adg-local-no-repo', 'projects', projectName);

        const configContent = {
            adapterId: 'translation',
            created: new Date().toISOString(),
            config: this.state
        };

        try {
            await vscode.workspace.fs.createDirectory(projectPath);
            await vscode.workspace.fs.writeFile(
                vscode.Uri.joinPath(projectPath, 'config.json'),
                Buffer.from(JSON.stringify(configContent, null, 2))
            );
            
            vscode.window.showInformationMessage(`✅ Translation project created: ${projectName}`);
            this.panel?.dispose();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create project: ${error}`);
        }
    }

    private getHtml(): string {
        const nonce = getNonce();
        const steps = ['Languages', 'Content', 'Style', 'Terms', 'Review', 'Summary'];
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Translation Wizard</title>
    <style>
        ${getBaseStyles()}
        
        .language-pair {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 24px;
            margin: 32px 0;
        }
        
        .language-selector {
            flex: 1;
            max-width: 300px;
        }
        
        .language-selector label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
        }
        
        .language-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            max-height: 300px;
            overflow-y: auto;
            padding: 8px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
        }
        
        .language-option {
            padding: 10px;
            text-align: center;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .language-option:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .language-option.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .language-flag {
            font-size: 24px;
        }
        
        .swap-button {
            background: var(--vscode-button-secondaryBackground);
            border: none;
            padding: 12px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 20px;
            transition: transform 0.3s;
        }
        
        .swap-button:hover {
            transform: rotate(180deg);
        }
        
        .content-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
        }
        
        .content-card {
            padding: 16px;
            text-align: center;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .content-card:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .content-card.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .content-icon {
            font-size: 28px;
            margin-bottom: 8px;
        }
        
        .style-cards {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 12px;
        }
        
        .style-card {
            padding: 16px;
            text-align: center;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .style-card:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .style-card.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .formality-options {
            display: flex;
            gap: 12px;
            margin-top: 24px;
        }
        
        .formality-option {
            flex: 1;
            padding: 16px;
            text-align: center;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: pointer;
        }
        
        .formality-option:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .formality-option.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .glossary-section {
            background: var(--vscode-textCodeBlock-background);
            padding: 16px;
            border-radius: 8px;
            margin-top: 20px;
        }
        
        .glossary-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
        }
        
        .glossary-table th,
        .glossary-table td {
            padding: 8px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .glossary-input-row {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }
        
        .glossary-input-row input {
            flex: 1;
        }
        
        .dnt-section {
            margin-top: 24px;
        }
        
        .dnt-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
        }
        
        .dnt-tag {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 4px 12px;
            border-radius: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .dnt-tag button {
            background: none;
            border: none;
            color: inherit;
            cursor: pointer;
            padding: 0;
            font-size: 14px;
        }
        
        .checkbox-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 16px;
        }
        
        .checkbox-row input[type="checkbox"] {
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
        
        .lang-display {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 18px;
        }
        
        .lang-display .arrow {
            font-size: 24px;
        }
    </style>
</head>
<body>
    <div class="wizard-container">
        <div class="wizard-header">
            <h1>🌍 Translation Wizard</h1>
            <p>Configure your translation project with quality review</p>
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
                    '<button class="btn btn-primary" onclick="submit()">🚀 Start Translation</button>'}
            </div>
        </div>
    </div>
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let state = ${JSON.stringify(this.state)};
        
        function selectSourceLang(langId) {
            state.sourceLanguage = langId;
            document.querySelectorAll('.source-lang').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.lang === langId);
            });
        }
        
        function selectTargetLang(langId) {
            state.targetLanguage = langId;
            document.querySelectorAll('.target-lang').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.lang === langId);
            });
        }
        
        function swapLanguages() {
            const temp = state.sourceLanguage;
            state.sourceLanguage = state.targetLanguage;
            state.targetLanguage = temp;
            vscode.postMessage({ command: 'next', data: { ...state, currentStep: state.currentStep - 1 } });
        }
        
        function selectType(type, value) {
            state[type] = value;
            document.querySelectorAll('.' + type + '-card').forEach(card => {
                card.classList.toggle('selected', card.dataset.value === value);
            });
        }
        
        function addGlossaryTerm() {
            const source = document.getElementById('glossarySource').value.trim();
            const target = document.getElementById('glossaryTarget').value.trim();
            if (source && target) {
                vscode.postMessage({ command: 'addGlossaryTerm', source, target });
            }
        }
        
        function removeGlossaryTerm(index) {
            vscode.postMessage({ command: 'removeGlossaryTerm', index });
        }
        
        function addDNT() {
            const input = document.getElementById('dntInput');
            const term = input.value.trim();
            if (term && !state.doNotTranslate.includes(term)) {
                state.doNotTranslate.push(term);
                renderDNTTags();
                input.value = '';
            }
        }
        
        function removeDNT(term) {
            state.doNotTranslate = state.doNotTranslate.filter(t => t !== term);
            renderDNTTags();
        }
        
        function renderDNTTags() {
            const container = document.getElementById('dntTags');
            if (container) {
                container.innerHTML = state.doNotTranslate.map(term => 
                    '<span class="dnt-tag">' + term + ' <button onclick="removeDNT(\\'' + term + '\\')">×</button></span>'
                ).join('');
            }
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
            const detectSource = document.getElementById('detectSource');
            if (detectSource) state.detectSource = detectSource.checked;
            
            const preserveFormatting = document.getElementById('preserveFormatting');
            if (preserveFormatting) state.preserveFormatting = preserveFormatting.checked;
            
            const preserveCode = document.getElementById('preserveCode');
            if (preserveCode) state.preserveCode = preserveCode.checked;
            
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
                <h2>Step 1: Select Languages</h2>
                <p>Choose source and target languages for translation.</p>
                
                <div class="language-pair">
                    <div class="language-selector">
                        <label>Source Language</label>
                        <div class="language-grid">
                            ${LANGUAGES.map(lang => `
                                <div class="language-option source-lang ${this.state.sourceLanguage === lang.id ? 'selected' : ''}"
                                     data-lang="${lang.id}"
                                     onclick="selectSourceLang('${lang.id}')">
                                    <div class="language-flag">${lang.flag}</div>
                                    <div>${lang.label}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <button class="swap-button" onclick="swapLanguages()" title="Swap languages">⇄</button>
                    
                    <div class="language-selector">
                        <label>Target Language</label>
                        <div class="language-grid">
                            ${LANGUAGES.map(lang => `
                                <div class="language-option target-lang ${this.state.targetLanguage === lang.id ? 'selected' : ''}"
                                     data-lang="${lang.id}"
                                     onclick="selectTargetLang('${lang.id}')">
                                    <div class="language-flag">${lang.flag}</div>
                                    <div>${lang.label}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                
                <label class="checkbox-row">
                    <input type="checkbox" id="detectSource" ${this.state.detectSource ? 'checked' : ''}>
                    <span>Auto-detect source language</span>
                </label>
            </div>
        `;
    }

    private renderStep2(): string {
        return `
            <div class="step-content">
                <h2>Step 2: Content Type</h2>
                <p>What type of content are you translating?</p>
                
                <div class="content-grid">
                    ${CONTENT_TYPES.map(type => `
                        <div class="content-card contentType-card ${this.state.contentType === type.id ? 'selected' : ''}"
                             data-value="${type.id}"
                             onclick="selectType('contentType', '${type.id}')">
                            <div class="content-icon">${type.icon}</div>
                            <div><strong>${type.label}</strong></div>
                            <small style="opacity: 0.7; font-size: 11px;">${type.description}</small>
                        </div>
                    `).join('')}
                </div>
                
                <div style="margin-top: 24px;">
                    <label class="checkbox-row">
                        <input type="checkbox" id="preserveFormatting" ${this.state.preserveFormatting ? 'checked' : ''}>
                        <span>Preserve Markdown/HTML formatting</span>
                    </label>
                    <label class="checkbox-row">
                        <input type="checkbox" id="preserveCode" ${this.state.preserveCode ? 'checked' : ''}>
                        <span>Preserve code blocks (don't translate)</span>
                    </label>
                </div>
            </div>
        `;
    }

    private renderStep3(): string {
        return `
            <div class="step-content">
                <h2>Step 3: Translation Style</h2>
                <p>How should the translation approach the text?</p>
                
                <div class="style-cards">
                    ${TRANSLATION_STYLES.map(style => `
                        <div class="style-card translationStyle-card ${this.state.translationStyle === style.id ? 'selected' : ''}"
                             data-value="${style.id}"
                             onclick="selectType('translationStyle', '${style.id}')">
                            <div style="font-size: 28px; margin-bottom: 8px;">${style.icon}</div>
                            <div><strong>${style.label}</strong></div>
                            <small style="opacity: 0.7; font-size: 11px;">${style.description}</small>
                        </div>
                    `).join('')}
                </div>
                
                <h3 style="margin-top: 32px;">Formality Level</h3>
                <div class="formality-options">
                    ${FORMALITY_LEVELS.map(level => `
                        <div class="formality-option formalityLevel-card ${this.state.formalityLevel === level.id ? 'selected' : ''}"
                             data-value="${level.id}"
                             onclick="selectType('formalityLevel', '${level.id}')">
                            <strong>${level.label}</strong><br>
                            <small style="opacity: 0.7;">${level.description}</small>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    private renderStep4(): string {
        const sourceLang = LANGUAGES.find(l => l.id === this.state.sourceLanguage);
        const targetLang = LANGUAGES.find(l => l.id === this.state.targetLanguage);
        
        return `
            <div class="step-content">
                <h2>Step 4: Terminology & Glossary</h2>
                <p>Define specific terms and words that should not be translated.</p>
                
                <div class="glossary-section">
                    <h3>📖 Glossary</h3>
                    <p style="opacity: 0.7;">Define how specific terms should be translated.</p>
                    
                    ${this.state.glossaryTerms.length > 0 ? `
                        <table class="glossary-table">
                            <tr>
                                <th>${sourceLang?.label || 'Source'}</th>
                                <th>${targetLang?.label || 'Target'}</th>
                                <th></th>
                            </tr>
                            ${this.state.glossaryTerms.map((term, idx) => `
                                <tr>
                                    <td>${term.source}</td>
                                    <td>${term.target}</td>
                                    <td><button class="btn btn-secondary" onclick="removeGlossaryTerm(${idx})">×</button></td>
                                </tr>
                            `).join('')}
                        </table>
                    ` : '<p style="opacity: 0.5; font-style: italic;">No glossary terms defined</p>'}
                    
                    <div class="glossary-input-row">
                        <input type="text" id="glossarySource" class="form-input" placeholder="${sourceLang?.label || 'Source'} term">
                        <input type="text" id="glossaryTarget" class="form-input" placeholder="${targetLang?.label || 'Target'} translation">
                        <button class="btn btn-primary" onclick="addGlossaryTerm()">Add</button>
                    </div>
                </div>
                
                <div class="dnt-section">
                    <h3>🚫 Do Not Translate</h3>
                    <p style="opacity: 0.7;">Terms that should remain in the original language.</p>
                    
                    <div id="dntTags" class="dnt-tags">
                        ${this.state.doNotTranslate.map(term => `
                            <span class="dnt-tag">${term} <button onclick="removeDNT('${term}')">×</button></span>
                        `).join('')}
                    </div>
                    
                    <div style="display: flex; gap: 8px; margin-top: 12px;">
                        <input type="text" id="dntInput" class="form-input" placeholder="Enter term...">
                        <button class="btn btn-secondary" onclick="addDNT()">Add</button>
                    </div>
                </div>
            </div>
        `;
    }

    private renderStep5(): string {
        return `
            <div class="step-content">
                <h2>Step 5: Review Configuration</h2>
                <p>Configure quality review for the translation.</p>
                
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${REVIEW_LEVELS.map(level => `
                        <div class="formality-option reviewLevel-card ${this.state.reviewLevel === level.id ? 'selected' : ''}"
                             data-value="${level.id}"
                             onclick="selectType('reviewLevel', '${level.id}')"
                             style="text-align: left; padding: 16px;">
                            <strong>${level.label}</strong><br>
                            <small style="opacity: 0.7;">${level.description}</small>
                        </div>
                    `).join('')}
                </div>
                
                <h3 style="margin-top: 24px;">Parallel Workers</h3>
                <p style="opacity: 0.7;">Number of parallel translation variants to compare.</p>
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
        const sourceLang = LANGUAGES.find(l => l.id === this.state.sourceLanguage);
        const targetLang = LANGUAGES.find(l => l.id === this.state.targetLanguage);
        const contentInfo = CONTENT_TYPES.find(c => c.id === this.state.contentType);
        const styleInfo = TRANSLATION_STYLES.find(s => s.id === this.state.translationStyle);
        const formalityInfo = FORMALITY_LEVELS.find(f => f.id === this.state.formalityLevel);
        const reviewInfo = REVIEW_LEVELS.find(r => r.id === this.state.reviewLevel);

        return `
            <div class="step-content">
                <h2>Step 6: Review & Start</h2>
                <p>Review your translation project configuration.</p>
                
                <div class="summary-section" style="background: var(--vscode-inputValidation-infoBackground);">
                    <div class="lang-display">
                        <span>${sourceLang?.flag} ${sourceLang?.label}</span>
                        <span class="arrow">→</span>
                        <span>${targetLang?.flag} ${targetLang?.label}</span>
                    </div>
                </div>
                
                <div class="summary-grid">
                    <div class="summary-section">
                        <h4>${contentInfo?.icon} Content Type</h4>
                        <div><strong>${contentInfo?.label}</strong></div>
                        <div style="margin-top: 8px;">
                            Preserve formatting: ${this.state.preserveFormatting ? '✅' : '❌'}<br>
                            Preserve code: ${this.state.preserveCode ? '✅' : '❌'}
                        </div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>${styleInfo?.icon} Translation Style</h4>
                        <div><strong>${styleInfo?.label}</strong></div>
                        <div>Formality: ${formalityInfo?.label}</div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>📖 Terminology</h4>
                        <div>Glossary terms: <strong>${this.state.glossaryTerms.length}</strong></div>
                        <div>Do not translate: <strong>${this.state.doNotTranslate.length}</strong> terms</div>
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
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">1. Analyze</span>
                        <span>→</span>
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">2. Translate</span>
                        <span>→</span>
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">3. Review</span>
                        <span>→</span>
                        <span style="background: var(--vscode-button-secondaryBackground); padding: 4px 8px; border-radius: 4px;">4. Completed</span>
                    </div>
                </div>
            </div>
        `;
    }
}
