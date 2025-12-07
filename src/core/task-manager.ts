/**
 * ADG-Parallels Task Manager
 * 
 * Manages the task queue with atomic updates, locking, and race condition handling.
 * This is the heart of task coordination between workers.
 */

import * as path from 'path';
import { 
  Task, 
  TaskStatus, 
  ProjectTasks, 
  ProjectConfig, 
  TaskStats 
} from '../types';
import { 
  readJson, 
  writeJson, 
  withLock, 
  findFiles, 
  pathExists 
} from '../utils/file-operations';
import { logger } from '../utils/logger';

/**
 * Task Manager class for handling task queue operations
 */
export class TaskManager {
  private tasksFilePath: string;

  constructor(tasksFilePath: string) {
    this.tasksFilePath = tasksFilePath;
  }

  /**
   * Get the path to the tasks file
   */
  getFilePath(): string {
    return this.tasksFilePath;
  }

  /**
   * Load the project tasks file
   */
  async load(): Promise<ProjectTasks | null> {
    return await withLock(this.tasksFilePath, () => {
      return readJson<ProjectTasks>(this.tasksFilePath);
    });
  }

  /**
   * Save the project tasks file
   */
  private async save(data: ProjectTasks): Promise<boolean> {
    data.updatedAt = new Date().toISOString();
    this.updateStats(data);
    return writeJson(this.tasksFilePath, data);
  }

  /**
   * Update task statistics
   */
  private updateStats(data: ProjectTasks): void {
    const stats: TaskStats = {
      total: data.tasks.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const task of data.tasks) {
      switch (task.status) {
        case 'pending':
          stats.pending++;
          break;
        case 'processing':
          stats.processing++;
          break;
        case 'task_completed':
        case 'audit_in_progress':
        case 'audit_passed':
          stats.completed++;
          break;
        case 'audit_failed':
          stats.failed++;
          break;
      }
    }

    data.stats = stats;

    // Update global status
    if (stats.pending === 0 && stats.processing === 0) {
      if (stats.failed > 0) {
        data.globalStatus = 'all_disposed';
      } else {
        data.globalStatus = 'completed';
      }
    } else if (stats.processing > 0 || stats.completed > 0) {
      data.globalStatus = 'in_progress';
    } else {
      data.globalStatus = 'not_started';
    }
  }

  /**
   * Get all tasks
   */
  async getAllTasks(): Promise<Task[]> {
    const data = await this.load();
    return data?.tasks ?? [];
  }

