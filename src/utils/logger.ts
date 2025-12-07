/**
 * ADG-Parallels Logger
 * 
 * Centralized logging with prefixes and levels.
 */

import * as vscode from 'vscode';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private outputChannel: vscode.OutputChannel | null = null;
  private prefix = '[ADG-Parallels]';

  /**
   * Initialize the logger with VS Code output channel
   */
  init(context: vscode.ExtensionContext): void {
    this.outputChannel = vscode.window.createOutputChannel('ADG-Parallels');
    context.subscriptions.push(this.outputChannel);
  }

  /**
   * Format message with timestamp and level
   */
  private format(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    let formatted = `${timestamp} ${levelStr} ${this.prefix} ${message}`;
    
    if (data !== undefined) {
      formatted += ` ${JSON.stringify(data)}`;
    }
    
    return formatted;
  }

  /**
   * Write to output channel and console
   */
  private write(level: LogLevel, message: string, data?: unknown): void {
    const formatted = this.format(level, message, data);
    
    // Always log to console for debugging
    switch (level) {
      case 'debug':
        console.log(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }

    // Write to VS Code output channel if available
    if (this.outputChannel) {
      this.outputChannel.appendLine(formatted);
    }
  }

  debug(message: string, data?: unknown): void {
    this.write('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.write('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.write('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.write('error', message, data);
  }

  /**
   * Show output channel to user
   */
  show(): void {
    this.outputChannel?.show();
  }
}

// Singleton instance
export const logger = new Logger();
