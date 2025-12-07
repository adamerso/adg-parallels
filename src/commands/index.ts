/**
 * ADG-Parallels Commands
 * 
 * VS Code commands for managing the parallel processing system.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RoleInfo, ProjectConfig, Task, TaskStatus, WorkerConfig } from '../types';
import { detectRole, canDelegate, getRoleDisplayInfo } from '../core/role-detector';
import { TaskManager, createProjectTasks, findTasksFile } from '../core/task-manager';
import { 
  WorkerLifecycleManager, 
  createManagerLifecycle,
  createWorkerLifecycle 
} from '../core/worker-lifecycle';
import { 
  WorkerExecutor, 
  ExecutorConfig,
  executeTaskWithProgress 
} from '../core/worker-executor';
import { createBuiltInAdapters } from '../core/adapter-loader';
import { 
  aggregateSubtaskOutputs, 
  getAggregatedOutputPath,
  MergeStrategy 
} from '../core/output-aggregator';
import {
  generateAndSaveManagerReport,
  formatManagerReportAsMarkdown
} from '../core/upward-reporting';
import { ensureDir, pathExists, writeJson, readJson } from '../utils/file-operations';
import { logger } from '../utils/logger';
import { getSidebarProvider } from '../views/sidebar-webview';

// =============================================================================
// COMMAND: Provision Project
// =============================================================================

interface ProjectSetupOptions {
  projectCodename: string;
  workerCount: number;
  taskType: string;
  tasks: Array<{ title: string; description?: string; params?: Record<string, unknown> }>;
}

/**
 * Command to provision a new ADG-Parallels project
 */
export async function provisionProject(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;

  // Check current role
  const roleInfo = detectRole();
  if (!roleInfo) {
    vscode.window.showErrorMessage('Could not detect workspace role');
    return;
  }
  
  if (roleInfo.role !== 'ceo') {
    vscode.window.showWarningMessage(
      `You are currently in ${roleInfo.role.toUpperCase()} mode. ` +
      `Project provisioning should be done from CEO workspace (no .adg-parallels folder).`
    );
    return;
  }

  // Get project codename
  const projectCodename = await vscode.window.showInputBox({
    prompt: 'Enter project codename (e.g., article-batch-001)',
    placeHolder: 'project-codename',
    validateInput: (value) => {
      if (!value || value.length < 3) {
        return 'Codename must be at least 3 characters';
      }
      if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
        return 'Codename can only contain letters, numbers, hyphens, and underscores';
      }
      return null;
    }
  });

  if (!projectCodename) {
    return;
  }

  // Get worker count
  const workerCountStr = await vscode.window.showInputBox({
    prompt: 'How many workers do you want?',
    placeHolder: '4',
    value: '4',
    validateInput: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > 10) {
        return 'Worker count must be between 1 and 10';
      }
      return null;
    }
  });

  if (!workerCountStr) {
    return;
  }
  const workerCount = parseInt(workerCountStr, 10);

  // Get task type
  const taskType = await vscode.window.showQuickPick([
    { label: 'article-generation', description: 'Generate articles from topics' },
    { label: 'code-review', description: 'Review code files' },
    { label: 'documentation', description: 'Generate documentation' },
    { label: 'translation', description: 'Translate content' },
    { label: 'custom', description: 'Custom task type' },
  ], {
    placeHolder: 'Select task type',
  });

  if (!taskType) {
    return;
  }

  let finalTaskType = taskType.label;
  if (taskType.label === 'custom') {
    const customType = await vscode.window.showInputBox({
      prompt: 'Enter custom task type name',
      placeHolder: 'my-custom-task',
    });
    if (!customType) {
      return;
    }
    finalTaskType = customType;
  }

  // Create project structure
  await createProjectStructure(workspaceRoot, {
    projectCodename,
    workerCount,
    taskType: finalTaskType,
    tasks: [], // Will be populated from CSV or manual entry
  });

  // Update sidebar state
  const sidebarProvider = getSidebarProvider();
  if (sidebarProvider) {
    const state = sidebarProvider.getState();
    sidebarProvider.updateState({
      hasProject: true,
      projectStatus: state.isProcessingEnabled ? 'active' : 'suspended',
      currentRole: 'manager',
    });

    // If processing is already ON, auto-start
    if (state.isProcessingEnabled) {
      vscode.window.showInformationMessage(
        `🚀 Project "${projectCodename}" provisioned & auto-started! Processing is ON.`
      );
      // TODO: Trigger actual processing start here
      sidebarProvider.updateState({ processingStatus: 'idle' });
    } else {
      vscode.window.showInformationMessage(
        `Project "${projectCodename}" provisioned! Turn ON processing to start.`
      );
    }
  } else {
    vscode.window.showInformationMessage(
      `Project "${projectCodename}" provisioned! ` +
      `Add tasks to .adg-parallels/management/project_${projectCodename}_adg-tasks.json`
    );
  }

  // Open the tasks file
  const tasksFilePath = path.join(
    workspaceRoot,
    '.adg-parallels',
    'management',
    `project_${projectCodename}_adg-tasks.json`
  );
  const doc = await vscode.workspace.openTextDocument(tasksFilePath);
  await vscode.window.showTextDocument(doc);
}

