/**
 * ProjectSpec Loader v1.0
 * 
 * Loads and parses ProjectSpec XML files created by the new wizard.
 * This is the NEW system - replaces old adapter-based approach.
 */

import * as fs from 'fs';
import * as path from 'path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { logger } from '../utils/logger';

// =============================================================================
// PROJECTSPEC TYPES
// =============================================================================

/**
 * Layer type in the project hierarchy
 */
export type LayerType = 'manager' | 'teamleader' | 'worker';

/**
 * Resource reference within a layer
 */
export interface LayerResource {
  path: string;
  use: boolean;
  readonly: boolean;
}

/**
 * Input file definition
 */
export interface InputFile {
  path: string;
  copyToLayers: string;
}

/**
 * Layer configuration from ProjectSpec
 */
export interface ProjectLayer {
  number: number;
  type: LayerType;
  workforceSize: number;
  taskDescription: string;
  reporting?: string;
  resources: LayerResource[];
  // Continuation / "poganiacz" settings
  continuationPrompt: string;
  maxContinuationAttempts: number;
}

/**
 * Health monitoring settings
 */
export interface HealthMonitoringSettings {
  enabled: boolean;
  intervalSeconds: number;
}

/**
 * Project settings
 */
export interface ProjectSettings {
  healthMonitoring: HealthMonitoringSettings;
  maxRetries: number;
}

/**
 * Complete ProjectSpec structure
 */
export interface ProjectSpec {
  version: string;
  name: string;
  createdAt: string;
  workforceLayers: number;
  resources: {
    description: string;
    files: InputFile[];
    outputDirectory: string;
  };
  layers: ProjectLayer[];
  settings: ProjectSettings;
}

/**
 * ProjectSpec validation result
 */
export interface ProjectSpecValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// PARSER CONFIGURATION
// =============================================================================

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  cdataPropName: '__cdata',
  isArray: (name: string) => {
    return ['file', 'layer', 'resource'].includes(name);
  }
};

const parser = new XMLParser(parserOptions);

// =============================================================================
// CORE LOADING FUNCTIONS
// =============================================================================

/**
 * Load ProjectSpec from XML file
 * @param filePath Absolute path to project-spec.xml
 * @returns Parsed ProjectSpec or null on error
 */
export function loadProjectSpec(filePath: string): ProjectSpec | null {
  try {
    if (!fs.existsSync(filePath)) {
      logger.error(`ProjectSpec file not found: ${filePath}`);
      return null;
    }

    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    return parseProjectSpecXml(xmlContent, filePath);
  } catch (error) {
    logger.error(`Failed to load ProjectSpec: ${filePath}`, error);
    return null;
  }
}

/**
 * Parse ProjectSpec from XML string
 * @param xmlContent Raw XML string
 * @param sourcePath Optional source path for error messages
 * @returns Parsed ProjectSpec or null on error
 */
export function parseProjectSpecXml(xmlContent: string, sourcePath?: string): ProjectSpec | null {
  try {
    // Validate XML syntax
    const validationResult = XMLValidator.validate(xmlContent, {
      allowBooleanAttributes: true
    });

    if (validationResult !== true) {
      logger.error(`Invalid XML syntax${sourcePath ? ` in ${sourcePath}` : ''}:`, validationResult);
      return null;
    }

    // Parse XML
    const parsed = parser.parse(xmlContent);
    
    if (!parsed.project) {
      logger.error('Missing <project> root element');
      return null;
    }

    const project = parsed.project;

    // Extract data with proper handling
    const spec: ProjectSpec = {
      version: getAttr(project, 'version') || '1.0',
      name: getText(project.name),
      createdAt: getText(project.created_at) || new Date().toISOString(),
      workforceLayers: parseInt(getText(project.workforce_layers)) || 1,
      resources: parseResources(project.resources),
      layers: parseLayers(project.layers),
      settings: parseSettings(project.settings)
    };

    // Validate parsed spec
    const validation = validateProjectSpec(spec);
    if (!validation.valid) {
      logger.error('ProjectSpec validation failed:', validation.errors);
      return null;
    }

    if (validation.warnings.length > 0) {
      logger.warn('ProjectSpec warnings:', validation.warnings);
    }

    logger.info(`Loaded ProjectSpec: ${spec.name}`, {
      layers: spec.layers.length,
      version: spec.version
    });

    return spec;
  } catch (error) {
    logger.error('Failed to parse ProjectSpec XML:', error);
    return null;
  }
}

