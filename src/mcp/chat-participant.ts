/**
 * ADG-Parallels Chat Participant
 * 
 * Registers `@adg` chat participant for GitHub Copilot Chat,
 * enabling AI to use ADG-Parallels tools for project management.
 * 
 * Usage in Copilot Chat:
 *   @adg show me the project status
 *   @adg list all pending tasks
 *   @adg what workers are active?
 */

import * as vscode from 'vscode';
import { MCP_TOOLS } from './mcp-tools';

// =============================================================================
// CONSTANTS
// =============================================================================

const PARTICIPANT_ID = 'adg-parallels.adg';
const PARTICIPANT_NAME = 'adg';

// System prompt explaining ADG context and available tools
const SYSTEM_PROMPT = `You are an AI assistant specialized in ADG-Parallels, a parallel task processing system.

ADG-Parallels uses a hierarchical worker structure:
- CEO: Top-level project coordinator
- STRATOP: Strategic operations manager
- DELIVCO: Delivery coordinator  
- MANAGOP: Management operations
- TEAMLEAD: Team leader
- WORKER: Individual task executor (nicknamed "ejajka" 🥚)

Workers are organized in folders named like: .adg-parallels_CEO_4_1_00001
The runtime state is stored in SQLite (runtime.db) in the CEO folder.

You have access to ADG tools that let you:
- Check project status and progress
- List and filter tasks by status/layer
- Monitor worker health and activity
- View audit logs and events
- Manage task lifecycle (claim, complete, fail)

Always be helpful and provide actionable insights about the project state.
Use Polish language when responding, but keep technical terms in English.`;

// =============================================================================
// CHAT PARTICIPANT
// =============================================================================

let chatParticipant: vscode.ChatParticipant | undefined;

/**
 * Register the @adg chat participant
 */
export function registerChatParticipant(context: vscode.ExtensionContext): void {
  // Check if chat API is available
  if (!vscode.chat || !vscode.chat.createChatParticipant) {
    console.log('[ADG Chat] Chat Participant API not available');
    return;
  }

  console.log('[ADG Chat] Registering @adg chat participant...');

  try {
    chatParticipant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handleChatRequest);
    
    // Set participant properties
    chatParticipant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icons', 'adg-icon.png');
    
    // Handle feedback
    chatParticipant.onDidReceiveFeedback((feedback) => {
      console.log('[ADG Chat] Received feedback:', feedback.result, feedback.kind);
    });

    context.subscriptions.push(chatParticipant);
    console.log('[ADG Chat] @adg chat participant registered successfully!');
  } catch (error: any) {
    console.error('[ADG Chat] Failed to register chat participant:', error.message);
  }
}

/**
 * Unregister the chat participant
 */
export function unregisterChatParticipant(): void {
  if (chatParticipant) {
    chatParticipant.dispose();
    chatParticipant = undefined;
    console.log('[ADG Chat] @adg chat participant unregistered');
  }
}

/**
 * Main chat request handler
 */
const handleChatRequest: vscode.ChatRequestHandler = async (
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> => {
  
  console.log('[ADG Chat] Handling request:', request.prompt);
  console.log('[ADG Chat] All available tools:', vscode.lm.tools.map(t => t.name));

  // Get available ADG tools
  const adgTools = vscode.lm.tools.filter(tool => 
    tool.name.startsWith('adg-parallels.')
  );

  console.log('[ADG Chat] ADG tools found:', adgTools.length);

  if (adgTools.length === 0) {
    // Debug: show what tools ARE available
    const allToolNames = vscode.lm.tools.map(t => t.name).join(', ');
    stream.markdown(`⚠️ **ADG tools not available.** Make sure the extension is properly activated.\n\n_Debug: Available tools: ${allToolNames || 'none'}_\n`);
    return { metadata: { error: 'No tools available' } };
  }

  // Get tool invocation token from request (required for invoking tools)
  const toolToken = request.toolInvocationToken;

  // Build messages array with system context
  const messages: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
  ];

  // Add conversation history for context
  for (const turn of context.history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
    } else if (turn instanceof vscode.ChatResponseTurn) {
      // Extract text from response
      let responseText = '';
      for (const part of turn.response) {
        if (part instanceof vscode.ChatResponseMarkdownPart) {
          responseText += part.value.value;
        }
      }
      if (responseText) {
        messages.push(vscode.LanguageModelChatMessage.Assistant(responseText));
      }
    }
  }

  // Add current request
  messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

  try {
    // Get the model to use
    const [model] = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      family: 'gpt-4o',
    });

    if (!model) {
      stream.markdown('❌ No language model available. Please ensure GitHub Copilot is active.\n');
      return { metadata: { error: 'No model' } };
    }

    // Send request with tools enabled
    const response = await model.sendRequest(
      messages,
      {
        tools: adgTools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      },
      token
    );

    // Process response stream
    let toolCallsProcessed = 0;
    const maxToolCalls = 10; // Prevent infinite loops

    for await (const part of response.stream) {
      if (token.isCancellationRequested) {
        break;
      }

      if (part instanceof vscode.LanguageModelTextPart) {
        // Stream text directly to chat
        stream.markdown(part.value);
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        // Handle tool call
        if (toolCallsProcessed >= maxToolCalls) {
          stream.markdown('\n⚠️ Maximum tool calls reached.\n');
          break;
        }

        console.log('[ADG Chat] Tool call:', part.name, part.input);
        toolCallsProcessed++;

        // Show tool being invoked
        stream.progress(`Executing ${part.name.replace('adg-parallels.', '')}...`);

        try {
          // Invoke the tool with required toolInvocationToken
          const toolResult = await vscode.lm.invokeTool(part.name, {
            input: part.input,
            toolInvocationToken: toolToken,
          }, token);

          // Extract result text
          let resultText = '';
          for (const content of toolResult.content) {
            if (content instanceof vscode.LanguageModelTextPart) {
              resultText += content.value;
            }
          }

          // Format result nicely
          stream.markdown('\n```json\n' + resultText + '\n```\n');

          // Continue conversation with tool result for follow-up
          messages.push(vscode.LanguageModelChatMessage.Assistant([
            new vscode.LanguageModelToolCallPart(part.callId, part.name, part.input),
          ]));
          messages.push(vscode.LanguageModelChatMessage.User([
            new vscode.LanguageModelToolResultPart(part.callId, [
              new vscode.LanguageModelTextPart(resultText),
            ]),
          ]));

        } catch (toolError: any) {
          stream.markdown(`\n❌ Tool error: ${toolError.message}\n`);
        }
      }
    }

    return { metadata: { toolCallsProcessed } };

  } catch (error: any) {
    console.error('[ADG Chat] Request error:', error);
    stream.markdown(`\n❌ Error: ${error.message}\n`);
    return { metadata: { error: error.message } };
  }
};

/**
 * Check if chat participant is available
 */
export function isChatParticipantAvailable(): boolean {
  return !!(vscode.chat && vscode.chat.createChatParticipant);
}