/**
 * Create the full project directory structure
 */
async function createProjectStructure(
  workspaceRoot: string,
  options: ProjectSetupOptions
): Promise<void> {
  const adgRoot = path.join(workspaceRoot, '.adg-parallels');
  const managementDir = path.join(adgRoot, 'management');
  const jobsDir = path.join(adgRoot, 'jobs');
  const adaptersDir = path.join(adgRoot, 'adapters');
  const workersDir = path.join(adgRoot, 'workers');

  // Create directories
  ensureDir(managementDir);
  ensureDir(jobsDir);
  ensureDir(adaptersDir);
  ensureDir(workersDir);

  // Create hierarchy config
  const hierarchyConfig = {
    maxDepth: 3,
    currentDepth: 0,
    levelConfig: [
      { level: 0, role: 'ceo', canDelegate: true, maxSubordinates: 1, subordinateRole: 'manager' },
      { level: 1, role: 'manager', canDelegate: true, maxSubordinates: 10, subordinateRole: 'worker' },
      { level: 2, role: 'worker', canDelegate: false, maxSubordinates: 0, subordinateRole: null },
    ],
    healthMonitoring: {
      enabled: true,
      heartbeatIntervalSeconds: 30,
      unresponsiveThresholdSeconds: 90,
      maxConsecutiveFailures: 3,
      autoRestart: true,
      alertCeoOnFaulty: true,
    },
    adapters: {
      path: './adapters',
      defaultAdapter: options.taskType,
      availableAdapters: [options.taskType],
    },
    emergencyBrake: {
      maxTotalInstances: 10,
      maxTasksPerWorker: 5,
      timeoutMinutes: 60,
    },
  };

  writeJson(path.join(managementDir, 'hierarchy-config.json'), hierarchyConfig);

  // Create project tasks file
  const tasksFilePath = path.join(
    managementDir,
    `project_${options.projectCodename}_adg-tasks.json`
  );

  // Hardcoded sample tasks for testing - 4 fun Polish articles! 🇵🇱🥚
  const sampleTasks: Array<Omit<Task, 'id' | 'retryCount' | 'maxRetries'>> = [
    {
      type: options.taskType,
      title: 'Jak koty podbijają internet',
      description: 'Napisz zabawny artykuł po polsku o fenomenie kotów w internecie. Opisz słynne koty-gwiazdy (Grumpy Cat, Keyboard Cat, Nyan Cat), wyjaśnij dlaczego ludzie kochają kotocontent, i dodaj statystyki o miliardach wyświetleń. Zakończ teorią spiskową, że koty celowo manipulują algorytmami.',
      status: 'pending',
      params: { 
        language: 'polski',
        wordCount: 700,
        tone: 'humorystyczny, z przymrużeniem oka',
        keywords: 'koty, internet, memy, viral, Grumpy Cat, social media'
      },
    },
    {
      type: options.taskType,
      title: 'Przewodnik po najdziwniejszych sportach świata',
      description: 'Napisz artykuł po polsku o 5 najdziwniejszych dyscyplinach sportowych na świecie. Uwzględnij: rzucanie telefonami komórkowymi (Finlandia), wyścigi z żonami (Estonia), bieg z serem (UK), ekstremalne prasowanie (UK), szachy bokserskie. Opisz zasady i historię każdej dyscypliny.',
      status: 'pending',
      params: { 
        language: 'polski',
        wordCount: 800,
        tone: 'informacyjny ale lekki',
        keywords: 'dziwne sporty, konkurencje, świat, Finlandia, Estonia'
      },
    },
    {
      type: options.taskType,
      title: 'Dlaczego programiści piją tyle kawy',
      description: 'Napisz artykuł po polsku wyjaśniający kulturę picia kawy wśród programistów. Opisz stereotypy, prawdziwe powody (noc przed deadline), ulubione kawy dev-ów, kawowe memy i żarty branżowe. Dodaj sekcję "Jak przeżyć dzień bez kawy (spoiler: nie da się)".',
      status: 'pending',
      params: { 
        language: 'polski',
        wordCount: 600,
        tone: 'samokrytyczny, żartobliwy, insider',
        keywords: 'programiści, kawa, IT, kofeina, debug, deadline'
      },
    },
    {
      type: options.taskType,
      title: 'Kosmiczne rekordy Guinnessa',
      description: 'Napisz fascynujący artykuł po polsku o najciekawszych rekordach ustanowionych w kosmosie. Uwzględnij: najdłuższy pobyt (Walerij Polakow), najwięcej spacerów kosmicznych, pierwszy ślub w kosmosie, najdalsza podróż człowieka, najdłuższy lot bez przerwy. Dodaj ciekawostki o życiu codziennym astronautów.',
      status: 'pending',
      params: { 
        language: 'polski',
        wordCount: 750,
        tone: 'fascynujący, edukacyjny',
        keywords: 'kosmos, rekordy, astronauci, ISS, NASA, Guinness'
      },
    },
  ];

  createProjectTasks(tasksFilePath, options.projectCodename, {
    workerCount: options.workerCount,
  }, sampleTasks);

  // Create default adapter template
  const adapterTemplate = {
    adapterId: options.taskType,
    version: '1.0',
    displayName: options.taskType.split('-').map(s => 
      s.charAt(0).toUpperCase() + s.slice(1)
    ).join(' '),
    prompts: {
      taskStart: `You are working on a ${options.taskType} task.\n\nTask: {title}\nDescription: {description}\n\nPlease complete this task.`,
      taskContinue: 'Please continue with the task.',
      auditPrompt: 'Please review the output and confirm it meets requirements.',
    },
    completionCriteria: {
      minOutputLength: 100,
    },
    outputProcessing: {
      saveAs: 'output/{id}_{title_slug}.md',
    },
    statusFlow: ['pending', 'processing', 'task_completed', 'audit_passed'],
    retryableStatuses: ['pending', 'audit_failed'],
    maxRetries: 3,
  };

  writeJson(path.join(adaptersDir, `${options.taskType}.json`), adapterTemplate);

  // Create .gitignore for adg-parallels
  const gitignore = `# ADG-Parallels generated files
workers/
*.lock
heartbeat.json
`;
  fs.writeFileSync(path.join(adgRoot, '.gitignore'), gitignore, 'utf8');

  logger.info(`Project structure created for ${options.projectCodename}`);
}

