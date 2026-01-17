/**
 * Wizard CSV Parser
 * 
 * CSV parsing utilities for TASKLIST import.
 */

import { CsvParseResult } from './wizard-types';

// =============================================================================
// CSV PARSER
// =============================================================================

/**
 * Parse CSV content into task queue data
 * 
 * @param content - Raw CSV content
 * @param delimiter - Field delimiter (default: ';')
 * @returns Parse result with tasks or errors
 */
export function parseCsvContent(content: string, delimiter: string = ';'): CsvParseResult {
  const errors: string[] = [];
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  
  if (lines.length === 0) {
    return {
      success: false,
      taskCount: 0,
      headers: [],
      delimiter,
      errors: ['CSV content is empty'],
    };
  }
  
  // First line is header
  const headerLine = lines[0];
  const headers = parseRow(headerLine, delimiter);
  
  if (headers.length === 0) {
    return {
      success: false,
      taskCount: 0,
      headers: [],
      delimiter,
      errors: ['No headers found in CSV'],
    };
  }
  
  // Parse data rows
  const preview: string[] = [];
  let taskCount = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseRow(line, delimiter);
    
    // Check column count mismatch
    if (values.length !== headers.length) {
      errors.push(`Row ${i + 1}: Expected ${headers.length} columns, got ${values.length}`);
      if (errors.length >= 10) {
        errors.push(`... and more errors (showing first 10)`);
        break;
      }
      continue;
    }
    
    taskCount++;
    
    // Collect preview (first 5 rows)
    if (preview.length < 5) {
      preview.push(line);
    }
  }
  
  return {
    success: errors.length === 0,
    taskCount,
    headers,
    delimiter,
    errors,
    preview,
  };
}

/**
 * Parse a single CSV row
 */
function parseRow(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === delimiter) {
        // Field separator
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  
  // Don't forget the last field
  result.push(current.trim());
  
  return result;
}

/**
 * Detect CSV delimiter from content
 * 
 * Checks first few lines and picks the most common delimiter
 */
export function detectDelimiter(content: string): string {
  const candidates = [';', ',', '\t', '|'];
  const lines = content.split(/\r?\n/).slice(0, 5).filter(l => l.trim());
  
  if (lines.length === 0) {
    return ';'; // Default
  }
  
  const counts: Record<string, number> = {};
  
  for (const delim of candidates) {
    counts[delim] = 0;
    for (const line of lines) {
      // Count occurrences outside quotes
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delim && !inQuotes) {
          counts[delim]++;
        }
      }
    }
    // Normalize by line count
    counts[delim] = counts[delim] / lines.length;
  }
  
  // Pick delimiter with highest average count (and at least 1)
  let best = ';';
  let bestCount = 0;
  
  for (const delim of candidates) {
    if (counts[delim] > bestCount) {
      best = delim;
      bestCount = counts[delim];
    }
  }
  
  return best;
}

/**
 * Validate CSV headers
 * 
 * Checks for required columns, duplicates, etc.
 */
export function validateHeaders(headers: string[]): string[] {
  const errors: string[] = [];
  
  // Check for empty headers
  for (let i = 0; i < headers.length; i++) {
    if (!headers[i] || headers[i].trim() === '') {
      errors.push(`Column ${i + 1} has empty header`);
    }
  }
  
  // Check for duplicates
  const seen = new Set<string>();
  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    if (seen.has(normalized)) {
      errors.push(`Duplicate header: "${header}"`);
    }
    seen.add(normalized);
  }
  
  return errors;
}

/**
 * Get a human-readable summary of parse result
 */
export function getParseResultSummary(result: CsvParseResult): string {
  if (!result.success) {
    return `❌ Parse failed: ${result.errors.length} error(s)`;
  }
  
  return `✅ Loaded ${result.taskCount} tasks with ${result.headers.length} columns`;
}

/**
 * Format preview as table-like string
 */
export function formatPreviewTable(result: CsvParseResult, maxWidth: number = 60): string {
  if (!result.headers.length || !result.preview?.length) {
    return '(no preview available)';
  }
  
  const rows: string[][] = [result.headers];
  
  for (const line of result.preview) {
    rows.push(parseRow(line, result.delimiter));
  }
  
  // Calculate column widths
  const colWidths: number[] = result.headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      if (row[i] && row[i].length > max) {
        max = row[i].length;
      }
    }
    return Math.min(max, 20); // Cap at 20 chars
  });
  
  // Build output
  const lines: string[] = [];
  
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const cells = row.map((cell, i) => {
      const width = colWidths[i];
      const value = cell.substring(0, width);
      return value.padEnd(width);
    });
    lines.push('| ' + cells.join(' | ') + ' |');
    
    // Add separator after header
    if (r === 0) {
      const sep = colWidths.map(w => '-'.repeat(w)).join('-+-');
      lines.push('+-' + sep + '-+');
    }
  }
  
  if (result.taskCount > result.preview.length) {
    lines.push(`... and ${result.taskCount - result.preview.length} more rows`);
  }
  
  return lines.join('\n');
}
