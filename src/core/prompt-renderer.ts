/**
 * ADG-Parallels Prompt Renderer
 * 
 * Uses Mustache templates to render prompts with task data.
 * Provides helper functions for common transformations.
 */

import * as Mustache from 'mustache';
import { Task, TaskAdapter } from '../types';
import { logger } from '../utils/logger';
import { CORPORATE_STATUTE } from '../constants/corporate-statute';

// =============================================================================
// TYPES
// =============================================================================

export interface RenderContext {
  task: TaskRenderData;
  worker: WorkerRenderData;
  project: ProjectRenderData;
  statute: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface TaskRenderData {
  id: number;
  type: string;
  title: string;
  title_slug: string;
  description?: string;
  status: string;
  params: Record<string, unknown>;
  params_json?: string | null;  // JSON string of params for easy template display
  retryCount: number;
  [key: string]: unknown;
}

export interface WorkerRenderData {
  id: string;
  role: string;
  depth: number;
  outputDir: string;
  [key: string]: unknown;
}

export interface ProjectRenderData {
  codename: string;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  [key: string]: unknown;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert a string to a URL-safe slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')     // Remove non-word chars
    .replace(/[\s_-]+/g, '-')      // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, '')       // Trim hyphens from ends
    .substring(0, 50);             // Limit length
}

/**
 * Format a date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

/**
 * Format a datetime for display
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().replace('T', ' ').split('.')[0];
}

/**
 * Truncate text to a maximum length
 */
export function truncate(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

// =============================================================================
// CONTEXT BUILDING
// =============================================================================

/**
 * Build the render context from task and worker data
 */
export function buildRenderContext(
  task: Task,
  workerId: string,
  workerRole: string = 'worker',
  workerDepth: number = 0,
  outputDir: string = './output',
  projectCodename: string = 'project',
  projectStats?: { total: number; completed: number; pending: number }
): RenderContext {
  // Create params_json for easy display in templates
  const paramsJson = task.params && Object.keys(task.params).length > 0
    ? JSON.stringify(task.params, null, 2)
    : null;

  const taskData: TaskRenderData = {
    // Spread base task properties first
    ...task,
    // Override with formatted versions
    id: task.id,
    type: task.type,
    title: task.title,
    title_slug: slugify(task.title),
    description: task.description,
    status: task.status,
    params: task.params ?? {},
    params_json: paramsJson,  // JSON string for easy template display
    retryCount: task.retryCount,
  };

  const workerData: WorkerRenderData = {
    id: workerId,
    role: workerRole,
    depth: workerDepth,
    outputDir: outputDir,
  };

  const projectData: ProjectRenderData = {
    codename: projectCodename,
    totalTasks: projectStats?.total ?? 0,
    completedTasks: projectStats?.completed ?? 0,
    pendingTasks: projectStats?.pending ?? 0,
  };

  return {
    task: taskData,
    worker: workerData,
    project: projectData,
    statute: CORPORATE_STATUTE,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// PROMPT RENDERING
// =============================================================================

/**
 * Render a prompt template with the given context
 */
export function renderPrompt(template: string, context: RenderContext): string {
  try {
    // Use Mustache.render with custom config to avoid HTML escaping
    // We pass the template through without escaping since we're not generating HTML
    const rendered = Mustache.render(template, context, {}, { escape: (text: string) => text });
    
    logger.debug('Prompt rendered', { 
      templateLength: template.length, 
      renderedLength: rendered.length 
    });
    
    return rendered;
  } catch (error) {
    logger.error('Failed to render prompt', { error, template: truncate(template, 200) });
    throw new Error(`Prompt rendering failed: ${error}`);
  }
}

/**
 * Render the task start prompt from an adapter
 */
export function renderTaskStartPrompt(
  adapter: TaskAdapter,
  context: RenderContext
): string {
  return renderPrompt(adapter.prompts.taskStart, context);
}

/**
 * Render the task continue prompt from an adapter
 */
export function renderTaskContinuePrompt(
  adapter: TaskAdapter,
  context: RenderContext
): string {
  return renderPrompt(adapter.prompts.taskContinue, context);
}

/**
 * Render the audit prompt from an adapter (if exists)
 */
export function renderAuditPrompt(
  adapter: TaskAdapter,
  context: RenderContext
): string | null {
  if (!adapter.prompts.auditPrompt) {
    return null;
  }
  return renderPrompt(adapter.prompts.auditPrompt, context);
}

/**
 * Render the output file path from adapter configuration
 */
export function renderOutputPath(
  adapter: TaskAdapter,
  context: RenderContext
): string {
  return renderPrompt(adapter.outputProcessing.saveAs, context);
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Check if output meets the completion criteria
 */
export function checkCompletionCriteria(
  output: string,
  adapter: TaskAdapter
): { passed: boolean; reason?: string } {
  const criteria = adapter.completionCriteria;

  // Check minimum length
  if (criteria.minOutputLength && output.length < criteria.minOutputLength) {
    return {
      passed: false,
      reason: `Output too short: ${output.length} < ${criteria.minOutputLength} characters`,
    };
  }

  // Check validation regex
  if (criteria.validationRegex) {
    const regex = new RegExp(criteria.validationRegex, 'i');
    if (!regex.test(output)) {
      return {
        passed: false,
        reason: `Output does not match required pattern: ${criteria.validationRegex}`,
      };
    }
  }

  // Check required output files (if applicable)
  // Note: This would need file system checks, handled separately

  return { passed: true };
}

// =============================================================================
// PROMPT CONSTRUCTION HELPERS
// =============================================================================

/**
 * Build a complete prompt with corporate statute prepended
 */
export function buildCompletePrompt(
  mainPrompt: string,
  includeStatute: boolean = true,
  context?: RenderContext
): string {
  const parts: string[] = [];

  if (includeStatute && context) {
    parts.push('# Corporate Statute (Reference)\n');
    parts.push('<statute>\n');
    parts.push(context.statute);
    parts.push('\n</statute>\n\n');
    parts.push('---\n\n');
  }

  parts.push(mainPrompt);

  return parts.join('');
}

/**
 * Parse task completion signal from output
 */
export function parseCompletionSignal(output: string): {
  isComplete: boolean;
  signal?: string;
} {
  const completionPatterns = [
    /TASK COMPLETED/i,
    /\[COMPLETE\]/i,
    /\[DONE\]/i,
    /---\s*END\s*---/i,
  ];

  for (const pattern of completionPatterns) {
    const match = output.match(pattern);
    if (match) {
      return { isComplete: true, signal: match[0] };
    }
  }

  return { isComplete: false };
}

/**
 * Parse audit result from output
 */
export function parseAuditResult(output: string): {
  passed: boolean;
  reason?: string;
} {
  const passPattern = /AUDIT PASSED/i;
  const failPattern = /AUDIT FAILED:\s*(.+)/i;

  if (passPattern.test(output)) {
    return { passed: true };
  }

  const failMatch = output.match(failPattern);
  if (failMatch) {
    return { passed: false, reason: failMatch[1].trim() };
  }

  // No clear signal - assume incomplete
  return { passed: false, reason: 'No audit result found in output' };
}