// =============================================================================
// COMMAND: Start Workers
// =============================================================================

/**
 * Command to start workers for the current project
 */
export async function startWorkers(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const roleInfo = detectRole();
  if (!roleInfo) {
    vscode.window.showErrorMessage('Could not detect workspace role');
    return;
  }

  // Must be manager or CEO to start workers
  if (!canDelegate()) {
    vscode.window.showErrorMessage(
      `Only Manager or CEO can start workers. Current role: ${roleInfo.role.toUpperCase()}`
    );
    return;
  }

  // Get management directory - for CEO it's in .adg-parallels/management/
  let managementDir = roleInfo.paths.managementDir;
  if (!managementDir && roleInfo.role === 'ceo') {
    // CEO - check if project is provisioned
    const potentialMgmtDir = path.join(roleInfo.paths.adgRoot, 'management');
    if (pathExists(potentialMgmtDir)) {
      managementDir = potentialMgmtDir;
    }
  }

  if (!managementDir) {
    vscode.window.showErrorMessage('Management directory not found. Please run "ADG: Provision New Project" first.');
    return;
  }

  // Find tasks file
  const tasksFile = findTasksFile(managementDir);
  if (!tasksFile) {
    vscode.window.showErrorMessage('No tasks file found. Please provision project first.');
    return;
  }

  // Load task manager
  const taskManager = new TaskManager(tasksFile);
  const stats = await taskManager.getStats();
  const config = await taskManager.getConfig();

  if (!stats || !config) {
    vscode.window.showErrorMessage('Could not load project configuration.');
    return;
  }

  if (stats.pending === 0) {
    vscode.window.showWarningMessage('No pending tasks to process.');
    return;
  }

  // Load hierarchy config for limits
  const hierarchyConfigPath = path.join(managementDir, 'hierarchy-config.json');
  const hierarchyConfig = pathExists(hierarchyConfigPath) 
    ? JSON.parse(fs.readFileSync(hierarchyConfigPath, 'utf8'))
    : null;
  
  // Get max allowed workers from hierarchy config
  const maxFromEmergencyBrake = hierarchyConfig?.emergencyBrake?.maxTotalInstances ?? 10;
  const currentRoleLevel = roleInfo.role === 'ceo' ? 0 : (roleInfo.role === 'manager' ? 1 : 2);
  const levelConfig = hierarchyConfig?.levelConfig?.[currentRoleLevel];
  const maxFromRole = levelConfig?.maxSubordinates ?? 10;
  const maxAllowedWorkers = Math.min(maxFromEmergencyBrake, maxFromRole, 10);

  // Confirm worker count
  const countStr = await vscode.window.showInputBox({
    prompt: `Start how many workers? (${stats.pending} pending tasks, max ${maxAllowedWorkers} allowed)`,
    value: Math.min(stats.pending, config.workerCount, maxAllowedWorkers).toString(),
    validateInput: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1) {
        return 'Worker count must be at least 1';
      }
      if (num > maxAllowedWorkers) {
        return `Worker count cannot exceed ${maxAllowedWorkers} (hierarchy limit)`;
      }
      return null;
    }
  });

  if (!countStr) {
    return;
  }

  const count = parseInt(countStr, 10);

  // Create lifecycle manager and spawn workers
  const lifecycle = createManagerLifecycle(managementDir, taskManager);
  await lifecycle.initialize();

  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Starting workers...',
    cancellable: false,
  }, async (progress) => {
    progress.report({ message: `Provisioning ${count} workers...` });
    
    const workers = await lifecycle.provisionAndSpawnWorkers(count);
    
    progress.report({ message: `Started ${workers.length} workers!` });
    
    vscode.window.showInformationMessage(
      `Started ${workers.length} worker(s). They will process ${stats.pending} pending tasks.`
    );
  });
}

