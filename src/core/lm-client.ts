/**
 * ADG-Parallels Language Model Client
 * 
 * Wrapper around VS Code's Language Model API (vscode.lm)
 * for sending prompts to Copilot models.
 */

import * as vscode from 'vscode';
import { logger } from '../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface LMClientConfig {
  /** Model vendor (default: 'copilot') */
  vendor?: string;
  /** Model family (default: 'gpt-4o') */
  family?: string;
  /** Timeout in milliseconds (default: 120000 = 2 min) */
  timeout?: number;
  /** Include statute in system message */
  includeStatute?: boolean;
}

export interface LMRequestOptions {
  /** System message to prepend */
  systemMessage?: string;
  /** Cancellation token */
  token?: vscode.CancellationToken;
  /** Callback for streaming chunks */
  onChunk?: (chunk: string) => void;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

export interface LMResponse {
  /** Full response text */
  text: string;
  /** Whether the response was truncated */
  truncated: boolean;
  /** Model used */
  model: string;
  /** Token count (if available) */
  tokenCount?: number;
  /** Duration in milliseconds */
  durationMs: number;
}

// =============================================================================
// MODEL SELECTION
// =============================================================================

/**
 * Get available language models
 */
export async function getAvailableModels(
  vendor?: string
): Promise<vscode.LanguageModelChat[]> {
  try {
    const selector: vscode.LanguageModelChatSelector = vendor ? { vendor } : {};
    const models = await vscode.lm.selectChatModels(selector);
    
    logger.info(`Found ${models.length} language models`, {
      models: models.map(m => ({ id: m.id, family: m.family, vendor: m.vendor }))
    });
    
    return models;
  } catch (error) {
    logger.error('Failed to get available models', error);
    return [];
  }
}

/**
 * Select a specific model by vendor and family
 */
export async function selectModel(
  vendor: string = 'copilot',
  family?: string
): Promise<vscode.LanguageModelChat | null> {
  try {
    // First try with specific vendor
    let selector: vscode.LanguageModelChatSelector = { vendor };
    if (family) {
      (selector as { vendor: string; family?: string }).family = family;
    }
    
    let models = await vscode.lm.selectChatModels(selector);
    
    // If no models found with specific vendor, try without vendor filter
    if (models.length === 0) {
      logger.warn(`No models found for vendor: ${vendor}, trying all available models...`);
      models = await vscode.lm.selectChatModels({});
    }

    if (models.length === 0) {
      logger.error('No language models available at all');
      // Show available models for debugging
      vscode.window.showErrorMessage(
        'No language models found. Make sure GitHub Copilot Chat is installed and you are signed in.',
        'Open Extensions'
      ).then(action => {
        if (action === 'Open Extensions') {
          vscode.commands.executeCommand('workbench.extensions.search', 'GitHub Copilot');
        }
      });
      return null;
    }

    // Log all available models for debugging
    logger.info(`Available models: ${models.map(m => `${m.vendor}/${m.family}/${m.id}`).join(', ')}`);

    // Prefer the specified family, or take the first available
    const model = family 
      ? models.find(m => m.family === family) || models[0]
      : models[0];

    logger.info(`Selected model: ${model.id}`, { 
      family: model.family, 
      vendor: model.vendor,
      maxInputTokens: model.maxInputTokens 
    });

    return model;
  } catch (error) {
    logger.error('Failed to select model', { vendor, family, error });
    return null;
  }
}

// =============================================================================
// LM CLIENT CLASS
// =============================================================================

export class LMClient {
  private config: Required<LMClientConfig>;
  private model: vscode.LanguageModelChat | null = null;

  constructor(config: LMClientConfig = {}) {
    this.config = {
      vendor: config.vendor ?? 'copilot',
      family: config.family ?? 'gpt-4o',
      timeout: config.timeout ?? 120000,
      includeStatute: config.includeStatute ?? false,
    };
  }

  /**
   * Initialize the client by selecting the model
   */
  async initialize(): Promise<boolean> {
    this.model = await selectModel(this.config.vendor, this.config.family);
    return this.model !== null;
  }

  /**
   * Check if the client is ready
   */
  isReady(): boolean {
    return this.model !== null;
  }

  /**
   * Get the current model info
   */
  getModelInfo(): { id: string; family: string; vendor: string } | null {
    if (!this.model) {
      return null;
    }
    return {
      id: this.model.id,
      family: this.model.family,
      vendor: this.model.vendor,
    };
  }

