/**
 * ADG-Parallels Adapter Loader
 * 
 * Loads and validates task adapters from JSON files.
 * Adapters define how to handle specific task types.
 */

import * as path from 'path';
import { TaskAdapter } from '../types';
import { readJson, pathExists, findFiles } from '../utils/file-operations';
import { logger } from '../utils/logger';

// =============================================================================
// ADAPTER CACHE
// =============================================================================

const adapterCache: Map<string, TaskAdapter> = new Map();

// =============================================================================
// ADAPTER LOADING
// =============================================================================

/**
 * Load an adapter by its ID from the adapters directory
 */
export function loadAdapter(adaptersDir: string, adapterId: string): TaskAdapter | null {
  // Check cache first
  const cacheKey = `${adaptersDir}:${adapterId}`;
  if (adapterCache.has(cacheKey)) {
    return adapterCache.get(cacheKey)!;
  }

  // Try to load from file
  const adapterPath = path.join(adaptersDir, `${adapterId}.adapter.json`);
  
  if (!pathExists(adapterPath)) {
    // Try without .adapter suffix
    const altPath = path.join(adaptersDir, `${adapterId}.json`);
    if (!pathExists(altPath)) {
      logger.error(`Adapter not found: ${adapterId}`, { searchedPaths: [adapterPath, altPath] });
      return null;
    }
    return loadAdapterFromPath(altPath, cacheKey);
  }

  return loadAdapterFromPath(adapterPath, cacheKey);
}

/**
 * Load adapter from a specific file path
 */
function loadAdapterFromPath(filePath: string, cacheKey: string): TaskAdapter | null {
  const adapter = readJson<TaskAdapter>(filePath);
  
  if (!adapter) {
    logger.error(`Failed to parse adapter: ${filePath}`);
    return null;
  }

  // Validate adapter
  const validationErrors = validateAdapter(adapter);
  if (validationErrors.length > 0) {
    logger.error(`Invalid adapter: ${filePath}`, { errors: validationErrors });
    return null;
  }

  // Cache and return
  adapterCache.set(cacheKey, adapter);
  logger.info(`Loaded adapter: ${adapter.adapterId}`, { version: adapter.version });
  
  return adapter;
}

/**
 * Load all adapters from a directory
 */
export function loadAllAdapters(adaptersDir: string): TaskAdapter[] {
  if (!pathExists(adaptersDir)) {
    logger.warn(`Adapters directory not found: ${adaptersDir}`);
    return [];
  }

  const adapterFiles = findFiles(adaptersDir, /\.(adapter\.)?json$/);
  const adapters: TaskAdapter[] = [];

  for (const filePath of adapterFiles) {
    const cacheKey = `${adaptersDir}:${path.basename(filePath)}`;
    const adapter = loadAdapterFromPath(filePath, cacheKey);
    if (adapter) {
      adapters.push(adapter);
    }
  }

  logger.info(`Loaded ${adapters.length} adapters from ${adaptersDir}`);
  return adapters;
}

/**
 * Get adapter for a task type, with fallback to generic
 */
export function getAdapterForTask(adaptersDir: string, taskType: string): TaskAdapter {
  // Try exact match
  let adapter = loadAdapter(adaptersDir, taskType);
  
  if (!adapter) {
    // Fall back to generic
    logger.warn(`Adapter "${taskType}" not found, falling back to generic`);
    adapter = loadAdapter(adaptersDir, 'generic');
  }

  if (!adapter) {
    // Return built-in default
    logger.warn('No generic adapter found, using built-in default');
    return getBuiltInGenericAdapter();
  }

  return adapter;
}

/**
 * Clear the adapter cache
 */
export function clearAdapterCache(): void {
  adapterCache.clear();
  logger.debug('Adapter cache cleared');
}

// =============================================================================
// ADAPTER VALIDATION
// =============================================================================

/**
 * Validate an adapter object
 * Returns array of error messages (empty if valid)
 */
export function validateAdapter(adapter: Partial<TaskAdapter>): string[] {
  const errors: string[] = [];

  // Required fields
  if (!adapter.adapterId) {
    errors.push('Missing required field: adapterId');
  }

  if (!adapter.version) {
    errors.push('Missing required field: version');
  }

  if (!adapter.prompts) {
    errors.push('Missing required field: prompts');
  } else {
    if (!adapter.prompts.taskStart) {
      errors.push('Missing required field: prompts.taskStart');
    }
    if (!adapter.prompts.taskContinue) {
      errors.push('Missing required field: prompts.taskContinue');
    }
  }

  if (!adapter.outputProcessing) {
    errors.push('Missing required field: outputProcessing');
  } else {
    if (!adapter.outputProcessing.saveAs) {
      errors.push('Missing required field: outputProcessing.saveAs');
    }
  }

  if (!adapter.statusFlow || adapter.statusFlow.length === 0) {
    errors.push('Missing or empty: statusFlow');
  }

  // Validate maxRetries
  if (adapter.maxRetries !== undefined && (adapter.maxRetries < 0 || adapter.maxRetries > 10)) {
    errors.push('maxRetries must be between 0 and 10');
  }

  return errors;
}