// =============================================================================
// COMMAND: Show Status
// =============================================================================

/**
 * Command to show current project status
 */
export async function showStatus(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const roleInfo = detectRole();
  if (!roleInfo) {
    vscode.window.showErrorMessage('Could not detect workspace role');
    return;
  }
  
  const displayInfo = getRoleDisplayInfo(roleInfo.role);

  let statusMessage = `**ADG-Parallels Status**\n\n`;
  statusMessage += `Role: ${displayInfo.label} ${displayInfo.icon}\n`;
  statusMessage += `Can Delegate: ${canDelegate() ? 'Yes' : 'No'}\n`;

  // If manager/CEO, show task stats
  if (roleInfo.paths.managementDir) {
    const tasksFile = findTasksFile(roleInfo.paths.managementDir);
    if (tasksFile) {
      const taskManager = new TaskManager(tasksFile);
      const stats = await taskManager.getStats();
      if (stats) {
        statusMessage += `\n**Tasks:**\n`;
        statusMessage += `- Total: ${stats.total}\n`;
        statusMessage += `- Pending: ${stats.pending}\n`;
        statusMessage += `- Processing: ${stats.processing}\n`;
        statusMessage += `- Completed: ${stats.completed}\n`;
        statusMessage += `- Failed: ${stats.failed}\n`;
      }
    }
  }

  // Show as information message (could be upgraded to webview later)
  vscode.window.showInformationMessage(
    `${displayInfo.icon} ${displayInfo.label} | Tasks: ${roleInfo.paths.managementDir ? 'Found' : 'N/A'}`,
    'Show Details'
  ).then(selection => {
    if (selection === 'Show Details') {
      const outputChannel = vscode.window.createOutputChannel('ADG-Parallels Status');
      outputChannel.appendLine(statusMessage);
      outputChannel.show();
    }
  });
}

// =============================================================================
// COMMAND: Import Tasks from CSV
// =============================================================================

/**
 * Command to import tasks from a CSV file
 */
export async function importTasksFromCsv(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const roleInfo = detectRole();
  if (!roleInfo) {
    vscode.window.showErrorMessage('Could not detect workspace role');
    return;
  }

  if (!roleInfo.paths.managementDir) {
    vscode.window.showErrorMessage('No management directory. Please provision project first.');
    return;
  }

  const tasksFile = findTasksFile(roleInfo.paths.managementDir);
  if (!tasksFile) {
    vscode.window.showErrorMessage('No tasks file found. Please provision project first.');
    return;
  }

  // Select CSV file
  const csvUris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'CSV Files': ['csv'] },
    title: 'Select CSV file with tasks',
  });

  if (!csvUris || csvUris.length === 0) {
    return;
  }

  const csvContent = fs.readFileSync(csvUris[0].fsPath, 'utf8');
  const lines = csvContent.split('\n').filter(l => l.trim());

  if (lines.length < 2) {
    vscode.window.showErrorMessage('CSV file must have a header and at least one task row.');
    return;
  }

  // Parse CSV (simple parser - assumes no commas in values)
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const titleIndex = headers.indexOf('title');
  const descIndex = headers.indexOf('description');
  const typeIndex = headers.indexOf('type');

  if (titleIndex === -1) {
    vscode.window.showErrorMessage('CSV must have a "title" column.');
    return;
  }

  const tasks: Array<Omit<Task, 'id' | 'retryCount'>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const title = values[titleIndex];
    if (!title) {
      continue;
    }

    tasks.push({
      type: typeIndex !== -1 ? values[typeIndex] || 'default' : 'default',
      title,
      description: descIndex !== -1 ? values[descIndex] : undefined,
      status: 'pending',
      maxRetries: 3,
    });
  }

  if (tasks.length === 0) {
    vscode.window.showWarningMessage('No valid tasks found in CSV.');
    return;
  }

  // Add tasks to project
  const taskManager = new TaskManager(tasksFile);
  const addedTasks = await taskManager.addTasks(tasks);

  vscode.window.showInformationMessage(
    `Imported ${addedTasks.length} tasks from CSV.`
  );
}

// =============================================================================
// COMMAND: Claim Next Task (Worker)
// =============================================================================

/**
 * Command for workers to claim the next available task
 */
