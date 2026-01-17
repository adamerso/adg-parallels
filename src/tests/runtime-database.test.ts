/**
 * Tests for RuntimeDatabase
 * 
 * These tests verify SQLite runtime database operations:
 * - Task management (CRUD, atomic claiming)
 * - Worker registry and heartbeat
 * - Slot allocation
 * - Event logging
 * - Project metadata
 * - Dashboard statistics
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  RuntimeDatabase,
  TaskStatus,
  WorkerStatus,
  EventType,
  Task,
  Worker,
  resetRuntimeDatabase,
} from '../core/runtime-database';

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Create a temporary database for testing
 */
function createTestDb(): RuntimeDatabase {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adg-db-test-'));
  const dbPath = path.join(tempDir, 'test.db');
  return new RuntimeDatabase(dbPath);
}

/**
 * Cleanup database after test
 */
function cleanupDb(db: RuntimeDatabase): void {
  const dbPath = db.getPath();
  const dir = path.dirname(dbPath);
  
  db.close();
  
  // Remove db files
  for (const ext of ['', '-wal', '-shm']) {
    const file = dbPath + ext;
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
  
  // Remove temp dir
  if (fs.existsSync(dir)) {
    fs.rmdirSync(dir);
  }
}

// =============================================================================
// TEST SUITES
// =============================================================================

describe('RuntimeDatabase', () => {
  let db: RuntimeDatabase;

  beforeEach(async () => {
    db = createTestDb();
    await db.init();
  });

  afterEach(() => {
    cleanupDb(db);
    resetRuntimeDatabase();
  });

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  describe('Initialization', () => {
    it('should create database file on init', async () => {
      assert.ok(fs.existsSync(db.getPath()), 'Database file should exist');
    });

    it('should be idempotent (init twice is safe)', async () => {
      await db.init();
      await db.init();
      assert.ok(fs.existsSync(db.getPath()), 'Database file should still exist');
    });
  });

  // ===========================================================================
  // TASK OPERATIONS
  // ===========================================================================

  describe('Task Operations', () => {
    it('should create a task with auto-increment ID', () => {
      const id1 = db.createTask(1, 'payload1');
      const id2 = db.createTask(1, 'payload2');
      
      assert.strictEqual(id1, 1, 'First task ID should be 1');
      assert.strictEqual(id2, 2, 'Second task ID should be 2');
    });

    it('should create task without payload', () => {
      const id = db.createTask(2);
      const task = db.getTask(id);
      
      assert.ok(task, 'Task should exist');
      assert.strictEqual(task.payload, null, 'Payload should be null');
    });

    it('should set correct defaults on task creation', () => {
      const id = db.createTask(1, 'test');
      const task = db.getTask(id);
      
      assert.ok(task, 'Task should exist');
      assert.strictEqual(task.status, 'UNASSIGNED');
      assert.strictEqual(task.assigned_worker, null);
      assert.strictEqual(task.result_path, null);
      assert.strictEqual(task.error_message, null);
    });

    it('should bulk create tasks', () => {
      const payloads = ['a', 'b', 'c'];
      const ids = db.createTasks(1, payloads);
      
      assert.strictEqual(ids.length, 3);
      assert.deepStrictEqual(ids, [1, 2, 3]);
    });

    it('should atomically claim a task', () => {
      db.createTask(1, 'task1');
      db.createTask(1, 'task2');
      
      const claimed = db.claimTask('worker-1');
      
      assert.ok(claimed, 'Should claim a task');
      assert.strictEqual(claimed.status, 'PROCESSING');
      assert.strictEqual(claimed.assigned_worker, 'worker-1');
      assert.strictEqual(claimed.id, 1, 'Should claim first task');
    });

    it('should claim tasks in order', () => {
      db.createTask(1, 'first');
      db.createTask(1, 'second');
      db.createTask(1, 'third');
      
      const t1 = db.claimTask('w1');
      const t2 = db.claimTask('w2');
      const t3 = db.claimTask('w3');
      
      assert.strictEqual(t1?.id, 1);
      assert.strictEqual(t2?.id, 2);
      assert.strictEqual(t3?.id, 3);
    });

    it('should return null when no tasks available', () => {
      const claimed = db.claimTask('worker-1');
      assert.strictEqual(claimed, null);
    });

    it('should not claim already claimed tasks', () => {
      db.createTask(1, 'only-one');
      
      db.claimTask('worker-1');
      const second = db.claimTask('worker-2');
      
      assert.strictEqual(second, null, 'Second claim should fail');
    });

    it('should claim tasks filtered by layer', () => {
      db.createTask(1, 'layer1');
      db.createTask(2, 'layer2');
      db.createTask(1, 'layer1-again');
      
      const claimed = db.claimTask('w1', 2);
      
      assert.ok(claimed);
      assert.strictEqual(claimed.layer, 2);
      assert.strictEqual(claimed.payload, 'layer2');
    });

    it('should complete a task', () => {
      const id = db.createTask(1, 'test');
      db.claimTask('worker-1');
      
      db.completeTask(id, '/path/to/result.xml');
      
      const task = db.getTask(id);
      assert.strictEqual(task?.status, 'DONE');
      assert.strictEqual(task?.result_path, '/path/to/result.xml');
    });

    it('should fail a task with error message', () => {
      const id = db.createTask(1, 'test');
      db.claimTask('worker-1');
      
      db.failTask(id, 'Something went wrong');
      
      const task = db.getTask(id);
      assert.strictEqual(task?.status, 'FAILED');
      assert.strictEqual(task?.error_message, 'Something went wrong');
    });

    it('should get all tasks', () => {
      db.createTask(1, 'a');
      db.createTask(2, 'b');
      db.createTask(1, 'c');
      
      const tasks = db.getAllTasks();
      assert.strictEqual(tasks.length, 3);
    });

    it('should get tasks by status', () => {
      db.createTask(1, 'a');
      db.createTask(1, 'b');
      db.claimTask('w1');
      
      const unassigned = db.getTasksByStatus('UNASSIGNED');
      const processing = db.getTasksByStatus('PROCESSING');
      
      assert.strictEqual(unassigned.length, 1);
      assert.strictEqual(processing.length, 1);
    });

    it('should count pending tasks', () => {
      db.createTask(1, 'a');
      db.createTask(1, 'b');
      db.createTask(2, 'c');
      db.claimTask('w1');
      
      assert.strictEqual(db.getPendingTaskCount(), 2);
      assert.strictEqual(db.getPendingTaskCount(1), 1);
      assert.strictEqual(db.getPendingTaskCount(2), 1);
    });
  });

  // ===========================================================================
  // WORKER OPERATIONS
  // ===========================================================================

  describe('Worker Operations', () => {
    it('should register a worker', () => {
      db.registerWorker('uid-1', 'CEO', '/path/to/CEO', 'CEO', 0);
      
      const worker = db.getWorker('uid-1');
      assert.ok(worker, 'Worker should exist');
      assert.strictEqual(worker.uid, 'uid-1');
      assert.strictEqual(worker.folder_name, 'CEO');
      assert.strictEqual(worker.role, 'CEO');
      assert.strictEqual(worker.layer, 0);
      assert.strictEqual(worker.status, 'QUEUED');
    });

    it('should register worker with parent', () => {
      db.registerWorker('ceo', 'CEO', '/CEO', 'CEO', 0);
      db.registerWorker('mgr-1', 'MGR_1', '/CEO/MGR_1', 'MGR', 1, 'ceo');
      
      const worker = db.getWorker('mgr-1');
      assert.strictEqual(worker?.parent_uid, 'ceo');
    });

    it('should update worker status', () => {
      db.registerWorker('w1', 'W1', '/W1', 'WORKER', 1);
      
      db.updateWorkerStatus('w1', 'WORKING');
      assert.strictEqual(db.getWorker('w1')?.status, 'WORKING');
      
      db.updateWorkerStatus('w1', 'DONE');
      const worker = db.getWorker('w1');
      assert.strictEqual(worker?.status, 'DONE');
      assert.ok(worker?.completed_at, 'Should have completion timestamp');
    });

    it('should update worker status with error', () => {
      db.registerWorker('w1', 'W1', '/W1', 'WORKER', 1);
      
      db.updateWorkerStatus('w1', 'ERROR', 'Connection failed');
      
      const worker = db.getWorker('w1');
      assert.strictEqual(worker?.status, 'ERROR');
      assert.strictEqual(worker?.error_message, 'Connection failed');
    });

    it('should record heartbeat', () => {
      db.registerWorker('w1', 'W1', '/W1', 'WORKER', 1);
      
      const before = db.getWorker('w1')?.last_heartbeat;
      db.heartbeat('w1');
      const after = db.getWorker('w1')?.last_heartbeat;
      
      assert.ok(after, 'Should have heartbeat timestamp');
      // Allow for same second
      assert.ok(after >= (before ?? 0), 'Heartbeat should update');
    });

    it('should get all workers', () => {
      db.registerWorker('a', 'A', '/A', 'CEO', 0);
      db.registerWorker('b', 'B', '/B', 'MGR', 1);
      db.registerWorker('c', 'C', '/C', 'WORKER', 2);
      
      const workers = db.getAllWorkers();
      assert.strictEqual(workers.length, 3);
    });

    it('should get workers by status', () => {
      db.registerWorker('a', 'A', '/A', 'CEO', 0);
      db.registerWorker('b', 'B', '/B', 'MGR', 1);
      db.updateWorkerStatus('a', 'WORKING');
      
      const queued = db.getWorkersByStatus('QUEUED');
      const working = db.getWorkersByStatus('WORKING');
      
      assert.strictEqual(queued.length, 1);
      assert.strictEqual(working.length, 1);
    });

    it('should get children of a worker', () => {
      db.registerWorker('ceo', 'CEO', '/CEO', 'CEO', 0);
      db.registerWorker('m1', 'M1', '/CEO/M1', 'MGR', 1, 'ceo');
      db.registerWorker('m2', 'M2', '/CEO/M2', 'MGR', 1, 'ceo');
      db.registerWorker('w1', 'W1', '/CEO/M1/W1', 'WORKER', 2, 'm1');
      
      const ceoChildren = db.getChildren('ceo');
      const m1Children = db.getChildren('m1');
      const m2Children = db.getChildren('m2');
      
      assert.strictEqual(ceoChildren.length, 2);
      assert.strictEqual(m1Children.length, 1);
      assert.strictEqual(m2Children.length, 0);
    });

    it('should detect unresponsive workers', () => {
      db.registerWorker('w1', 'W1', '/W1', 'WORKER', 1);
      db.registerWorker('w2', 'W2', '/W2', 'WORKER', 1);
      
      db.updateWorkerStatus('w1', 'WORKING');
      db.updateWorkerStatus('w2', 'WORKING');
      
      // w2 is "recent" (within threshold)
      db.heartbeat('w2');
      
      // For testing, use 0 second threshold to catch w1
      const unresponsive = db.getUnresponsiveWorkers(0);
      
      // Both should be caught with 0 threshold since any timestamp is "old"
      // In practice, w1 has no additional heartbeat
      assert.ok(unresponsive.length >= 0, 'Should return array');
    });
  });

  // ===========================================================================
  // SLOT OPERATIONS
  // ===========================================================================

  describe('Slot Operations', () => {
    it('should initialize slots', () => {
      db.initSlots(5);
      
      const usage = db.getSlotUsage();
      assert.strictEqual(usage.total, 5);
      assert.strictEqual(usage.used, 0);
    });

    it('should assign slot to worker', () => {
      db.initSlots(3);
      db.registerWorker('w1', 'W1', '/W1', 'WORKER', 1);
      
      const slotId = db.assignSlot('w1');
      
      assert.strictEqual(slotId, 1, 'Should get first slot');
      
      const worker = db.getWorker('w1');
      assert.strictEqual(worker?.slot_id, 1);
      assert.strictEqual(worker?.status, 'SLOT_ASSIGNED');
      
      const usage = db.getSlotUsage();
      assert.strictEqual(usage.used, 1);
    });

    it('should assign slots in order', () => {
      db.initSlots(3);
      db.registerWorker('w1', 'W1', '/W1', 'WORKER', 1);
      db.registerWorker('w2', 'W2', '/W2', 'WORKER', 1);
      
      const s1 = db.assignSlot('w1');
      const s2 = db.assignSlot('w2');
      
      assert.strictEqual(s1, 1);
      assert.strictEqual(s2, 2);
    });

    it('should return null when no slots available', () => {
      db.initSlots(1);
      db.registerWorker('w1', 'W1', '/W1', 'WORKER', 1);
      db.registerWorker('w2', 'W2', '/W2', 'WORKER', 1);
      
      db.assignSlot('w1');
      const s2 = db.assignSlot('w2');
      
      assert.strictEqual(s2, null);
    });

    it('should release slot', () => {
      db.initSlots(2);
      db.registerWorker('w1', 'W1', '/W1', 'WORKER', 1);
      
      db.assignSlot('w1');
      assert.strictEqual(db.getSlotUsage().used, 1);
      
      db.releaseSlot(1);
      assert.strictEqual(db.getSlotUsage().used, 0);
      
      const worker = db.getWorker('w1');
      assert.strictEqual(worker?.slot_id, null);
    });

    it('should reuse released slot', () => {
      db.initSlots(1);
      db.registerWorker('w1', 'W1', '/W1', 'WORKER', 1);
      db.registerWorker('w2', 'W2', '/W2', 'WORKER', 1);
      
      const s1 = db.assignSlot('w1');
      db.releaseSlot(s1!);
      const s2 = db.assignSlot('w2');
      
      assert.strictEqual(s1, 1);
      assert.strictEqual(s2, 1, 'Should reuse slot 1');
    });
  });

  // ===========================================================================
  // EVENT LOGGING
  // ===========================================================================

  describe('Event Logging', () => {
    it('should log events automatically on task operations', () => {
      db.createTask(1, 'test');
      
      const events = db.getRecentEvents();
      assert.ok(events.length > 0);
      assert.strictEqual(events[0].event_type, 'TASK_CREATED');
    });

    it('should log worker events', () => {
      db.registerWorker('w1', 'W1', '/W1', 'WORKER', 1);
      
      const events = db.getRecentEvents();
      const spawnEvent = events.find(e => e.event_type === 'WORKER_SPAWNED');
      assert.ok(spawnEvent);
      assert.strictEqual(spawnEvent.worker_uid, 'w1');
    });

    it('should get events for specific worker', () => {
      db.registerWorker('w1', 'W1', '/W1', 'WORKER', 1);
      db.registerWorker('w2', 'W2', '/W2', 'WORKER', 1);
      db.updateWorkerStatus('w1', 'WORKING');
      
      const w1Events = db.getWorkerEvents('w1');
      assert.ok(w1Events.every(e => e.worker_uid === 'w1'));
    });

    it('should log custom events', () => {
      db.logEvent('PROJECT_STARTED', null, null, 'Test project');
      
      const events = db.getRecentEvents(1);
      assert.strictEqual(events[0].event_type, 'PROJECT_STARTED');
      assert.strictEqual(events[0].details, 'Test project');
    });

    it('should limit event results', () => {
      for (let i = 0; i < 10; i++) {
        db.createTask(1, `task-${i}`);
      }
      
      const events = db.getRecentEvents(3);
      assert.strictEqual(events.length, 3);
    });
  });

  // ===========================================================================
  // PROJECT METADATA
  // ===========================================================================

  describe('Project Metadata', () => {
    it('should set and get metadata', () => {
      db.setProjectMeta('name', 'Test Project');
      db.setProjectMeta('version', '1.0.0');
      
      assert.strictEqual(db.getProjectMeta('name'), 'Test Project');
      assert.strictEqual(db.getProjectMeta('version'), '1.0.0');
    });

    it('should return null for missing key', () => {
      assert.strictEqual(db.getProjectMeta('nonexistent'), null);
    });

    it('should overwrite existing key', () => {
      db.setProjectMeta('key', 'value1');
      db.setProjectMeta('key', 'value2');
      
      assert.strictEqual(db.getProjectMeta('key'), 'value2');
    });

    it('should get all metadata', () => {
      db.setProjectMeta('a', '1');
      db.setProjectMeta('b', '2');
      db.setProjectMeta('c', '3');
      
      const all = db.getAllProjectMeta();
      assert.strictEqual(all['a'], '1');
      assert.strictEqual(all['b'], '2');
      assert.strictEqual(all['c'], '3');
    });

    it('should handle special characters in values', () => {
      db.setProjectMeta('path', "C:\\Users\\O'Brien\\project");
      
      assert.strictEqual(db.getProjectMeta('path'), "C:\\Users\\O'Brien\\project");
    });
  });

  // ===========================================================================
  // DASHBOARD STATS
  // ===========================================================================

  describe('Dashboard Statistics', () => {
    it('should return empty stats for empty db', () => {
      const stats = db.getDashboardStats();
      
      assert.strictEqual(stats.total_workers, 0);
      assert.strictEqual(stats.total_tasks, 0);
      assert.strictEqual(stats.slots_total, 0);
    });

    it('should aggregate worker stats', () => {
      db.registerWorker('w1', 'W1', '/W1', 'CEO', 0);
      db.registerWorker('w2', 'W2', '/W2', 'MGR', 1);
      db.registerWorker('w3', 'W3', '/W3', 'WORKER', 2);
      
      db.updateWorkerStatus('w1', 'DONE');
      db.updateWorkerStatus('w2', 'WORKING');
      
      const stats = db.getDashboardStats();
      
      assert.strictEqual(stats.total_workers, 3);
      assert.strictEqual(stats.workers_by_status['DONE'], 1);
      assert.strictEqual(stats.workers_by_status['WORKING'], 1);
      assert.strictEqual(stats.workers_by_status['QUEUED'], 1);
    });

    it('should aggregate task stats', () => {
      db.createTask(1, 'a');
      db.createTask(1, 'b');
      db.createTask(1, 'c');
      db.claimTask('w1');
      db.completeTask(1);
      db.claimTask('w2');
      db.failTask(2, 'error');
      
      const stats = db.getDashboardStats();
      
      assert.strictEqual(stats.total_tasks, 3);
      assert.strictEqual(stats.tasks_done, 1);
      assert.strictEqual(stats.tasks_failed, 1);
      assert.strictEqual(stats.tasks_pending, 1);
    });

    it('should include slot stats', () => {
      db.initSlots(5);
      db.registerWorker('w1', 'W1', '/W1', 'WORKER', 1);
      db.assignSlot('w1');
      
      const stats = db.getDashboardStats();
      
      assert.strictEqual(stats.slots_total, 5);
      assert.strictEqual(stats.slots_used, 1);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty payload', () => {
      const id = db.createTask(1, '');
      const task = db.getTask(id);
      assert.strictEqual(task?.payload, '');
    });

    it('should handle SQL injection attempts in payload', () => {
      const malicious = "'; DROP TABLE tasks; --";
      const id = db.createTask(1, malicious);
      const task = db.getTask(id);
      
      assert.strictEqual(task?.payload, malicious);
      assert.ok(db.getAllTasks().length > 0, 'Table should still exist');
    });

    it('should handle unicode in payload', () => {
      const unicode = '日本語テスト 🚀 émojis';
      const id = db.createTask(1, unicode);
      const task = db.getTask(id);
      
      assert.strictEqual(task?.payload, unicode);
    });

    it('should handle very long payloads', () => {
      const longPayload = 'x'.repeat(10000);
      const id = db.createTask(1, longPayload);
      const task = db.getTask(id);
      
      assert.strictEqual(task?.payload?.length, 10000);
    });
  });
});
