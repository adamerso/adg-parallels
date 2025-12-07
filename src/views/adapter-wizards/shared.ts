/**
 * Shared utilities for adapter wizards
 * 
 * This file contains shared functions used across all wizard panels.
 * Separated to avoid circular dependencies.
 */

import * as vscode from 'vscode';

/**
 * Generate a nonce for CSP
 */
export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Base CSS styles shared by all wizards
 */
export function getBaseStyles(): string {
  return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 0;
      margin: 0;
      min-height: 100vh;
    }
    
    .wizard-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    /* Header */
    .wizard-header {
      text-align: center;
      margin-bottom: 32px;
    }
    
    .logo {
      font-size: 56px;
      margin-bottom: 12px;
      animation: bounce 2s ease-in-out infinite;
    }
    
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }
    
    .wizard-header h1 {
      font-size: 26px;
      font-weight: 600;
      color: var(--vscode-textLink-foreground);
      margin-bottom: 6px;
    }
    
    .subtitle {
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }
    
    /* Progress */
    .progress-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      margin-bottom: 32px;
      padding: 0 20px;
      flex-wrap: wrap;
    }
    
    .progress-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      transition: all 0.3s ease;
      min-width: 60px;
    }
    
    .progress-step:hover { transform: scale(1.05); }
    
    .step-number {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: all 0.3s ease;
      border: 2px solid transparent;
    }
    
    .progress-step.active .step-number {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-focusBorder);
      transform: scale(1.1);
      box-shadow: 0 0 15px rgba(0, 120, 212, 0.4);
    }
    
    .progress-step.completed .step-number {
      background: #238636;
      color: white;
    }
    
    .step-label {
      margin-top: 6px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      max-width: 70px;
    }
    
    .progress-step.active .step-label {
      color: var(--vscode-foreground);
      font-weight: 600;
    }
    
    /* Content */
    .wizard-content {
      flex: 1;
      background: var(--vscode-sideBar-background);
      border-radius: 10px;
      padding: 28px;
      margin-bottom: 20px;
      border: 1px solid var(--vscode-panel-border);
    }
    
    .step-content h2 {
      font-size: 22px;
      margin-bottom: 8px;
    }
    
    .step-content p {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 24px;
      font-size: 13px;
    }
    
    /* Form Elements */
    .form-group {
      margin-bottom: 20px;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      font-size: 13px;
    }
    
    .form-input {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 5px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-size: 13px;
      transition: all 0.2s ease;
    }
    
    .form-input:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.15);
    }
    
    /* Buttons */
    .wizard-footer {
      display: flex;
      gap: 10px;
      justify-content: space-between;
    }
    
    .wizard-footer > div {
      display: flex;
      gap: 10px;
    }
    
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      min-width: 100px;
    }
    
    .btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
    }
    
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
  `;
}
