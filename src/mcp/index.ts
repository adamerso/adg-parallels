/**
 * ADG-Parallels MCP Server & Chat Participant
 * 
 * Model Context Protocol server exposing ADG-Parallels functionality
 * to AI assistants like GitHub Copilot.
 * 
 * Tools provided:
 * - adg_status: Get current project status and worker states
 * - adg_list_tasks: List all tasks with status
 * - adg_claim_task: Claim next available task for processing
 * - adg_complete_task: Mark a task as completed
 * - adg_fail_task: Mark a task as failed
 * - adg_worker_heartbeat: Send heartbeat for a worker
 * - adg_get_dashboard: Get dashboard statistics
 * - adg_list_workers: List all workers with hierarchy
 * - adg_get_events: Get recent events from audit log
 * - adg_start_project: Initialize a new project
 * 
 * Chat Participant:
 * - @adg: Chat with AI about ADG project state using natural language
 */

export * from './mcp-server';
export * from './mcp-tools';
export * from './chat-participant';