export async function claimNextTask(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const roleInfo = detectRole();
  if (!roleInfo) {
    vscode.window.showErrorMessage('Could not detect workspace role');
    return;
  }

  if (roleInfo.role !== 'worker' && roleInfo.role !== 'teamlead') {
    vscode.window.showWarningMessage('This command is for workers only.');
    return;
  }

  // Load worker config
  const workerConfigPath = path.join(workspaceRoot, 'worker.json');
  if (!pathExists(workerConfigPath)) {
    vscode.window.showErrorMessage('Worker config not found.');
    return;
  }

  const workerConfig = JSON.parse(fs.readFileSync(workerConfigPath, 'utf8'));
  const tasksFile = workerConfig.paths?.tasksFile;

  if (!tasksFile || !pathExists(tasksFile)) {
    vscode.window.showErrorMessage('Tasks file not found.');
    return;
  }

  const taskManager = new TaskManager(tasksFile);
  const task = await taskManager.claimNextTask(workerConfig.workerId);

  if (!task) {
    vscode.window.showInformationMessage('No pending tasks available.');
    return;
  }

  vscode.window.showInformationMessage(
    `Claimed task #${task.id}: ${task.title}`,
    'View Task'
  ).then(async selection => {
    if (selection === 'View Task') {
      const doc = await vscode.workspace.openTextDocument(tasksFile);
      await vscode.window.showTextDocument(doc);
    }
  });
}

// =============================================================================
// COMMAND: Complete Current Task (Worker)
// =============================================================================

/**
 * Command for workers to mark current task as completed
 */
export async function completeCurrentTask(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;

  // Load worker config
  const workerConfigPath = path.join(workspaceRoot, 'worker.json');
  if (!pathExists(workerConfigPath)) {
    vscode.window.showErrorMessage('Worker config not found.');
    return;
  }

  const workerConfig = JSON.parse(fs.readFileSync(workerConfigPath, 'utf8'));
  const tasksFile = workerConfig.paths?.tasksFile;

  if (!tasksFile || !pathExists(tasksFile)) {
    vscode.window.showErrorMessage('Tasks file not found.');
    return;
  }

  const taskManager = new TaskManager(tasksFile);
  const workerTasks = await taskManager.getWorkerTasks(workerConfig.workerId);
  const processingTask = workerTasks.find(t => t.status === 'processing');

  if (!processingTask) {
    vscode.window.showWarningMessage('No task currently in progress.');
    return;
  }

  const success = await taskManager.completeTask(
    processingTask.id,
    workerConfig.workerId
  );

  if (success) {
    vscode.window.showInformationMessage(
      `Task #${processingTask.id} marked as completed!`
    );
  } else {
    vscode.window.showErrorMessage('Failed to complete task.');
  }
}

// =============================================================================
// COMMAND: Execute Task (Worker - uses LM API)
// =============================================================================

/**
 * Command for workers to execute a task using the Language Model API
 * @param autoMode If 'all', skip the UI and execute all pending tasks automatically
 */
