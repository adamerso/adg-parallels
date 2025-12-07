/**
 * ADG-Parallels Output Aggregator
 * 
 * Handles merging and aggregating outputs from subtasks.
 * Supports different merge strategies: concatenate, summarize, JSON merge.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Task } from '../types';
import { TaskManager } from './task-manager';
import { ensureDir, pathExists } from '../utils/file-operations';
import { logger } from '../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export type MergeStrategy = 'concatenate' | 'json-array' | 'markdown-sections' | 'custom';

export interface AggregateOptions {
  strategy: MergeStrategy;
  separator?: string;
  includeHeaders?: boolean;
  outputPath?: string;
}

export interface AggregateResult {
  success: boolean;
  outputPath?: string;
  totalFiles: number;
  mergedContent?: string;
  error?: string;
}

// =============================================================================
// OUTPUT AGGREGATOR
// =============================================================================

/**
 * Aggregate outputs from multiple subtasks
 */
export async function aggregateSubtaskOutputs(
  taskManager: TaskManager,
  parentTaskId: number,
  options: AggregateOptions
): Promise<AggregateResult> {
  try {
    // Get all subtask output paths
    const outputPaths = await taskManager.getSubtaskOutputs(parentTaskId);
    
    if (outputPaths.length === 0) {
      return {
        success: false,
        totalFiles: 0,
        error: 'No subtask outputs found',
      };
    }

    // Read all outputs
    const outputs: { path: string; content: string }[] = [];
    for (const outputPath of outputPaths) {
      if (pathExists(outputPath)) {
        const content = fs.readFileSync(outputPath, 'utf8');
        outputs.push({ path: outputPath, content });
      }
    }

    if (outputs.length === 0) {
      return {
        success: false,
        totalFiles: 0,
        error: 'No readable output files found',
      };
    }

    // Merge based on strategy
    let mergedContent: string;
    switch (options.strategy) {
      case 'concatenate':
        mergedContent = mergeConcat(outputs, options);
        break;
      case 'json-array':
        mergedContent = mergeJsonArray(outputs, options);
        break;
      case 'markdown-sections':
        mergedContent = mergeMarkdownSections(outputs, options);
        break;
      default:
        mergedContent = mergeConcat(outputs, options);
    }

    // Save if output path specified
    let savedPath: string | undefined;
    if (options.outputPath) {
      ensureDir(path.dirname(options.outputPath));
      fs.writeFileSync(options.outputPath, mergedContent, 'utf8');
      savedPath = options.outputPath;
      logger.info(`Aggregated ${outputs.length} outputs to ${savedPath}`);
    }

    return {
      success: true,
      outputPath: savedPath,
      totalFiles: outputs.length,
      mergedContent,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to aggregate outputs', { error: errorMessage });
    return {
      success: false,
      totalFiles: 0,
      error: errorMessage,
    };
  }
}

// =============================================================================
// MERGE STRATEGIES
// =============================================================================

/**
 * Simple concatenation with separator
 */
function mergeConcat(
  outputs: { path: string; content: string }[],
  options: AggregateOptions
): string {
  const separator = options.separator ?? '\n\n---\n\n';
  const parts: string[] = [];

  for (const output of outputs) {
    if (options.includeHeaders) {
      const filename = path.basename(output.path);
      parts.push(`## ${filename}\n\n${output.content}`);
    } else {
      parts.push(output.content);
    }
  }

  return parts.join(separator);
}

/**
 * Merge as JSON array
 */
function mergeJsonArray(
  outputs: { path: string; content: string }[],
  _options: AggregateOptions
): string {
  const items: unknown[] = [];

  for (const output of outputs) {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(output.content);
      if (Array.isArray(parsed)) {
        items.push(...parsed);
      } else {
        items.push(parsed);
      }
    } catch {
      // Not JSON, wrap as string
      items.push({
        source: path.basename(output.path),
        content: output.content,
      });
    }
  }

  return JSON.stringify(items, null, 2);
}

/**
 * Merge as markdown with sections
 */
function mergeMarkdownSections(
  outputs: { path: string; content: string }[],
  _options: AggregateOptions
): string {
  const parts: string[] = [];
  
  parts.push('# Aggregated Output\n');
  parts.push(`*Generated from ${outputs.length} subtasks*\n`);
  parts.push('---\n');

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    const filename = path.basename(output.path, path.extname(output.path));
    
    parts.push(`\n## Part ${i + 1}: ${filename}\n`);
    parts.push(output.content);
    parts.push('\n');
  }

  return parts.join('\n');
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get default output path for aggregated result
 */
export function getAggregatedOutputPath(
  outputDir: string,
  parentTask: Task
): string {
  const slug = parentTask.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  
  return path.join(outputDir, 'aggregated', `${parentTask.id}_${slug}_merged.md`);
}

/**
 * Check if a task is a mega-task with subtasks
 */
export function isMegaTask(task: Task): boolean {
  return (task.subtaskIds?.length ?? 0) > 0;
}