// =============================================================================
// BUILT-IN ADAPTERS
// =============================================================================

/**
 * Get the built-in generic adapter (fallback)
 */
export function getBuiltInGenericAdapter(): TaskAdapter {
  return {
    adapterId: 'generic',
    version: '1.0',
    displayName: 'Generic Task',
    prompts: {
      taskStart: `# Task Assignment

You are an ADG-Parallels Worker. Complete the following task:

## Task #{{task.id}}: {{task.title}}

{{#task.description}}
### Description
{{task.description}}
{{/task.description}}

{{#task.params_json}}
### Parameters
\`\`\`json
{{{task.params_json}}}
\`\`\`
{{/task.params_json}}

## Instructions
1. Analyze the task requirements
2. Complete the task to the best of your ability
3. Provide your output in a clear, structured format
4. When done, clearly indicate "TASK COMPLETED"

## Corporate Statute Reminder
Remember the ADG-Parallels Corporate Statute rules. Work professionally.

Begin your work now.`,
      taskContinue: `# Continue Task

Please continue working on Task #{{task.id}}: {{task.title}}

Your previous work has been saved. Pick up where you left off.

When finished, indicate "TASK COMPLETED".`,
      auditPrompt: `# Audit Request

Please review the output for Task #{{task.id}}: {{task.title}}

Check if it meets the requirements and is complete.
Respond with either "AUDIT PASSED" or "AUDIT FAILED: [reason]".`
    },
    completionCriteria: {
      minOutputLength: 50,
    },
    outputProcessing: {
      saveAs: 'output/task_{{task.id}}_{{task.title_slug}}.md',
    },
    statusFlow: ['pending', 'processing', 'task_completed', 'audit_passed'],
    retryableStatuses: ['pending', 'audit_failed'],
    maxRetries: 3,
    isMeta: false,
    createsSubtasks: false,
    requiresManagerRole: false,
  };
}

/**
 * Get the built-in article generation adapter
 */
export function getBuiltInArticleAdapter(): TaskAdapter {
  return {
    adapterId: 'article-generation',
    version: '1.0',
    displayName: 'Article Generation',
    prompts: {
      taskStart: `# Article Writing Assignment

You are an ADG-Parallels Worker specializing in content creation.

## Task #{{task.id}}: Write Article

### Title
{{task.title}}

{{#task.description}}
### Brief
{{task.description}}
{{/task.description}}

{{#task.params.keywords}}
### Keywords to Include
{{task.params.keywords}}
{{/task.params.keywords}}

{{#task.params.wordCount}}
### Target Word Count
{{task.params.wordCount}} words
{{/task.params.wordCount}}

{{#task.params.tone}}
### Tone
{{task.params.tone}}
{{/task.params.tone}}

## Article Structure
Please write an article with:
1. Engaging headline/title
2. Introduction paragraph
3. Main body (multiple sections with subheadings)
4. Conclusion
5. (Optional) Call to action

## Output Format
Write the article in Markdown format.

When you're done, end with: "TASK COMPLETED"

Begin writing now.`,
      taskContinue: `# Continue Writing

Please continue writing the article for Task #{{task.id}}: {{task.title}}

Your previous work has been saved. Continue from where you left off.

When finished, end with: "TASK COMPLETED"`,
      auditPrompt: `# Article Review

Review the article for Task #{{task.id}}: {{task.title}}

Check for:
- Grammar and spelling
- Coherent structure
- Topic relevance
- Minimum word count (if specified)

Respond with "AUDIT PASSED" or "AUDIT FAILED: [specific issues]".`
    },
    completionCriteria: {
      minOutputLength: 500,
      validationRegex: 'TASK COMPLETED',
    },
    outputProcessing: {
      saveAs: 'output/articles/{{task.id}}_{{task.title_slug}}.md',
    },
    statusFlow: ['pending', 'processing', 'task_completed', 'audit_in_progress', 'audit_passed'],
    retryableStatuses: ['pending', 'audit_failed'],
    maxRetries: 3,
    isMeta: false,
    createsSubtasks: false,
    requiresManagerRole: false,
  };
}

/**
 * Get the built-in task splitter adapter (meta-adapter for managers)
 */