  /**
   * Get tasks by status
   */
  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    const tasks = await this.getAllTasks();
    return tasks.filter(t => t.status === status);
  }

  /**
   * Get a specific task by ID
   */
  async getTask(taskId: number): Promise<Task | null> {
    const tasks = await this.getAllTasks();
    return tasks.find(t => t.id === taskId) ?? null;
  }

  /**
   * Find and claim the first available pending task
   * Returns the claimed task or null if none available
   */
  async claimNextTask(workerId: string): Promise<Task | null> {
    return await withLock(this.tasksFilePath, async () => {
      const data = readJson<ProjectTasks>(this.tasksFilePath);
      if (!data) {
        logger.error('Could not load tasks file');
        return null;
      }

      // Find first pending task
      const task = data.tasks.find(t => t.status === 'pending');
      if (!task) {
        logger.info('No pending tasks available');
        return null;
      }

      // Claim the task
      task.status = 'processing';
      task.assignedWorker = workerId;
      task.startedAt = new Date().toISOString();

      // Save immediately
      if (!this.saveSync(data)) {
        logger.error('Failed to save task claim');
        return null;
      }

      logger.info(`Task ${task.id} claimed by ${workerId}`, { 
        title: task.title, 
        type: task.type 
      });

      return task;
    });
  }

  /**
   * Synchronous save (used inside lock)
   */
  private saveSync(data: ProjectTasks): boolean {
    data.updatedAt = new Date().toISOString();
    this.updateStats(data);
    return writeJson(this.tasksFilePath, data);
  }

  /**
   * Complete a task
   */
  async completeTask(
    taskId: number, 
    workerId: string, 
    outputFile?: string
  ): Promise<boolean> {
    return await withLock(this.tasksFilePath, () => {
      const data = readJson<ProjectTasks>(this.tasksFilePath);
      if (!data) {
        return false;
      }

      const task = data.tasks.find(t => t.id === taskId);
      if (!task) {
        logger.error(`Task ${taskId} not found`);
        return false;
      }

      // Verify ownership
      if (task.assignedWorker !== workerId) {
        logger.error(`Task ${taskId} not assigned to ${workerId}`);
        return false;
      }

      task.status = 'task_completed';
      task.completedAt = new Date().toISOString();
      if (outputFile) {
        task.outputFile = outputFile;
      }

      logger.info(`Task ${taskId} completed by ${workerId}`);
      return this.saveSync(data);
    }) ?? false;
  }

  /**
   * Fail a task (with optional retry)
   */
  async failTask(
    taskId: number, 
    workerId: string, 
    error: string
  ): Promise<boolean> {
    return await withLock(this.tasksFilePath, () => {
      const data = readJson<ProjectTasks>(this.tasksFilePath);
      if (!data) {
        return false;
      }

      const task = data.tasks.find(t => t.id === taskId);
      if (!task) {
        logger.error(`Task ${taskId} not found`);
        return false;
      }

      task.lastError = error;
      task.retryCount++;

      // Check if should retry
      if (task.retryCount < task.maxRetries && data.config.retryOnFailed) {
        task.status = 'pending';
        task.assignedWorker = undefined;
        task.startedAt = undefined;
        logger.warn(`Task ${taskId} failed, will retry (${task.retryCount}/${task.maxRetries})`);
      } else {
        task.status = 'audit_failed';
        task.completedAt = new Date().toISOString();
        logger.error(`Task ${taskId} failed permanently`, { error });
      }

      return this.saveSync(data);
    }) ?? false;
  }

  /**
   * Release a task (put back in queue)
   */
  async releaseTask(taskId: number, workerId: string): Promise<boolean> {
    return await withLock(this.tasksFilePath, () => {
      const data = readJson<ProjectTasks>(this.tasksFilePath);
      if (!data) {
        return false;
      }

      const task = data.tasks.find(t => t.id === taskId);
      if (!task) {
        return false;
      }

      // Only release if assigned to this worker
      if (task.assignedWorker === workerId) {
        task.status = 'pending';
        task.assignedWorker = undefined;
        task.startedAt = undefined;
        logger.info(`Task ${taskId} released by ${workerId}`);
        return this.saveSync(data);
      }

      return false;
    }) ?? false;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: number, 
    status: TaskStatus, 
    workerId?: string
  ): Promise<boolean> {
    return await withLock(this.tasksFilePath, () => {
      const data = readJson<ProjectTasks>(this.tasksFilePath);
      if (!data) {
        return false;
      }

      const task = data.tasks.find(t => t.id === taskId);
      if (!task) {
        return false;
      }

      // If workerId provided, verify ownership
      if (workerId && task.assignedWorker !== workerId) {
        logger.error(`Task ${taskId} not owned by ${workerId}`);
        return false;
      }

      task.status = status;
      
      if (status === 'task_completed' || status === 'audit_passed' || status === 'audit_failed') {
        task.completedAt = new Date().toISOString();
      }

      logger.info(`Task ${taskId} status updated to ${status}`);
      return this.saveSync(data);
    }) ?? false;
  }

  /**
   * Add a new task
   */
  async addTask(task: Omit<Task, 'id' | 'retryCount'>): Promise<Task | null> {
    return await withLock(this.tasksFilePath, () => {
      const data = readJson<ProjectTasks>(this.tasksFilePath);
      if (!data) {
        return null;
      }

      // Generate new ID
      const maxId = data.tasks.reduce((max, t) => Math.max(max, t.id), 0);
      const newTask: Task = {
        ...task,
        id: maxId + 1,
        retryCount: 0,
        maxRetries: task.maxRetries ?? 3,
      };

      data.tasks.push(newTask);
      
      if (this.saveSync(data)) {
        logger.info(`Task ${newTask.id} added`, { title: newTask.title });
        return newTask;
      }
      return null;
    });
  }

  /**
   * Add multiple tasks (bulk insert)
   */
  async addTasks(tasks: Array<Omit<Task, 'id' | 'retryCount'>>): Promise<Task[]> {
    return await withLock(this.tasksFilePath, () => {
      const data = readJson<ProjectTasks>(this.tasksFilePath);
      if (!data) {
        return [];
      }

      let maxId = data.tasks.reduce((max, t) => Math.max(max, t.id), 0);
      const newTasks: Task[] = [];

      for (const task of tasks) {
        maxId++;
        const newTask: Task = {
          ...task,
          id: maxId,
          retryCount: 0,
          maxRetries: task.maxRetries ?? 3,
        };
        data.tasks.push(newTask);
        newTasks.push(newTask);
      }

      if (this.saveSync(data)) {
        logger.info(`${newTasks.length} tasks added`);
        return newTasks;
      }
      return [];
    }) ?? [];
  }

  /**
   * Get project statistics
   */
  async getStats(): Promise<TaskStats | null> {
    const data = await this.load();
    return data?.stats ?? null;
  }

  /**
   * Get project configuration
   */
  async getConfig(): Promise<ProjectConfig | null> {
    const data = await this.load();
    return data?.config ?? null;
  }

  /**
   * Check if all tasks are completed
   */
  async isAllCompleted(): Promise<boolean> {
    const stats = await this.getStats();
    if (!stats) {
      return false;
    }
    return stats.pending === 0 && stats.processing === 0;
  }

  /**
   * Check if there are any pending tasks
   */
  async hasPendingTasks(): Promise<boolean> {
    const stats = await this.getStats();
    return (stats?.pending ?? 0) > 0;
  }

  /**
   * Get tasks assigned to a specific worker
   */
  async getWorkerTasks(workerId: string): Promise<Task[]> {
    const tasks = await this.getAllTasks();
    return tasks.filter(t => t.assignedWorker === workerId);
  }

  /**
   * Release all tasks assigned to a worker (for cleanup on crash)
   */
  async releaseWorkerTasks(workerId: string): Promise<number> {
    return await withLock(this.tasksFilePath, () => {
      const data = readJson<ProjectTasks>(this.tasksFilePath);
      if (!data) {
        return 0;
      }

      let released = 0;
      for (const task of data.tasks) {
        if (task.assignedWorker === workerId && task.status === 'processing') {
          task.status = 'pending';
          task.assignedWorker = undefined;
          task.startedAt = undefined;
          released++;
        }
      }

      if (released > 0) {
        this.saveSync(data);
        logger.info(`Released ${released} tasks from worker ${workerId}`);
      }

      return released;
    }) ?? 0;
  }

  /**
   * Get subtasks for a parent task
   */
  async getSubtasks(parentTaskId: number): Promise<Task[]> {
    const tasks = await this.getAllTasks();
    return tasks.filter(t => t.parentTaskId === parentTaskId);
  }

  /**
   * Check if all subtasks of a parent task are completed
   */
  async areSubtasksComplete(parentTaskId: number): Promise<boolean> {
    const subtasks = await this.getSubtasks(parentTaskId);
    if (subtasks.length === 0) {
      return false;
    }
    return subtasks.every(t => 
      t.status === 'task_completed' || 
      t.status === 'audit_passed'
    );
  }

  /**
   * Get aggregated output paths for subtasks
   */
  async getSubtaskOutputs(parentTaskId: number): Promise<string[]> {
    const subtasks = await this.getSubtasks(parentTaskId);
    return subtasks
      .filter(t => t.outputFile)
      .map(t => t.outputFile as string);
  }

  /**
   * Update parent task with subtask IDs
   */
  async linkSubtasksToParent(parentTaskId: number, subtaskIds: number[]): Promise<boolean> {
    return await withLock(this.tasksFilePath, () => {
      const data = readJson<ProjectTasks>(this.tasksFilePath);
      if (!data) {
        return false;
      }

      const parentTask = data.tasks.find(t => t.id === parentTaskId);
      if (!parentTask) {
        return false;
      }

      parentTask.subtaskIds = subtaskIds;
      return this.saveSync(data);
    }) ?? false;
  }
}

