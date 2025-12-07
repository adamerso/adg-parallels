/**
 * Pipeline Engine for ADG-Parallels v0.3.0
 * 
 * Executes pipeline stages defined in adapters.
 * This is the "dumb executor" - all logic comes from adapter definitions.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { 
    PipelineAdapter, 
    PipelineStage, 
    PipelineTask, 
    StageExecutionResult,
    StageHistoryEntry,
    AuditResultRecord
} from '../types';
import { resolveModel, getModelInfoString } from './model-resolver';
import { logger } from '../utils/logger';

// =============================================================================
// STAGE HELPERS (moved to top for hoisting)
// =============================================================================

/**
 * Get stage by ID from adapter (v0.3.0: ID is string)
 */
export function getStage(adapter: PipelineAdapter, stageId: string): PipelineStage | undefined {
    return adapter.pipeline.find(s => s.id === stageId);
}

/**
 * Get stage by name from adapter
 */
export function getStageByName(adapter: PipelineAdapter, stageName: string): PipelineStage | undefined {
    return adapter.pipeline.find(s => s.name === stageName);
}

/**
 * Get first non-terminal stage (usually "unassigned")
 */
export function getInitialStage(adapter: PipelineAdapter): PipelineStage | undefined {
    return adapter.pipeline.find(s => !s.isTerminal);
}

/**
 * Get first working stage after initial
 */
export function getFirstWorkingStage(adapter: PipelineAdapter): PipelineStage | undefined {
    return adapter.pipeline.find(s => 
        !s.isTerminal && 
        s.executor !== undefined &&
        s.name !== 'unassigned'
    );
}

/**
 * Check if stage is claimable (can be assigned to worker)
 * A stage is claimable if it has an executor (working stage) or is a queue stage
 */
export function isClaimableStage(adapter: PipelineAdapter, stageId: string): boolean {
    const stage = adapter.pipeline.find(s => s.id === stageId);
    if (!stage) return false;
    
    // Working stages (with executor) are claimable
    if (stage.executor) return true;
    
    // Initial and waiting stages are claimable for auto-transition
    if (stage.name === 'unassigned' || stage.name.startsWith('awaiting_')) {
        return true;
    }
    
    return false;
}

/**
 * Check if stage is claimable by stage name
 */
export function isClaimableStageName(stageName: string): boolean {
    return stageName === 'unassigned' || 
           stageName.startsWith('awaiting_') ||
           stageName === 'pending';
}

/**
 * Get next working stage after a waiting stage
 */
export function getNextWorkingStage(
    adapter: PipelineAdapter, 
    currentStageName: string
): PipelineStage | undefined {
    const currentIndex = adapter.pipeline.findIndex(s => s.name === currentStageName);
    if (currentIndex === -1) return undefined;
    
    for (let i = currentIndex + 1; i < adapter.pipeline.length; i++) {
        const stage = adapter.pipeline[i];
        if (stage.executor && !stage.isTerminal) {
            return stage;
        }
    }
    
    return undefined;
}

// =============================================================================
// STAGE EXECUTION
// =============================================================================

/**
 * Execute a single pipeline stage for a task
 */
