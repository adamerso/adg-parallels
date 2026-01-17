/**
 * MCP Server Registration for VS Code
 * 
 * Registers ADG-Parallels tools with VS Code's Language Model Tools API.
 * This allows AI assistants like GitHub Copilot to use ADG functionality.
 */

import * as vscode from 'vscode';
import { MCP_TOOLS, executeTool, McpToolResult } from './mcp-tools';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Registered tool disposables for cleanup
 */
let registeredTools: vscode.Disposable[] = [];

// =============================================================================
// TOOL REGISTRATION
// =============================================================================

/**
 * Register all ADG-Parallels tools with VS Code's Language Model API
 */
export async function registerMcpTools(context: vscode.ExtensionContext): Promise<void> {
  // Check if the Language Model Tools API is available
  if (!vscode.lm || !vscode.lm.registerTool) {
    console.log('[MCP] Language Model Tools API not available (VS Code < 1.99 or API not enabled)');
    return;
  }

  console.log('[MCP] Registering ADG-Parallels MCP tools...');

  for (const tool of MCP_TOOLS) {
    try {
      const disposable = vscode.lm.registerTool(
        `adg-parallels.${tool.name}`,
        new AdgTool(tool.name, tool.description, tool.inputSchema)
      );
      registeredTools.push(disposable);
      context.subscriptions.push(disposable);
      console.log(`[MCP] Registered tool: ${tool.name}`);
    } catch (error: any) {
      console.error(`[MCP] Failed to register tool ${tool.name}: ${error.message}`);
    }
  }

  console.log(`[MCP] Successfully registered ${registeredTools.length} tools`);
}

/**
 * Unregister all MCP tools
 */
export function unregisterMcpTools(): void {
  for (const disposable of registeredTools) {
    disposable.dispose();
  }
  registeredTools = [];
  console.log('[MCP] Unregistered all tools');
}

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

/**
 * Implementation of a single ADG tool for the Language Model API
 */
class AdgTool implements vscode.LanguageModelTool<Record<string, any>> {
  private toolName: string;
  private toolDescription: string;
  private schema: any;

  constructor(name: string, description: string, inputSchema: any) {
    this.toolName = name;
    this.toolDescription = description;
    this.schema = inputSchema;
  }

  /**
   * Prepare the tool invocation (validation, confirmation if needed)
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, any>>,
    token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    // For most tools, no confirmation needed
    // Could add confirmation for destructive operations in the future
    return {
      invocationMessage: `Executing ${this.toolName}...`,
    };
  }

  /**
   * Execute the tool
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<Record<string, any>>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const args = options.input || {};
    
    // Execute the tool
    const result = await executeTool(this.toolName, args);
    
    // Format result for LM API
    if (result.success) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(result.data, null, 2)),
      ]);
    } else {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Error: ${result.error}`),
      ]);
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get list of registered tool names
 */
export function getRegisteredToolNames(): string[] {
  return MCP_TOOLS.map(t => t.name);
}

/**
 * Check if MCP tools are available
 */
export function isMcpAvailable(): boolean {
  return !!(vscode.lm && vscode.lm.registerTool);
}