/**
 * Find tasks file in a directory
 */
export function findTasksFile(managementDir: string): string | null {
  const files = findFiles(managementDir, /^project_.*_adg-tasks\.json$/);
  if (files.length === 0) {
    return null;
  }
  return files[0];
}

/**
 * Create a new project tasks file
 */
export function createProjectTasks(
  filePath: string,
  projectCodename: string,
  config: Partial<ProjectConfig>,
  initialTasks: Array<Omit<Task, 'id' | 'retryCount' | 'maxRetries'>> = []
): boolean {
  const defaultConfig: ProjectConfig = {
    workerCount: 4,
    statuses: ['pending', 'processing', 'task_completed', 'audit_in_progress', 'audit_passed', 'audit_failed'],
    completedStatuses: ['audit_passed'],
    failedStatuses: ['audit_failed'],
    retryOnFailed: true,
    outputPattern: 'output/{id}_{title}.md',
    ...config,
  };

  const tasks: Task[] = initialTasks.map((t, i) => ({
    ...t,
    id: i + 1,
    status: t.status || 'pending',
    retryCount: 0,
    maxRetries: 3,
  }));

  const projectTasks: ProjectTasks = {
    projectCodename,
    version: '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: defaultConfig,
    globalStatus: 'not_started',
    stats: {
      total: tasks.length,
      pending: tasks.length,
      processing: 0,
      completed: 0,
      failed: 0,
    },
    tasks,
  };

  return writeJson(filePath, projectTasks);
}
