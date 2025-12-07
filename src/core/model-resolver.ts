/**
 * Model Resolver for ADG-Parallels v0.3.0
 * 
 * Maps model names from adapters (e.g., "gpt-4o", "claude-sonnet") 
 * to actual VS Code Language Model API models.
 */

import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { ModelInfo } from '../types';

// =============================================================================
// MODEL NAME MAPPINGS
// =============================================================================

/**
 * Known model name mappings
 * Maps adapter model names to vscode.lm family patterns
 */
const MODEL_MAPPINGS: Record<string, { vendor?: string; family: string }> = {
    // OpenAI models
    'gpt-4o': { vendor: 'copilot', family: 'gpt-4o' },
    'gpt-4o-mini': { vendor: 'copilot', family: 'gpt-4o-mini' },
    'gpt-4': { vendor: 'copilot', family: 'gpt-4' },
    'gpt-4-turbo': { vendor: 'copilot', family: 'gpt-4-turbo' },
    'gpt-3.5-turbo': { vendor: 'copilot', family: 'gpt-3.5-turbo' },
    
    // Claude models
    'claude-sonnet': { vendor: 'copilot', family: 'claude-3.5-sonnet' },
    'claude-3.5-sonnet': { vendor: 'copilot', family: 'claude-3.5-sonnet' },
    'claude-opus': { vendor: 'copilot', family: 'claude-3-opus' },
    'claude-3-opus': { vendor: 'copilot', family: 'claude-3-opus' },
    'claude-haiku': { vendor: 'copilot', family: 'claude-3-haiku' },
    
    // Gemini models
    'gemini-pro': { vendor: 'copilot', family: 'gemini-1.5-pro' },
    'gemini-1.5-pro': { vendor: 'copilot', family: 'gemini-1.5-pro' },
    
    // Aliases
    'sonnet': { vendor: 'copilot', family: 'claude-3.5-sonnet' },
    'opus': { vendor: 'copilot', family: 'claude-3-opus' },
    'haiku': { vendor: 'copilot', family: 'claude-3-haiku' },
};

// =============================================================================
// CACHED MODELS
// =============================================================================

let cachedModels: vscode.LanguageModelChat[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Resolve model name from adapter to VS Code LM model
 * 
 * @param modelName Model name from adapter (e.g., "gpt-4o", "claude-sonnet")
 * @returns VS Code Language Model Chat instance
 */
export async function resolveModel(modelName: string): Promise<vscode.LanguageModelChat> {
    logger.debug(`Resolving model: ${modelName}`);
    
    // Get mapping
    const mapping = MODEL_MAPPINGS[modelName.toLowerCase()];
    
    if (!mapping) {
        logger.warn(`Unknown model name: ${modelName}, attempting direct family match`);
    }
    
    const family = mapping?.family || modelName;
    const vendor = mapping?.vendor || 'copilot';
    
    // Try to find matching model
    const models = await getAvailableModelsRaw();
    
    // First try exact family match
    let matchedModel = models.find(m => 
        m.family.toLowerCase() === family.toLowerCase() &&
        m.vendor.toLowerCase() === vendor.toLowerCase()
    );
    
    // If not found, try partial match
    if (!matchedModel) {
        matchedModel = models.find(m => 
            m.family.toLowerCase().includes(family.toLowerCase()) ||
            family.toLowerCase().includes(m.family.toLowerCase())
        );
    }
    
    // If still not found, try any model from vendor
    if (!matchedModel) {
        matchedModel = models.find(m => m.vendor.toLowerCase() === vendor.toLowerCase());
    }
    
    // Last resort - first available model
    if (!matchedModel && models.length > 0) {
        logger.warn(`Could not find model matching ${modelName}, using first available`);
        matchedModel = models[0];
    }
    
    if (!matchedModel) {
        throw new Error(`No language models available. Requested: ${modelName}`);
    }
    
    logger.info(`Resolved ${modelName} → ${matchedModel.vendor}/${matchedModel.family}`);
    return matchedModel;
}

/**
 * Get list of available models with their info (v0.3.0)
 */
export async function getAvailableModelsInfo(): Promise<ModelInfo[]> {
    const models = await getAvailableModelsRaw();
    
    return models.map(m => ({
        name: m.family,
        vendor: m.vendor,
        family: m.family,
        available: true
    }));
}

/**
 * Check if a specific model is available
 */
export async function isModelAvailable(modelName: string): Promise<boolean> {
    try {
        await resolveModel(modelName);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get all supported model names (for UI/autocomplete)
 */
export function getSupportedModelNames(): string[] {
    return Object.keys(MODEL_MAPPINGS);
}

/**
 * Add custom model mapping at runtime
 */
export function addModelMapping(name: string, vendor: string, family: string): void {
    MODEL_MAPPINGS[name.toLowerCase()] = { vendor, family };
    logger.debug(`Added model mapping: ${name} → ${vendor}/${family}`);
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Get raw model list from VS Code API with caching
 */
async function getAvailableModelsRaw(): Promise<vscode.LanguageModelChat[]> {
    const now = Date.now();
    
    // Return cached if fresh
    if (cachedModels && (now - cacheTimestamp) < CACHE_TTL) {
        return cachedModels;
    }
    
    // Fetch fresh list
    try {
        cachedModels = await vscode.lm.selectChatModels({});
        cacheTimestamp = now;
        
        logger.debug(`Fetched ${cachedModels.length} available models`);
        
        return cachedModels;
    } catch (error) {
        logger.error('Failed to fetch language models', error);
        
        // Return cached if available, even if stale
        if (cachedModels) {
            logger.warn('Using stale model cache');
            return cachedModels;
        }
        
        throw error;
    }
}

/**
 * Invalidate model cache (call when models might have changed)
 */
export function invalidateModelCache(): void {
    cachedModels = null;
    cacheTimestamp = 0;
    logger.debug('Model cache invalidated');
}

/**
 * Get model info string for logging/debugging
 */
export function getModelInfoString(model: vscode.LanguageModelChat): string {
    return `${model.vendor}/${model.family} (${model.name || 'unnamed'})`;
}

// =============================================================================
// MODEL PREFERENCES (from adapter context)
// =============================================================================

/**
 * Resolve model from stage executor or fallback to default
 */
export async function resolveStageExecutor(
    executor: string | undefined,
    defaultModel: string = 'gpt-4o'
): Promise<vscode.LanguageModelChat> {
    const modelName = executor || defaultModel;
    return resolveModel(modelName);
}

/**
 * Get best available model for a task type
 */
export async function getBestModelForTask(
    taskType: 'generation' | 'review' | 'audit' | 'research' | 'transformation'
): Promise<vscode.LanguageModelChat> {
    // Default model preferences by task type
    const preferences: Record<string, string[]> = {
        'generation': ['gpt-4o', 'claude-sonnet', 'gpt-4'],
        'review': ['claude-sonnet', 'gpt-4o', 'claude-opus'],
        'audit': ['gpt-4o', 'claude-opus', 'claude-sonnet'],
        'research': ['gpt-4o', 'claude-sonnet', 'gemini-pro'],
        'transformation': ['gpt-4o-mini', 'gpt-4o', 'claude-haiku']
    };
    
    const modelList = preferences[taskType] || ['gpt-4o'];
    
    for (const modelName of modelList) {
        try {
            return await resolveModel(modelName);
        } catch {
            // Try next model in preference list
            continue;
        }
    }
    
    // Fallback to any available
    const models = await getAvailableModelsRaw();
    if (models.length === 0) {
        throw new Error('No language models available');
    }
    
    return models[0];
}
