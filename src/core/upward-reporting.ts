/**
 * ADG-Parallels Upward Reporting
 * 
 * Handles status reporting from workers to managers/CEO.
 * Workers report progress, managers aggregate and forward.
 */

import * as path from 'path';
import * as fs from 'fs';
import { Task, TaskStats, Role } from '../types';
import { TaskManager } from './task-manager';
import { ensureDir, pathExists } from '../utils/file-operations';
import { saveXML, loadXML } from './xml-loader';
import { logger } from '../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface WorkerReport {
  workerId: string;
  timestamp: string;
  status: 'idle' | 'working' | 'completed' | 'error';
  currentTask?: {
    id: number;
    title: string;
    progress?: number;
  };
  completedTasks: number;
  failedTasks: number;
  uptime: number; // seconds since start
}

export interface ManagerReport {
  managerId: string;
  timestamp: string;
  projectCodename: string;
  stats: TaskStats;
  workers: WorkerReport[];
  summary: {
    totalWorkers: number;
    activeWorkers: number;
    idleWorkers: number;
    errorWorkers: number;
  };
}

export interface CeoReport {
  timestamp: string;
  projects: {
    codename: string;
    status: string;
    progress: number;
    workers: number;
    tasksCompleted: number;
    tasksTotal: number;
  }[];
  globalStats: {
    totalProjects: number;
    totalWorkers: number;
    totalTasksCompleted: number;
    totalTasksPending: number;
  };
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

/**
 * Generate a worker status report
 */
export function generateWorkerReport(
  workerId: string,
  currentTask: Task | null,
  completedTasks: number,
  failedTasks: number,
  startTime: Date
): WorkerReport {
  const uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
  
  return {
    workerId,
    timestamp: new Date().toISOString(),
    status: currentTask ? 'working' : 'idle',
    currentTask: currentTask ? {
      id: currentTask.id,
      title: currentTask.title,
    } : undefined,
    completedTasks,
    failedTasks,
    uptime,
  };
}

/**
 * Generate a manager report from worker reports
 */
export function generateManagerReport(
  managerId: string,
  projectCodename: string,
  stats: TaskStats,
  workerReports: WorkerReport[]
): ManagerReport {
  const activeWorkers = workerReports.filter(w => w.status === 'working').length;
  const idleWorkers = workerReports.filter(w => w.status === 'idle').length;
  const errorWorkers = workerReports.filter(w => w.status === 'error').length;

  return {
    managerId,
    timestamp: new Date().toISOString(),
    projectCodename,
    stats,
    workers: workerReports,
    summary: {
      totalWorkers: workerReports.length,
      activeWorkers,
      idleWorkers,
      errorWorkers,
    },
  };
}

/**
 * Generate a CEO overview report
 */
export function generateCeoReport(
  managerReports: ManagerReport[]
): CeoReport {
  const projects = managerReports.map(mr => {
    const progress = mr.stats.total > 0 
      ? Math.round((mr.stats.completed / mr.stats.total) * 100)
      : 0;
    
    return {
      codename: mr.projectCodename,
      status: mr.stats.pending === 0 ? 'completed' : 'in_progress',
      progress,
      workers: mr.summary.totalWorkers,
      tasksCompleted: mr.stats.completed,
      tasksTotal: mr.stats.total,
    };
  });

  const globalStats = {
    totalProjects: managerReports.length,
    totalWorkers: managerReports.reduce((sum, mr) => sum + mr.summary.totalWorkers, 0),
    totalTasksCompleted: managerReports.reduce((sum, mr) => sum + mr.stats.completed, 0),
    totalTasksPending: managerReports.reduce((sum, mr) => sum + mr.stats.pending, 0),
  };

  return {
    timestamp: new Date().toISOString(),
    projects,
    globalStats,
  };
}

// =============================================================================
// REPORT PERSISTENCE
// =============================================================================

/**
 * Save worker report to file
 */
export function saveWorkerReport(workerDir: string, report: WorkerReport): void {
  const reportPath = path.join(workerDir, 'status-report.xml');
  saveXML(reportPath, report, 'worker_report');
  logger.debug(`Worker report saved: ${report.workerId}`);
}

/**
 * Load worker report from file
 */
export async function loadWorkerReport(workerDir: string): Promise<WorkerReport | null> {
  const reportPath = path.join(workerDir, 'status-report.xml');
  if (!pathExists(reportPath)) {
    return null;
  }
  return loadXML<WorkerReport>(reportPath);
}

/**
 * Save manager report to file
 */
export function saveManagerReport(managementDir: string, report: ManagerReport): void {
  const reportsDir = path.join(managementDir, 'reports');
  ensureDir(reportsDir);
  
  const reportPath = path.join(reportsDir, 'manager-report.xml');
  saveXML(reportPath, report, 'manager_report');
  
  // Also save historical report
  const historyPath = path.join(
    reportsDir, 
    `report_${new Date().toISOString().replace(/[:.]/g, '-')}.xml`
  );
  saveXML(historyPath, report, 'manager_report');
  
  logger.debug(`Manager report saved: ${report.managerId}`);
}

/**
 * Collect worker reports from all worker directories
 */
export async function collectWorkerReports(workersBaseDir: string): Promise<WorkerReport[]> {
  if (!pathExists(workersBaseDir)) {
    return [];
  }

  const reports: WorkerReport[] = [];
  const entries = fs.readdirSync(workersBaseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('worker-')) {
      const workerDir = path.join(workersBaseDir, entry.name);
      const report = await loadWorkerReport(workerDir);
      if (report) {
        reports.push(report);
      }
    }
  }