export function getBuiltInTaskSplitterAdapter(): TaskAdapter {
  return {
    adapterId: 'task-splitter',
    version: '1.0',
    displayName: 'Task Splitter (Meta)',
    prompts: {
      taskStart: `# Task Splitting Assignment

You are an ADG-Parallels Manager. Your job is to split a large task into smaller sub-tasks.

## Mega-Task #{{task.id}}: {{task.title}}

{{#task.description}}
### Description
{{task.description}}
{{/task.description}}

### Source Data
File: {{task.params.sourceFile}}

### Split Configuration
- Target task type: {{task.params.targetType}}
- Split strategy: {{task.params.splitStrategy}}
{{#task.params.tasksPerChunk}}
- Tasks per chunk: {{task.params.tasksPerChunk}}
{{/task.params.tasksPerChunk}}

## Instructions
1. Read the source file
2. Split the content according to the strategy
3. Generate sub-tasks in JSON format
4. Each sub-task should have: title, description, type, params

## Output Format
Provide the sub-tasks as a JSON array:
\`\`\`json
[
  {
    "title": "Sub-task title",
    "description": "Sub-task description",
    "type": "{{task.params.targetType}}",
    "params": { ... }
  }
]
\`\`\`

When done: "TASK COMPLETED"`,
      taskContinue: `Continue splitting Task #{{task.id}}. Output remaining sub-tasks.`,
    },
    completionCriteria: {
      validationRegex: '\\[\\s*\\{',  // Must contain JSON array
    },
    outputProcessing: {
      saveAs: 'output/splits/{{task.id}}_subtasks.json',
      postProcess: ['parse-subtasks', 'add-to-queue'],
    },
    statusFlow: ['pending', 'processing', 'task_completed'],
    retryableStatuses: ['pending'],
    maxRetries: 2,
    isMeta: true,
    createsSubtasks: true,
    requiresManagerRole: true,
  };
}

/**
 * Get the built-in translation adapter
 */
export function getBuiltInTranslationAdapter(): TaskAdapter {
  return {
    adapterId: 'translation',
    version: '1.0',
    displayName: 'Translation',
    prompts: {
      taskStart: `# Translation Task

You are an ADG-Parallels Worker specializing in translation.

## Task #{{task.id}}: {{task.title}}

### Source Language
{{task.params.sourceLanguage}}

### Target Language  
{{task.params.targetLanguage}}

### Text to Translate
{{task.description}}

{{#task.params.context}}
### Context/Domain
{{task.params.context}}
{{/task.params.context}}

{{#task.params.tone}}
### Desired Tone
{{task.params.tone}}
{{/task.params.tone}}

## Instructions
1. Translate the text accurately while preserving meaning
2. Adapt idioms and cultural references appropriately
3. Maintain the original tone and style
4. If technical terms exist, translate them correctly for the domain

## Output Format
Provide the translation in clean text format.

When done, end with: "TASK COMPLETED"`,
      taskContinue: `# Continue Translation

Please continue translating Task #{{task.id}}: {{task.title}}

Pick up where you left off.

When finished, end with: "TASK COMPLETED"`,
      auditPrompt: `# Translation Review

Review the translation for Task #{{task.id}}: {{task.title}}

Check for:
- Accuracy of translation
- Natural language flow
- Proper grammar in target language
- Preserved meaning and tone

Respond with "AUDIT PASSED" or "AUDIT FAILED: [specific issues]".`
    },
    completionCriteria: {
      minOutputLength: 100,
      validationRegex: 'TASK COMPLETED',
    },
    outputProcessing: {
      saveAs: 'output/translations/{{task.id}}_{{task.params.targetLanguage}}_{{task.title_slug}}.md',
    },
    statusFlow: ['pending', 'processing', 'task_completed', 'audit_in_progress', 'audit_passed'],
    retryableStatuses: ['pending', 'audit_failed'],
    maxRetries: 3,
    isMeta: false,
    createsSubtasks: false,
    requiresManagerRole: false,
  };
}

/**
 * Get the built-in code audit adapter
 */