  /**
   * Send a prompt and get the full response
   */
  async sendPrompt(
    prompt: string,
    options: LMRequestOptions = {}
  ): Promise<LMResponse> {
    if (!this.model) {
      throw new Error('LM Client not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    
    // Build messages
    const messages: vscode.LanguageModelChatMessage[] = [];

    // Add system message if provided
    if (options.systemMessage) {
      messages.push(
        vscode.LanguageModelChatMessage.User(
          `[SYSTEM INSTRUCTIONS]\n${options.systemMessage}\n[END SYSTEM INSTRUCTIONS]\n\n`
        )
      );
    }

    // Add the main prompt
    messages.push(vscode.LanguageModelChatMessage.User(prompt));

    // Create cancellation token if not provided
    const tokenSource = new vscode.CancellationTokenSource();
    const token = options.token ?? tokenSource.token;

    // Set timeout
    const timeoutId = setTimeout(() => {
      tokenSource.cancel();
      logger.warn('LM request timed out', { timeout: this.config.timeout });
    }, this.config.timeout);

    try {
      options.onProgress?.('Sending request to language model...');

      const response = await this.model.sendRequest(messages, {}, token);

      options.onProgress?.('Receiving response...');

      // Stream the response
      let fullText = '';
      let truncated = false;

      for await (const chunk of response.text) {
        fullText += chunk;
        options.onChunk?.(chunk);

        // Safety limit
        if (fullText.length > 500000) {
          truncated = true;
          logger.warn('Response truncated due to size limit');
          break;
        }
      }

      clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;
      
      logger.info('LM request completed', {
        model: this.model.id,
        promptLength: prompt.length,
        responseLength: fullText.length,
        durationMs,
      });

      return {
        text: fullText,
        truncated,
        model: this.model.id,
        durationMs,
      };

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof vscode.LanguageModelError) {
        logger.error('Language model error', {
          message: error.message,
          code: error.code,
        });

        // Handle specific error types
        if (error.code === 'NoPermissions') {
          throw new Error('User consent not given for language model access');
        }
        if (error.code === 'NotFound') {
          throw new Error('Language model not found');
        }
        if (error.code === 'Blocked') {
          throw new Error('Request blocked - quota exceeded or content filtered');
        }
      }

      throw error;
    }
  }

  /**
   * Send a prompt with conversation history
   */
  async sendConversation(
    conversation: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: LMRequestOptions = {}
  ): Promise<LMResponse> {
    if (!this.model) {
      throw new Error('LM Client not initialized. Call initialize() first.');
    }

    const startTime = Date.now();

    // Build messages from conversation
    const messages: vscode.LanguageModelChatMessage[] = [];

    // Add system message if provided
    if (options.systemMessage) {
      messages.push(
        vscode.LanguageModelChatMessage.User(
          `[SYSTEM INSTRUCTIONS]\n${options.systemMessage}\n[END SYSTEM INSTRUCTIONS]\n\n`
        )
      );
    }

    // Add conversation messages
    for (const msg of conversation) {
      if (msg.role === 'user') {
        messages.push(vscode.LanguageModelChatMessage.User(msg.content));
      } else {
        messages.push(vscode.LanguageModelChatMessage.Assistant(msg.content));
      }
    }

    // Create cancellation token
    const tokenSource = new vscode.CancellationTokenSource();
    const token = options.token ?? tokenSource.token;

    const timeoutId = setTimeout(() => {
      tokenSource.cancel();
    }, this.config.timeout);

    try {
      const response = await this.model.sendRequest(messages, {}, token);

      let fullText = '';
      for await (const chunk of response.text) {
        fullText += chunk;
        options.onChunk?.(chunk);
      }

      clearTimeout(timeoutId);

      return {
        text: fullText,
        truncated: false,
        model: this.model.id,
        durationMs: Date.now() - startTime,
      };

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Count tokens in a text
   */
  async countTokens(text: string): Promise<number> {
    if (!this.model) {
      throw new Error('LM Client not initialized');
    }
    return await this.model.countTokens(text);
  }

  /**
   * Check if a prompt fits within the model's context window
   */
  async checkFits(text: string): Promise<{ fits: boolean; tokens: number; maxTokens: number }> {
    if (!this.model) {
      throw new Error('LM Client not initialized');
    }

    const tokens = await this.countTokens(text);
    const maxTokens = this.model.maxInputTokens;

    return {
      fits: tokens < maxTokens * 0.9, // Leave 10% buffer
      tokens,
      maxTokens,
    };
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an LM client for a specific role
 */
export function createLMClientForRole(role: string): LMClient {
  // Different models for different roles
  const roleConfigs: Record<string, LMClientConfig> = {
    ceo: { vendor: 'copilot', family: 'claude-3.5-sonnet' },
    manager: { vendor: 'copilot', family: 'claude-3.5-sonnet' },
    teamlead: { vendor: 'copilot', family: 'gpt-4o' },
    worker: { vendor: 'copilot', family: 'gpt-4o' },
  };

  const config = roleConfigs[role] ?? roleConfigs.worker;
  return new LMClient(config);
}

/**
 * Create a default LM client
 */
export function createDefaultLMClient(): LMClient {
  return new LMClient({
    vendor: 'copilot',
    family: 'gpt-4o',
    timeout: 120000,
  });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Quick send - create client, send prompt, return response
 */
export async function quickSend(
  prompt: string,
  options: LMClientConfig & LMRequestOptions = {}
): Promise<string> {
  const client = new LMClient(options);
  
  if (!await client.initialize()) {
    throw new Error('Failed to initialize LM client');
  }

  const response = await client.sendPrompt(prompt, options);
  return response.text;
}