export async function executeTask(autoMode?: 'all' | 'next'): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const roleInfo = detectRole();
  
  if (!roleInfo) {
    vscode.window.showErrorMessage('Could not detect workspace role');
    return;
  }

  // Get worker config - either from worker directory or from current workspace
  let workerConfig: WorkerConfig | null = null;
  let tasksFile: string | null = null;
  let adaptersDir: string;

  if (roleInfo.role === 'worker' || roleInfo.role === 'teamlead') {
    // Worker mode - load from worker.json
    const workerConfigPath = path.join(workspaceRoot, 'worker.json');
    workerConfig = readJson<WorkerConfig>(workerConfigPath);
    
    if (!workerConfig) {
      vscode.window.showErrorMessage('Worker config not found.');
      return;
    }

    tasksFile = workerConfig.paths.tasksFile;
    adaptersDir = path.join(path.dirname(tasksFile), '..', 'adapters');
  } else if (roleInfo.paths.managementDir) {
    // Manager/CEO mode - can also execute tasks manually
    tasksFile = findTasksFile(roleInfo.paths.managementDir);
    adaptersDir = roleInfo.paths.adaptersDir || path.join(roleInfo.paths.adgRoot, 'adapters');
    
    // Create a temporary worker config
    workerConfig = {
      workerId: `${roleInfo.role}_manual`,
      role: roleInfo.role,
      parentRole: 'ceo',
      paths: {
        tasksFile: tasksFile || '',
        attachments: '',
        outputDir: path.join(roleInfo.paths.adgRoot, 'output'),
        workerRoot: workspaceRoot,
      },
      createdAt: new Date().toISOString(),
      instructionsVersion: '1.0',
    };
  } else {
    vscode.window.showErrorMessage('No ADG-Parallels project found. Please provision a project first.');
    return;
  }

  if (!tasksFile || !pathExists(tasksFile)) {
    vscode.window.showErrorMessage('Tasks file not found.');
    return;
  }

  // Initialize task manager
  const taskManager = new TaskManager(tasksFile);
  const stats = await taskManager.getStats();

  if (!stats || stats.pending === 0) {
    // If worker, handle auto-close
    if (roleInfo.role === 'worker') {
      const config = vscode.workspace.getConfiguration('adg-parallels');
      const autoClose = config.get('workerAutoClose', true);
      const autoCloseDelay = config.get('workerAutoCloseDelay', 3000) as number;
      
      // Create finished flag so manager knows we're done (not crashed)
      const finishedFlagPath = path.join(workspaceRoot, 'finished.flag');
      fs.writeFileSync(finishedFlagPath, JSON.stringify({
        workerId: workerConfig?.workerId || 'unknown',
        finishedAt: new Date().toISOString(),
        reason: 'no_pending_tasks'
      }, null, 2));
      logger.info(`🏁 Created finished flag: ${finishedFlagPath}`);

      if (autoMode && autoClose) {
        // Auto-mode: close automatically after delay
        vscode.window.showInformationMessage(
          `🥚 No pending tasks. Window closing in ${autoCloseDelay / 1000}s...`
        );
        await new Promise(resolve => setTimeout(resolve, autoCloseDelay));
        await vscode.commands.executeCommand('workbench.action.closeWindow');
      } else {
        // Manual mode: ask user
        const shouldClose = await vscode.window.showInformationMessage(
          '🥚 No pending tasks. Close this worker window?',
          'Yes', 'No'
        );
        if (shouldClose === 'Yes') {
          await vscode.commands.executeCommand('workbench.action.closeWindow');
        }
      }
    } else {
      vscode.window.showInformationMessage('🥚 No pending tasks available.');
    }
    return;
  }

  // Determine action - autoMode skips UI for workers
  let actionValue: 'next' | 'select' | 'all';
  
  if (autoMode) {
    // Auto-started worker - use specified mode
    actionValue = autoMode;
    logger.info(`Auto-mode execution: ${autoMode}`);
  } else if (roleInfo.role === 'worker') {
    // Worker without autoMode - default to 'all' but show quick confirmation
    const confirm = await vscode.window.showQuickPick([
      { label: '$(run-all) Execute All Pending Tasks', value: 'all', description: `${stats.pending} tasks waiting` },
      { label: '$(play) Execute Next Task Only', value: 'next' },
      { label: '$(close) Cancel', value: 'cancel' },
    ], {
      placeHolder: '🥚 Ejajka-Worker ready! What should I do?',
    });
    
    if (!confirm || confirm.value === 'cancel') {
      return;
    }
    actionValue = confirm.value as 'next' | 'all';
  } else {
    // Manager/CEO - full menu (loop first as most common action)
    const action = await vscode.window.showQuickPick([
      { label: '$(run-all) Execute All Pending Tasks', value: 'all', description: `${stats.pending} tasks - run loop until done` },
      { label: '$(play) Execute Next Task Only', value: 'next', description: 'Process one task and stop' },
      { label: '$(list-unordered) Select Specific Task', value: 'select' },
    ], {
      placeHolder: 'What would you like to do?',
    });

    if (!action) {
      return;
    }
    actionValue = action.value as 'next' | 'select' | 'all';
  }

  // Ensure adapters exist
  createBuiltInAdapters(adaptersDir);

  // Create executor config
  const executorConfig: ExecutorConfig = {
    workerId: workerConfig!.workerId,
    role: workerConfig!.role,
    depth: roleInfo.depth,
    adaptersDir,
    outputDir: workerConfig!.paths.outputDir,
    projectCodename: 'project', // TODO: get from config
    includeStatute: true,
    maxRetries: 3,
  };

  // Create executor with callbacks
  const executor = new WorkerExecutor(executorConfig, taskManager, {
    onTaskStart: (task) => {
      logger.info(`Starting task #${task.id}: ${task.title}`);
    },
    onProgress: (task, message) => {
      logger.debug(`Task #${task.id}: ${message}`);
    },
    onTaskComplete: (result) => {
      if (result.success) {
        vscode.window.showInformationMessage(
          `✅ Task #${result.task.id} completed in ${Math.round(result.durationMs / 1000)}s`
        );
      }
    },
    onTaskError: (task, error) => {
      vscode.window.showErrorMessage(`❌ Task #${task.id} failed: ${error}`);
    },
    onAllTasksComplete: () => {
      vscode.window.showInformationMessage('🎉 All tasks completed!');
    },
  });

  // Initialize executor
  const initialized = await executor.initialize();
  if (!initialized) {
    vscode.window.showErrorMessage(
      'Failed to initialize Language Model. Make sure you have GitHub Copilot enabled.'
    );
    return;
  }

  // Execute based on action
  switch (actionValue) {
    case 'next': {
      const result = await executor.executeNextTask();
      if (!result) {
        vscode.window.showInformationMessage('No more pending tasks.');
      }
      break;
    }
    
    case 'select': {
      const pendingTasks = await taskManager.getTasksByStatus('pending');
      const selected = await vscode.window.showQuickPick(
        pendingTasks.map(t => ({
          label: `#${t.id}: ${t.title}`,
          description: t.type,
          detail: t.description,
          task: t,
        })),
        { placeHolder: 'Select a task to execute' }
      );
      
      if (selected) {
        // Claim the task first
        await taskManager.claimNextTask(workerConfig!.workerId);
        await executor.executeTask(selected.task);
      }
      break;
    }
    
    case 'all': {
      // Skip confirmation for auto-mode workers
      if (!autoMode) {
        const confirm = await vscode.window.showWarningMessage(
          `This will execute all ${stats.pending} pending tasks. Continue?`,
          'Yes, Execute All',
          'Cancel'
        );
        
        if (confirm !== 'Yes, Execute All') {
          return;
        }
      }
      
      logger.info(`🥚 Starting execution loop for ${stats.pending} tasks...`);
      await executor.runLoop();
      
      // After completing all tasks, handle worker window
      if (roleInfo.role === 'worker') {
        // Create finished flag so manager knows we're done (not crashed)
        const finishedFlagPath = path.join(workspaceRoot, 'finished.flag');
        fs.writeFileSync(finishedFlagPath, JSON.stringify({
          workerId: workerConfig!.workerId,
          finishedAt: new Date().toISOString(),
          reason: 'all_tasks_completed'
        }, null, 2));
        logger.info(`🏁 Created finished flag: ${finishedFlagPath}`);

        const config = vscode.workspace.getConfiguration('adg-parallels');
        const autoClose = config.get('workerAutoClose', true);
        const autoCloseDelay = config.get('workerAutoCloseDelay', 3000) as number;
        
        if (autoMode && autoClose) {
          // Auto-mode: close automatically after delay
          vscode.window.showInformationMessage(
            `🎉 All tasks completed! Window closing in ${autoCloseDelay / 1000}s...`
          );
          await new Promise(resolve => setTimeout(resolve, autoCloseDelay));
          await vscode.commands.executeCommand('workbench.action.closeWindow');
        } else {
          // Manual mode: ask user
          const shouldClose = await vscode.window.showInformationMessage(
            '🎉 All tasks completed! Close this worker window?',
            'Yes', 'No'
          );
          if (shouldClose === 'Yes') {
            await vscode.commands.executeCommand('workbench.action.closeWindow');
          }
        }
      }
      break;
    }
  }
}