  return reports;
}

/**
 * Generate and save a full manager report
 */
export async function generateAndSaveManagerReport(
  managementDir: string,
  taskManager: TaskManager,
  managerId: string = 'manager'
): Promise<ManagerReport> {
  // Get stats
  const stats = await taskManager.getStats();
  const config = await taskManager.getConfig();
  
  // Collect worker reports
  const workersBaseDir = path.join(path.dirname(managementDir), 'workers');
  const workerReports = await collectWorkerReports(workersBaseDir);
  
  // Generate report
  const report = generateManagerReport(
    managerId,
    'project', // TODO: get from project config
    stats || { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 },
    workerReports
  );
  
  // Save report
  saveManagerReport(managementDir, report);
  
  return report;
}

// =============================================================================
// REPORT FORMATTING
// =============================================================================

/**
 * Format manager report as markdown for display
 */
export function formatManagerReportAsMarkdown(report: ManagerReport): string {
  const lines: string[] = [];
  
  lines.push(`# 📊 Project Status Report`);
  lines.push('');
  lines.push(`**Generated:** ${new Date(report.timestamp).toLocaleString()}`);
  lines.push(`**Project:** ${report.projectCodename}`);
  lines.push('');
  
  // Progress bar
  const progress = report.stats.total > 0
    ? Math.round((report.stats.completed / report.stats.total) * 100)
    : 0;
  const progressBar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
  lines.push(`## Progress: ${progress}%`);
  lines.push(`\`[${progressBar}]\``);
  lines.push('');
  
  // Stats
  lines.push('## Task Statistics');
  lines.push(`| Status | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| ✅ Completed | ${report.stats.completed} |`);
  lines.push(`| 🔄 Processing | ${report.stats.processing} |`);
  lines.push(`| ⏳ Pending | ${report.stats.pending} |`);
  lines.push(`| ❌ Failed | ${report.stats.failed} |`);
  lines.push(`| **Total** | **${report.stats.total}** |`);
  lines.push('');
  
  // Workers
  lines.push('## Worker Status');
  lines.push(`| Worker | Status | Current Task | Completed |`);
  lines.push(`|--------|--------|--------------|-----------|`);
  
  for (const worker of report.workers) {
    const statusEmoji = worker.status === 'working' ? '🔄' : 
                        worker.status === 'idle' ? '😴' : 
                        worker.status === 'error' ? '❌' : '✅';
    const taskInfo = worker.currentTask 
      ? `#${worker.currentTask.id}: ${worker.currentTask.title.substring(0, 30)}...`
      : '-';
    lines.push(`| ${worker.workerId} | ${statusEmoji} ${worker.status} | ${taskInfo} | ${worker.completedTasks} |`);
  }
  lines.push('');
  
  // Summary
  lines.push('## Summary');
  lines.push(`- **Total Workers:** ${report.summary.totalWorkers}`);
  lines.push(`- **Active:** ${report.summary.activeWorkers}`);
  lines.push(`- **Idle:** ${report.summary.idleWorkers}`);
  lines.push(`- **Errors:** ${report.summary.errorWorkers}`);
  
  return lines.join('\n');
}