export function getBuiltInCodeAuditAdapter(): TaskAdapter {
  return {
    adapterId: 'code-audit',
    version: '1.0',
    displayName: 'Code Audit',
    prompts: {
      taskStart: `# Code Audit Task

You are an ADG-Parallels Worker specializing in code review and security audits.

## Task #{{task.id}}: {{task.title}}

### File/Code to Audit
{{task.description}}

{{#task.params.filePath}}
### File Path
{{task.params.filePath}}
{{/task.params.filePath}}

{{#task.params.language}}
### Programming Language
{{task.params.language}}
{{/task.params.language}}

{{#task.params.focusAreas}}
### Focus Areas
{{task.params.focusAreas}}
{{/task.params.focusAreas}}

## Audit Checklist
Please analyze the code for:

### 1. Security Issues
- SQL injection, XSS, CSRF vulnerabilities
- Hardcoded secrets or credentials
- Insecure dependencies
- Input validation issues

### 2. Code Quality
- Code duplication
- Complex/nested logic
- Missing error handling
- Poor naming conventions

### 3. Performance
- Inefficient algorithms
- Memory leaks
- Unnecessary computations
- N+1 queries

### 4. Best Practices
- SOLID principles adherence
- Design pattern usage
- Documentation completeness
- Test coverage considerations

## Output Format
Provide your audit report in this structure:

## Summary
[Brief overview of findings]

## Critical Issues 🔴
[List critical security/bug issues]

## Warnings 🟡
[List warnings and potential issues]

## Suggestions 🔵
[List improvement suggestions]

## Positive Notes ✅
[List good practices found]

When done, end with: "TASK COMPLETED"`,
      taskContinue: `# Continue Code Audit

Please continue the code audit for Task #{{task.id}}: {{task.title}}

Continue your analysis from where you left off.

When finished, end with: "TASK COMPLETED"`,
      auditPrompt: `# Audit Review

Review the code audit report for Task #{{task.id}}: {{task.title}}

Check if:
- All major areas were covered
- Findings are accurate and actionable
- Severity levels are appropriate

Respond with "AUDIT PASSED" or "AUDIT FAILED: [specific issues]".`
    },
    completionCriteria: {
      minOutputLength: 300,
      validationRegex: 'TASK COMPLETED',
    },
    outputProcessing: {
      saveAs: 'output/audits/{{task.id}}_audit_{{task.title_slug}}.md',
    },
    statusFlow: ['pending', 'processing', 'task_completed', 'audit_in_progress', 'audit_passed'],
    retryableStatuses: ['pending', 'audit_failed'],
    maxRetries: 2,
    isMeta: false,
    createsSubtasks: false,
    requiresManagerRole: false,
  };
}

/**
 * Get the built-in task audit adapter
 */
export function getBuiltInTaskAuditAdapter(): TaskAdapter {
  return {
    adapterId: 'task-audit',
    version: '1.0',
    displayName: 'Task Audit',
    prompts: {
      taskStart: `# Task Audit Assignment

You are an ADG-Parallels Auditor. Your job is to review completed work.

## Task to Audit: #{{task.id}}

### Original Task
**Title:** {{task.title}}
**Type:** {{task.type}}

{{#task.description}}
**Description:** {{task.description}}
{{/task.description}}

### Output to Review
File: {{task.params.outputFile}}

{{#task.params.outputContent}}
---
{{task.params.outputContent}}
---
{{/task.params.outputContent}}

## Audit Criteria
Please evaluate the output against these criteria:

1. **Completeness** - Does it address all requirements?
2. **Quality** - Is the content well-written/structured?
3. **Accuracy** - Is the information correct?
4. **Format** - Does it follow the expected format?

## Your Response
Provide your audit result in this exact format:

### Audit Summary
[Brief summary of your findings]

### Issues Found
[List any issues, or "None" if perfect]

### Verdict
[Choose ONE: AUDIT PASSED or AUDIT FAILED]

### Reason
[Explain your verdict]

End with exactly: "AUDIT PASSED" or "AUDIT FAILED: [reason]"`,
      taskContinue: `Continue your audit of Task #{{task.id}}.

Provide your final verdict: "AUDIT PASSED" or "AUDIT FAILED: [reason]"`,
    },
    completionCriteria: {
      minOutputLength: 100,
      validationRegex: 'AUDIT (PASSED|FAILED)',
    },
    outputProcessing: {
      saveAs: 'output/audits/audit_{{task.id}}_{{task.params.originalTaskId}}.md',
    },
    statusFlow: ['pending', 'processing', 'task_completed'],
    retryableStatuses: ['pending'],
    maxRetries: 2,
    isMeta: false,
    createsSubtasks: false,
    requiresManagerRole: false,
  };
}

/**
 * Create built-in adapters in the adapters directory
 */
export function createBuiltInAdapters(adaptersDir: string): void {
  const { writeJson, ensureDir } = require('../utils/file-operations');
  
  ensureDir(adaptersDir);

  const adapters = [
    { id: 'generic', adapter: getBuiltInGenericAdapter() },
    { id: 'article-generation', adapter: getBuiltInArticleAdapter() },
    { id: 'task-splitter', adapter: getBuiltInTaskSplitterAdapter() },
    { id: 'translation', adapter: getBuiltInTranslationAdapter() },
    { id: 'code-audit', adapter: getBuiltInCodeAuditAdapter() },
    { id: 'task-audit', adapter: getBuiltInTaskAuditAdapter() },
  ];

  for (const { id, adapter } of adapters) {
    const filePath = path.join(adaptersDir, `${id}.adapter.json`);
    if (!pathExists(filePath)) {
      writeJson(filePath, adapter);
      logger.info(`Created built-in adapter: ${id}`);
    }
  }
}