// =============================================================================
// COMMAND: Aggregate Outputs
// =============================================================================

/**
 * Aggregate outputs from subtasks of a mega-task
 */
export async function aggregateOutputs(): Promise<void> {
  const roleInfo = detectRole();
  if (!roleInfo) {
    vscode.window.showErrorMessage('Could not detect workspace role');
    return;
  }

  // Get management directory
  let managementDir = roleInfo.paths.managementDir;
  if (!managementDir && roleInfo.role === 'ceo') {
    const potentialMgmtDir = path.join(roleInfo.paths.adgRoot, 'management');
    if (pathExists(potentialMgmtDir)) {
      managementDir = potentialMgmtDir;
    }
  }

  if (!managementDir) {
    vscode.window.showErrorMessage('Management directory not found.');
    return;
  }

  // Find tasks file
  const tasksFile = findTasksFile(managementDir);
  if (!tasksFile) {
    vscode.window.showErrorMessage('No tasks file found.');
    return;
  }

  const taskManager = new TaskManager(tasksFile);
  const allTasks = await taskManager.getAllTasks();

  // Find mega-tasks (tasks with subtasks)
  const megaTasks = allTasks.filter(t => (t.subtaskIds?.length ?? 0) > 0);

  if (megaTasks.length === 0) {
    vscode.window.showInformationMessage('No mega-tasks with subtasks found.');
    return;
  }

  // Let user select which mega-task to aggregate
  const selected = await vscode.window.showQuickPick(
    megaTasks.map(t => ({
      label: `#${t.id}: ${t.title}`,
      description: `${t.subtaskIds?.length ?? 0} subtasks`,
      task: t,
    })),
    { placeHolder: 'Select mega-task to aggregate outputs' }
  );

  if (!selected) {
    return;
  }

  // Select merge strategy
  const strategyChoice = await vscode.window.showQuickPick([
    { label: 'Concatenate', value: 'concatenate' as MergeStrategy, description: 'Simple text concatenation' },
    { label: 'Markdown Sections', value: 'markdown-sections' as MergeStrategy, description: 'Organized markdown with headers' },
    { label: 'JSON Array', value: 'json-array' as MergeStrategy, description: 'Merge as JSON array' },
  ], { placeHolder: 'Select merge strategy' });

  if (!strategyChoice) {
    return;
  }

  // Determine output path
  const outputDir = path.join(path.dirname(path.dirname(tasksFile)), 'output');
  const outputPath = getAggregatedOutputPath(outputDir, selected.task);

  // Aggregate
  const result = await aggregateSubtaskOutputs(taskManager, selected.task.id, {
    strategy: strategyChoice.value,
    includeHeaders: true,
    outputPath,
  });

  if (result.success) {
    vscode.window.showInformationMessage(
      `✅ Aggregated ${result.totalFiles} outputs to ${result.outputPath}`
    );
    
    // Open the aggregated file
    if (result.outputPath) {
      const doc = await vscode.workspace.openTextDocument(result.outputPath);
      await vscode.window.showTextDocument(doc);
    }
  } else {
    vscode.window.showErrorMessage(`Failed to aggregate: ${result.error}`);
  }
}

// =============================================================================
// COMMAND: Generate Status Report
// =============================================================================