// =============================================================================
// PARSING HELPERS
// =============================================================================

/**
 * Parse resources section
 */
function parseResources(resources: unknown): ProjectSpec['resources'] {
  if (!resources || typeof resources !== 'object') {
    return {
      description: '',
      files: [],
      outputDirectory: './output'
    };
  }

  const res = resources as Record<string, unknown>;

  return {
    description: getCdataOrText(res.description),
    files: parseInputFiles(res.files),
    outputDirectory: getText(res.output_directory) || './output'
  };
}

/**
 * Parse input files
 */
function parseInputFiles(files: unknown): InputFile[] {
  if (!files || typeof files !== 'object') {
    return [];
  }

  const filesObj = files as Record<string, unknown>;
  const fileArray = ensureArray(filesObj.file);

  return fileArray.map((f: unknown) => {
    if (typeof f !== 'object' || f === null) {
      return { path: '', copyToLayers: '' };
    }
    const file = f as Record<string, unknown>;
    return {
      path: getAttr(file, 'path') || getText(file.path) || '',
      copyToLayers: getText(file.copy_to_layers) || ''
    };
  }).filter(f => f.path);
}

/**
 * Parse layers section
 */
function parseLayers(layers: unknown): ProjectLayer[] {
  if (!layers || typeof layers !== 'object') {
    return [];
  }

  const layersObj = layers as Record<string, unknown>;
  const layerArray = ensureArray(layersObj.layer);

  return layerArray.map((l: unknown, index: number) => {
    if (typeof l !== 'object' || l === null) {
      return createDefaultLayer(index + 1);
    }
    const layer = l as Record<string, unknown>;
    
    const layerType = getText(layer.type) as LayerType;
    
    // Parse continuation / poganiacz settings
    const continuation = layer.continuation as Record<string, unknown> | undefined;
    const continuationPrompt = continuation 
      ? getCdataOrText(continuation.prompt) 
      : 'Kontynuuj realizację zadania. Sprawdź poprzednie kroki i dokończ pracę.';
    const maxContinuationAttempts = continuation 
      ? (parseInt(getText(continuation.max_attempts)) || 10)
      : 10;

    return {
      number: parseInt(getAttr(layer, 'number') || String(index + 1)),
      type: isValidLayerType(layerType) ? layerType : 'worker',
      workforceSize: parseInt(getText(layer.workforce_size)) || 0,
      taskDescription: getCdataOrText(layer.task_description),
      reporting: getCdataOrText(layer.reporting),
      resources: parseLayerResources(layer.layer_resources),
      continuationPrompt,
      maxContinuationAttempts
    };
  });
}

/**
 * Parse layer resources
 */
function parseLayerResources(layerResources: unknown): LayerResource[] {
  if (!layerResources || typeof layerResources !== 'object') {
    return [];
  }

  const resObj = layerResources as Record<string, unknown>;
  const resourceArray = ensureArray(resObj.resource);

  return resourceArray.map((r: unknown) => {
    if (typeof r !== 'object' || r === null) {
      return { path: '', use: false, readonly: true };
    }
    const res = r as Record<string, unknown>;
    return {
      path: getAttr(res, 'path'),
      use: getAttrBool(res, 'use'),
      readonly: getAttrBool(res, 'readonly')
    };
  }).filter(r => r.path);
}

/**
 * Parse settings section
 */