export async function executeStage(
    task: PipelineTask,
    adapter: PipelineAdapter,
    outputDir: string,
    onProgress?: (message: string) => void
): Promise<StageExecutionResult> {
    const startTime = Date.now();
    
    // Get current stage from adapter
    const stage = getStage(adapter, task.currentStageId);
    if (!stage) {
        return {
            success: false,
            output: '',
            durationMs: 0,
            error: `Stage ${task.currentStageId} not found in adapter ${adapter.id}`
        };
    }
    
    logger.info(`Executing stage: ${stage.name} (${stage.id}) for task ${task.id}`);
    onProgress?.(`Starting stage: ${stage.name}`);
    
    // Terminal stages don't execute
    if (stage.isTerminal) {
        logger.debug(`Stage ${stage.name} is terminal, no execution needed`);
        return {
            success: true,
            output: '',
            durationMs: 0,
            nextStageId: undefined,
            nextStageName: undefined
        };
    }
    
    try {
        // 1. Resolve executor (model)
        const model = await resolveModel(stage.executor || 'gpt-4o');
        logger.debug(`Using model: ${getModelInfoString(model)}`);
        onProgress?.(`Model: ${stage.executor || 'gpt-4o'}`);
        
        // 2. Gather inputs from previous stages
        const inputs = await gatherInputs(stage, task, outputDir);
        logger.debug(`Gathered ${Object.keys(inputs).length} inputs`);
        
        // 3. Build prompt from task-to-fulfill + inputs
        const prompt = buildPrompt(stage, task, inputs);
        
        // 4. Execute with model
        onProgress?.(`Executing with ${stage.executor || 'gpt-4o'}...`);
        const output = await executeWithModel(model, prompt);
        
        // 5. Validate output (forbidden patterns for audit stages)
        let forbiddenPatternsFound: string[] = [];
        let auditPassed: boolean | undefined;
        
        if (stage.isAudit && stage.forbiddenPatterns) {
            forbiddenPatternsFound = checkForbiddenPatterns(output, stage.forbiddenPatterns);
            
            // Determine audit pass/fail
            if (stage.auditResult) {
                auditPassed = forbiddenPatternsFound.length === 0 && 
                              checkAuditCriteria(output, stage.auditResult.passCriteria);
            }
        }
        
        // 6. Save stage output
        const outputPath = await saveStageOutput(task, stage, output, outputDir);
        
        // 7. Determine next stage via routing
        const { nextStageId, nextStageName } = determineNextStage(
            stage, 
            adapter, 
            auditPassed
        );
        
        const durationMs = Date.now() - startTime;
        logger.info(`Stage ${stage.name} completed in ${durationMs}ms`);
        
        return {
            success: true,
            output,
            durationMs,
            nextStageId,
            nextStageName,
            forbiddenPatternsFound,
            auditPassed
        };
        
    } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        logger.error(`Stage ${stage.name} failed: ${errorMessage}`);
        
        return {
            success: false,
            output: '',
            durationMs,
            error: errorMessage
        };
    }
}

// =============================================================================
// INPUT GATHERING
// =============================================================================

/**
 * Gather inputs from previous stages
 */
async function gatherInputs(
    stage: PipelineStage,
    task: PipelineTask,
    outputDir: string
): Promise<Record<string, string>> {
    const inputs: Record<string, string> = {};
    
    if (!stage.input) {
        return inputs;
    }
    
    for (const inputDef of stage.input) {
        if (inputDef.sourceStage === 'initial') {
            // Initial stage = task definition itself
            inputs[inputDef.name] = buildTaskDefinitionInput(task);
        } else {
            // Get output from previous stage
            const stageOutput = task.stageOutputs[inputDef.sourceStage];
            if (stageOutput) {
                // Could be inline or file path
                if (fs.existsSync(stageOutput)) {
                    inputs[inputDef.name] = fs.readFileSync(stageOutput, 'utf-8');
                } else {
                    inputs[inputDef.name] = stageOutput;
                }
            } else {
                logger.warn(`Input ${inputDef.name} from ${inputDef.sourceStage} not found`);
                inputs[inputDef.name] = `[Missing input from ${inputDef.sourceStage}]`;
            }
        }
    }
    
    return inputs;
}

/**
 * Build task definition as input string
 */
function buildTaskDefinitionInput(task: PipelineTask): string {
    let input = `# Task: ${task.title}\n\n`;
    
    if (task.description) {
        input += `## Description\n${task.description}\n\n`;
    }
    
    if (task.params && Object.keys(task.params).length > 0) {
        input += `## Parameters\n`;
        for (const [key, value] of Object.entries(task.params)) {
            input += `- **${key}**: ${JSON.stringify(value)}\n`;
        }
    }
    
    return input;
}

// =============================================================================
// PROMPT BUILDING
// =============================================================================

/**
 * Build prompt from stage definition and inputs
 */
function buildPrompt(
    stage: PipelineStage,
    task: PipelineTask,
    inputs: Record<string, string>
): string {
    let prompt = '';
    
    // Add task-to-fulfill (main instructions)
    prompt += `# Instructions\n\n${stage.taskToFulfill}\n\n`;
    
    // Add inputs
    if (Object.keys(inputs).length > 0) {
        prompt += `# Inputs\n\n`;
        for (const [name, content] of Object.entries(inputs)) {
            prompt += `## ${name}\n\n${content}\n\n`;
        }
    }
    
    // Add output instructions if specified
    if (stage.output?.instructions) {
        prompt += `# Expected Output\n\n${stage.output.instructions}\n\n`;
    }
    
    // Add completion detection hint
    if (stage.completionDetection?.fallbackSignal) {
        prompt += `\n---\nWhen finished, include: ${stage.completionDetection.fallbackSignal}\n`;
    }
    
    return prompt;
}

