/**
 * ADG-Parallels Adapter Wizards
 * 
 * Dedicated wizard panels for each adapter type.
 * Each wizard collects task-specific parameters before project creation.
 * 
 * v0.3.0
 */

import * as vscode from 'vscode';

// Re-export all wizards
export { ArticleWizardPanel } from './article-wizard';
export { CodeGenerationWizard } from './code-generation-wizard';
export { ResearchReportWizard } from './research-wizard';
export { TranslationWizard } from './translation-wizard';
export { AdapterGeneratorWizard } from './adapter-generator-wizard';

// Helper functions to show wizards
export function showArticleWizard(context: vscode.ExtensionContext): void {
  const { ArticleWizardPanel } = require('./article-wizard');
  const wizard = new ArticleWizardPanel(context.extensionUri);
  wizard.show();
}

export function showCodeGenerationWizard(context: vscode.ExtensionContext): void {
  const { CodeGenerationWizard } = require('./code-generation-wizard');
  const wizard = new CodeGenerationWizard(context.extensionUri);
  wizard.show();
}

export function showResearchWizard(context: vscode.ExtensionContext): void {
  const { ResearchReportWizard } = require('./research-wizard');
  const wizard = new ResearchReportWizard(context.extensionUri);
  wizard.show();
}

export function showTranslationWizard(context: vscode.ExtensionContext): void {
  const { TranslationWizard } = require('./translation-wizard');
  const wizard = new TranslationWizard(context.extensionUri);
  wizard.show();
}

export function showAdapterGeneratorWizard(context: vscode.ExtensionContext): void {
  const { AdapterGeneratorWizard } = require('./adapter-generator-wizard');
  const wizard = new AdapterGeneratorWizard(context.extensionUri);
  wizard.show();
}

// =============================================================================
// ADAPTER REGISTRY
// =============================================================================

export interface AdapterInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  stages: number;
  hasAudit: boolean;
  showWizard: (context: vscode.ExtensionContext) => void;
}

/**
 * Registry of all available adapters with their wizards
 */
export const ADAPTER_REGISTRY: AdapterInfo[] = [
  {
    id: 'article-with-audit',
    name: 'Article Generator',
    icon: '📝',
    description: 'Generate articles with proofreading and quality audit',
    stages: 8,
    hasAudit: true,
    showWizard: (ctx) => {
      const { showArticleWizard } = require('./article-wizard');
      showArticleWizard(ctx);
    },
  },
  {
    id: 'code-generation',
    name: 'Code Generator',
    icon: '💻',
    description: 'Generate code with review and testing',
    stages: 7,
    hasAudit: true,
    showWizard: (ctx) => {
      const { showCodeGenerationWizard } = require('./code-generation-wizard');
      showCodeGenerationWizard(ctx);
    },
  },
  {
    id: 'research-report',
    name: 'Research Report',
    icon: '🔬',
    description: 'Conduct research and generate comprehensive reports',
    stages: 6,
    hasAudit: false,
    showWizard: (ctx) => {
      const { showResearchWizard } = require('./research-wizard');
      showResearchWizard(ctx);
    },
  },
  {
    id: 'translation',
    name: 'Translation',
    icon: '🌍',
    description: 'Translate content between languages with review',
    stages: 6,
    hasAudit: true,
    showWizard: (ctx) => {
      const { showTranslationWizard } = require('./translation-wizard');
      showTranslationWizard(ctx);
    },
  },
  {
    id: 'adapter-generator',
    name: 'Adapter Generator',
    icon: '🔧',
    description: 'Create new adapter XML files from requirements',
    stages: 7,
    hasAudit: true,
    showWizard: (ctx) => {
      const { showAdapterGeneratorWizard } = require('./adapter-generator-wizard');
      showAdapterGeneratorWizard(ctx);
    },
  },
  {
    id: 'custom-legacy',
    name: 'Custom (Legacy)',
    icon: '⚙️',
    description: 'Manual configuration - legacy POC wizard',
    stages: 3,
    hasAudit: false,
    showWizard: (ctx) => {
      // Uses existing wizard-provider.ts
      const { showProjectWizard } = require('../wizard-provider');
      showProjectWizard(ctx);
    },
  },
];

/**
 * Get adapter info by ID
 */
export function getAdapterInfo(adapterId: string): AdapterInfo | undefined {
  return ADAPTER_REGISTRY.find(a => a.id === adapterId);
}

/**
 * Get all adapter IDs
 */
export function getAdapterIds(): string[] {
  return ADAPTER_REGISTRY.map(a => a.id);
}

// =============================================================================
// RE-EXPORT SHARED UTILITIES (defined in shared.ts to avoid circular deps)
// =============================================================================
export { getNonce, getBaseStyles } from './shared';