/**
 * Generate a status report for the current project
 */
export async function generateReport(): Promise<void> {
  const roleInfo = detectRole();
  if (!roleInfo) {
    vscode.window.showErrorMessage('Could not detect workspace role');
    return;
  }

  // Get management directory
  let managementDir = roleInfo.paths.managementDir;
  if (!managementDir && roleInfo.role === 'ceo') {
    const potentialMgmtDir = path.join(roleInfo.paths.adgRoot, 'management');
    if (pathExists(potentialMgmtDir)) {
      managementDir = potentialMgmtDir;
    }
  }

  if (!managementDir) {
    vscode.window.showErrorMessage('Management directory not found.');
    return;
  }

  // Find tasks file
  const tasksFile = findTasksFile(managementDir);
  if (!tasksFile) {
    vscode.window.showErrorMessage('No tasks file found.');
    return;
  }

  const taskManager = new TaskManager(tasksFile);
  
  // Generate report
  const report = await generateAndSaveManagerReport(
    managementDir,
    taskManager,
    roleInfo.workerId || 'manager'
  );

  // Format as markdown
  const markdown = formatManagerReportAsMarkdown(report);

  // Show in a new document
  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage(
    `📊 Report generated: ${report.stats.completed}/${report.stats.total} tasks completed`
  );
}

// =============================================================================
// COMMAND: Start Audit
// =============================================================================

/**
 * Start audit for completed tasks
 */
export async function startAudit(): Promise<void> {
  const roleInfo = detectRole();
  if (!roleInfo) {
    vscode.window.showErrorMessage('Could not detect workspace role');
    return;
  }

  // Get management directory
  let managementDir = roleInfo.paths.managementDir;
  if (!managementDir && roleInfo.role === 'ceo') {
    const potentialMgmtDir = path.join(roleInfo.paths.adgRoot, 'management');
    if (pathExists(potentialMgmtDir)) {
      managementDir = potentialMgmtDir;
    }
  }

  if (!managementDir) {
    vscode.window.showErrorMessage('Management directory not found.');
    return;
  }

  // Find tasks file
  const tasksFile = findTasksFile(managementDir);
  if (!tasksFile) {
    vscode.window.showErrorMessage('No tasks file found.');
    return;
  }

  const taskManager = new TaskManager(tasksFile);
  
  // Get tasks ready for audit
  const tasksToAudit = await taskManager.getTasksReadyForAudit();

  if (tasksToAudit.length === 0) {
    vscode.window.showInformationMessage('No completed tasks ready for audit.');
    return;
  }

  // Let user choose: audit all or select specific
  const choice = await vscode.window.showQuickPick([
    { label: `$(checklist) Audit All (${tasksToAudit.length} tasks)`, value: 'all' },
    { label: '$(list-selection) Select Tasks to Audit', value: 'select' },
  ], { placeHolder: 'Choose audit mode' });

  if (!choice) {
    return;
  }

  let selectedTasks: Task[] = [];

  if (choice.value === 'all') {
    selectedTasks = tasksToAudit;
  } else {
    const picks = await vscode.window.showQuickPick(
      tasksToAudit.map(t => ({
        label: `#${t.id}: ${t.title}`,
        description: t.type,
        picked: false,
        task: t,
      })),
      { 
        placeHolder: 'Select tasks to audit',
        canPickMany: true,
      }
    );

    if (!picks || picks.length === 0) {
      return;
    }

    selectedTasks = picks.map(p => p.task);
  }

  // Create audit tasks
  let created = 0;
  for (const task of selectedTasks) {
    // Read output content if available
    let outputContent: string | undefined;
    if (task.outputFile && pathExists(task.outputFile)) {
      try {
        outputContent = fs.readFileSync(task.outputFile, 'utf8');
      } catch {
        // Ignore read errors
      }
    }

    const auditTask = await taskManager.createAuditTask(task.id, outputContent);
    if (auditTask) {
      created++;
    }
  }

  vscode.window.showInformationMessage(
    `✅ Created ${created} audit tasks. Workers can now process them.`
  );
}

// =============================================================================
// REGISTER ALL COMMANDS
// =============================================================================

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('adg-parallels.provisionProject', provisionProject),
    vscode.commands.registerCommand('adg-parallels.startWorkers', startWorkers),
    vscode.commands.registerCommand('adg-parallels.showStatus', showStatus),
    vscode.commands.registerCommand('adg-parallels.importTasksCsv', importTasksFromCsv),
    vscode.commands.registerCommand('adg-parallels.claimNextTask', claimNextTask),
    vscode.commands.registerCommand('adg-parallels.completeTask', completeCurrentTask),
    vscode.commands.registerCommand('adg-parallels.executeTask', executeTask),
    vscode.commands.registerCommand('adg-parallels.aggregateOutputs', aggregateOutputs),
    vscode.commands.registerCommand('adg-parallels.generateReport', generateReport),
    vscode.commands.registerCommand('adg-parallels.startAudit', startAudit),
  );

  logger.info('Commands registered');
}