function parseSettings(settings: unknown): ProjectSettings {
  const defaults: ProjectSettings = {
    healthMonitoring: {
      enabled: true,
      intervalSeconds: 60
    },
    maxRetries: 3
  };

  if (!settings || typeof settings !== 'object') {
    return defaults;
  }

  const settingsObj = settings as Record<string, unknown>;
  const healthMon = settingsObj.health_monitoring as Record<string, unknown> | undefined;

  return {
    healthMonitoring: {
      enabled: healthMon ? getAttrBool(healthMon, 'enabled') : true,
      intervalSeconds: healthMon ? (parseInt(getAttr(healthMon, 'interval_seconds')) || 60) : 60
    },
    maxRetries: parseInt(getText(settingsObj.max_retries)) || 3
  };
}

/**
 * Create default layer
 */
function createDefaultLayer(number: number): ProjectLayer {
  return {
    number,
    type: 'worker',
    workforceSize: 0,
    taskDescription: '',
    resources: [],
    continuationPrompt: 'Kontynuuj realizację zadania. Sprawdź poprzednie kroki i dokończ pracę.',
    maxContinuationAttempts: 10
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate a ProjectSpec object
 */
export function validateProjectSpec(spec: ProjectSpec): ProjectSpecValidation {
  const result: ProjectSpecValidation = {
    valid: true,
    errors: [],
    warnings: []
  };

  // Required fields
  if (!spec.name || spec.name.trim() === '') {
    result.errors.push('Project name is required');
    result.valid = false;
  }

  if (!/^[a-zA-Z0-9-_]+$/.test(spec.name)) {
    result.errors.push('Project name must contain only letters, numbers, hyphens, and underscores');
    result.valid = false;
  }

  // Layers validation
  if (spec.layers.length === 0) {
    result.errors.push('At least one layer is required');
    result.valid = false;
  }

  // Validate each layer
  spec.layers.forEach((layer, index) => {
    if (!layer.taskDescription || layer.taskDescription.trim() === '') {
      result.warnings.push(`Layer ${layer.number} has no task description`);
    }

    if ((layer.type === 'manager' || layer.type === 'teamleader') && layer.workforceSize === 0) {
      result.warnings.push(`Layer ${layer.number} is ${layer.type} but has no workforce`);
    }

    if (layer.type === 'worker' && layer.workforceSize > 0) {
      result.warnings.push(`Layer ${layer.number} is worker but has workforce size ${layer.workforceSize}`);
    }
  });

  // Last layer should be worker
  const lastLayer = spec.layers[spec.layers.length - 1];
  if (lastLayer && lastLayer.type !== 'worker') {
    result.warnings.push('Last layer should typically be worker type');
  }

  return result;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if string is valid layer type
 */
function isValidLayerType(type: string): type is LayerType {
  return ['manager', 'teamleader', 'worker'].includes(type);
}

/**
 * Get attribute value from parsed element (returns string)
 */
function getAttr(element: Record<string, unknown>, attrName: string): string {
  const val = element[`@_${attrName}`];
  if (val === undefined || val === null) return '';
  return String(val);
}

/**
 * Get boolean attribute value
 */
function getAttrBool(element: Record<string, unknown>, attrName: string): boolean {
  const val = element[`@_${attrName}`];
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  return val === 'true' || val === '1';
}

/**
 * Get text content from element
 */
function getText(element: unknown): string {
  if (element === undefined || element === null) return '';
  if (typeof element === 'string') return element;
  if (typeof element === 'number') return String(element);
  if (typeof element === 'object' && '#text' in element) {
    return String((element as Record<string, unknown>)['#text']);
  }
  return '';
}

/**
 * Get CDATA or text content
 */
function getCdataOrText(element: unknown): string {
  if (element === undefined || element === null) return '';
  if (typeof element === 'string') return element;
  if (typeof element === 'number') return String(element);
  if (typeof element === 'object') {
    const obj = element as Record<string, unknown>;
    if ('__cdata' in obj) return String(obj['__cdata']);
    if ('#text' in obj) return String(obj['#text']);
  }
  return '';
}

/**
 * Ensure value is array
 */
function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// =============================================================================
// PROJECT DISCOVERY
// =============================================================================

/**
 * Find project-spec.xml in a directory
 * @param projectRoot Root directory of the project
 * @returns Path to project-spec.xml or null if not found
 */
export function findProjectSpec(projectRoot: string): string | null {
  // Check for project-spec.xml in root
  const specPath = path.join(projectRoot, 'project-spec.xml');
  if (fs.existsSync(specPath)) {
    return specPath;
  }

  // Check for .adg folder with project-spec.xml
  const adgSpecPath = path.join(projectRoot, '.adg', 'project-spec.xml');
  if (fs.existsSync(adgSpecPath)) {
    return adgSpecPath;
  }

  // Check for any project-*.xml
  const files = fs.readdirSync(projectRoot);
  for (const file of files) {
    if (file.startsWith('project-') && file.endsWith('.xml')) {
      return path.join(projectRoot, file);
    }
  }

  return null;
}

/**
 * Get total worker count from all layers
 */
export function getTotalWorkerCount(spec: ProjectSpec): number {
  return spec.layers.reduce((total, layer) => {
    // Workers work themselves (count as 1)
    // Managers/Teamleaders spawn workforce
    if (layer.type === 'worker') {
      return total + 1;
    }
    return total + layer.workforceSize;
  }, 0);
}

/**
 * Get layers that need to spawn workers
 */
export function getSpawningLayers(spec: ProjectSpec): ProjectLayer[] {
  return spec.layers.filter(l => 
    (l.type === 'manager' || l.type === 'teamleader') && l.workforceSize > 0
  );
}

/**
 * Get worker layers (that do actual work)
 */
export function getWorkerLayers(spec: ProjectSpec): ProjectLayer[] {
  return spec.layers.filter(l => l.type === 'worker');
}

// =============================================================================
// PROMPT GENERATION
// =============================================================================

/**
 * Generate a prompt for a specific layer
 * @param spec The full project specification
 * @param layerNumber Layer number (1-based)
 * @returns Generated prompt string
 */
export function generateLayerPrompt(spec: ProjectSpec, layerNumber: number): string {
  const layer = spec.layers.find(l => l.number === layerNumber);
  if (!layer) {
    return `# Error\nLayer ${layerNumber} not found in project specification.`;
  }

  const layerMap = spec.layers
    .map(l => `  ${l.number}. ${l.type.toUpperCase()}: ${l.taskDescription.substring(0, 50)}...`)
    .join('\n');

  const resourcesList = layer.resources
    .filter(r => r.use)
    .map(r => `  - ${r.path}${r.readonly ? ' (read-only)' : ''}`)
    .join('\n');

  const roleDescription = getRoleDescription(layer);

  return `# ${spec.name} - Layer ${layer.number}

## Project Overview
${spec.resources.description || 'No description provided.'}

## Your Role
${roleDescription}

## Layer Map
${layerMap}

## Your Task
${layer.taskDescription}

${layer.resources.filter(r => r.use).length > 0 ? `## Available Resources\n${resourcesList}` : ''}

${layer.reporting ? `## Reporting Instructions\n${layer.reporting}` : ''}

## Output Directory
${spec.resources.outputDirectory}

---
*Project created: ${spec.createdAt}*
`;
}

/**
 * Get role description based on layer type
 */
function getRoleDescription(layer: ProjectLayer): string {
  switch (layer.type) {
    case 'manager':
      return layer.workforceSize > 0
        ? `You are a Manager overseeing ${layer.workforceSize} AI agents. Your job is to coordinate and delegate tasks.`
        : 'You are a Manager. Your job is to coordinate and delegate tasks.';
    case 'teamleader':
      return layer.workforceSize > 0
        ? `You are a Team Leader managing ${layer.workforceSize} AI agents. Guide your team to complete the assigned work.`
        : 'You are a Team Leader. Guide your team to complete the assigned work.';
    case 'worker':
      return 'You are a Worker. Execute the assigned task to the best of your ability.';
    default:
      return 'Complete the assigned task.';
  }
}