// =============================================================================
// MODEL EXECUTION
// =============================================================================

/**
 * Execute prompt with model
 */
async function executeWithModel(
    model: vscode.LanguageModelChat,
    prompt: string
): Promise<string> {
    const messages = [
        vscode.LanguageModelChatMessage.User(prompt)
    ];
    
    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
    
    // Collect streamed response
    let output = '';
    for await (const chunk of response.text) {
        output += chunk;
    }
    
    return output;
}

// =============================================================================
// OUTPUT HANDLING
// =============================================================================

/**
 * Save stage output to file
 */
async function saveStageOutput(
    task: PipelineTask,
    stage: PipelineStage,
    output: string,
    outputDir: string
): Promise<string> {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Generate filename
    const filename = `${task.id}_${stage.name}.md`;
    const outputPath = path.join(outputDir, filename);
    
    // Save output
    fs.writeFileSync(outputPath, output, 'utf-8');
    
    logger.debug(`Saved stage output: ${outputPath}`);
    
    return outputPath;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Check for forbidden patterns in output
 */
function checkForbiddenPatterns(
    output: string,
    patterns: Array<{ pattern: string; reason: string }>
): string[] {
    const found: string[] = [];
    
    for (const { pattern, reason } of patterns) {
        if (output.toLowerCase().includes(pattern.toLowerCase())) {
            found.push(`${pattern} (${reason})`);
            logger.warn(`Forbidden pattern found: ${pattern} - ${reason}`);
        }
    }
    
    return found;
}

/**
 * Check audit pass criteria
 * This is a simplified check - in full implementation would parse criteria expression
 */
function checkAuditCriteria(output: string, criteria: string): boolean {
    // Look for PASS/FAIL verdict in output
    const lowerOutput = output.toLowerCase();
    
    if (lowerOutput.includes('verdict: pass') || lowerOutput.includes('## verdict: pass')) {
        return true;
    }
    
    if (lowerOutput.includes('verdict: fail') || lowerOutput.includes('## verdict: fail')) {
        return false;
    }
    
    // Default to pass if no explicit verdict
    logger.warn('No explicit audit verdict found in output');
    return true;
}

// =============================================================================
// ROUTING
// =============================================================================

/**
 * Determine next stage based on routing rules
 */
function determineNextStage(
    currentStage: PipelineStage,
    adapter: PipelineAdapter,
    auditPassed?: boolean
): { nextStageId?: string; nextStageName?: string } {
    // Audit stages have special routing
    if (currentStage.isAudit && currentStage.auditResult) {
        if (auditPassed) {
            return parseRoutingTarget(currentStage.auditResult.onPass.routing, adapter);
        } else {
            return parseRoutingTarget(currentStage.auditResult.onFail.routing, adapter);
        }
    }
    
    // Normal routing
    if (currentStage.nextStage?.routing) {
        return parseRoutingTarget(currentStage.nextStage.routing, adapter);
    }
    
    // Default: next sequential stage
    const currentIndex = adapter.pipeline.findIndex(s => s.id === currentStage.id);
    if (currentIndex >= 0 && currentIndex < adapter.pipeline.length - 1) {
        const nextStage = adapter.pipeline[currentIndex + 1];
        return { nextStageId: nextStage.id, nextStageName: nextStage.name };
    }
    
    return {};
}

/**
 * Parse routing target string to get stage info
 * e.g., "→ awaiting_audit" or "Po zakończeniu → completed"
 */
function parseRoutingTarget(
    routing: string,
    adapter: PipelineAdapter
): { nextStageId?: string; nextStageName?: string } {
    // Extract stage name after arrow
    const arrowMatch = routing.match(/→\s*(\S+)/);
    if (arrowMatch) {
        const stageName = arrowMatch[1];
        const stage = getStageByName(adapter, stageName);
        if (stage) {
            return { nextStageId: stage.id, nextStageName: stage.name };
        }
    }
    
    // Try to find stage name anywhere in routing
    for (const stage of adapter.pipeline) {
        if (routing.includes(stage.name)) {
            return { nextStageId: stage.id, nextStageName: stage.name };
        }
    }
    
    return {};
}

// =============================================================================
// TASK STAGE UPDATES
// =============================================================================

/**
 * Create stage history entry
 */
export function createStageHistoryEntry(
    stage: PipelineStage,
    result: StageExecutionResult
): StageHistoryEntry {
    return {
        stageId: stage.id,
        stageName: stage.name,
        executor: stage.executor || 'unknown',
        startedAt: new Date(Date.now() - result.durationMs).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        result: result.success ? 'completed' : 'failed',
        outputPath: undefined // Set by caller if needed
    };
}

/**
 * Create audit result record
 */
export function createAuditResultRecord(
    stage: PipelineStage,
    result: StageExecutionResult
): AuditResultRecord | undefined {
    if (!stage.isAudit) return undefined;
    
    return {
        stageId: stage.id,
        stageName: stage.name,
        passed: result.auditPassed ?? true,
        forbiddenPatterns: result.forbiddenPatternsFound ?? [],
        routedTo: result.nextStageName ?? 'unknown'
    };
}

// =============================================================================
// FULL PIPELINE EXECUTION
// =============================================================================

/**
 * Execute all remaining stages for a task until completion or waiting state
 */
export async function executePipelineUntilWait(
    task: PipelineTask,
    adapter: PipelineAdapter,
    outputDir: string,
    onProgress?: (stage: string, message: string) => void
): Promise<{
    task: PipelineTask;
    completed: boolean;
    error?: string;
}> {
    let currentTask = { ...task };
    
    while (true) {
        const stage = getStage(adapter, currentTask.currentStageId);
        if (!stage) {
            return { task: currentTask, completed: false, error: `Stage ${currentTask.currentStageId} not found` };
        }
        
        // Terminal stage = completed
        if (stage.isTerminal) {
            return { task: currentTask, completed: stage.name === 'completed' };
        }
        
        // Waiting stage = pause execution (task needs reassignment)
        if (isClaimableStage(adapter, stage.id) && stage.name !== 'unassigned') {
            return { task: currentTask, completed: false };
        }
        
        // Execute stage
        onProgress?.(stage.name, `Executing stage: ${stage.name}`);
        
        const result = await executeStage(
            currentTask, 
            adapter, 
            outputDir,
            (msg) => onProgress?.(stage.name, msg)
        );
        
        if (!result.success) {
            // Handle stage failure
            currentTask.lastError = result.error;
            currentTask.stageRetryCount = (currentTask.stageRetryCount ?? 0) + 1;
            
            if (currentTask.stageRetryCount >= currentTask.maxRetries) {
                // Move to failed state
                const failedStage = adapter.pipeline.find(s => s.name === 'failed');
                if (failedStage) {
                    currentTask.currentStageId = failedStage.id;
                    currentTask.currentStageName = failedStage.name;
                }
                return { task: currentTask, completed: false, error: result.error };
            }
            
            // Retry same stage
            continue;
        }
        
        // Update task with stage results
        currentTask.stageHistory.push(createStageHistoryEntry(stage, result));
        currentTask.stageOutputs[stage.name] = result.output;
        
        if (stage.isAudit) {
            const auditRecord = createAuditResultRecord(stage, result);
            if (auditRecord) {
                currentTask.auditResults = currentTask.auditResults || [];
                currentTask.auditResults.push(auditRecord);
            }
            
            if (result.forbiddenPatternsFound?.length) {
                currentTask.forbiddenPatternsFound = currentTask.forbiddenPatternsFound || [];
                currentTask.forbiddenPatternsFound.push(...result.forbiddenPatternsFound);
            }
        }
        
        // Move to next stage
        if (result.nextStageId !== undefined && result.nextStageName !== undefined) {
            currentTask.currentStageId = result.nextStageId;
            currentTask.currentStageName = result.nextStageName;
            currentTask.stageRetryCount = 0;
        } else {
            // No next stage defined, assume completed
            const completedStage = adapter.pipeline.find(s => s.name === 'completed');
            if (completedStage) {
                currentTask.currentStageId = completedStage.id;
                currentTask.currentStageName = completedStage.name;
            }
            return { task: currentTask, completed: true };
        }
    }
}
