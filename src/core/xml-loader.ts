/**
 * XML Loader for ADG-Parallels v0.3.0
 * 
 * Handles XML parsing, serialization, and XSD validation.
 * Replaces JSON-based configuration loading.
 */

import * as fs from 'fs';
import * as path from 'path';
import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';
import { logger } from '../utils/logger';

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
    // Preserve arrays for elements that can have multiple items
    isArray: (name: string) => {
        const arrayElements = [
            'stage', 'task', 'type', 'format', 'pattern', 'source'
        ];
        return arrayElements.includes(name);
    }
};

const builderOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: '    ',
    suppressEmptyNode: true
};

const parser = new XMLParser(parserOptions);
const builder = new XMLBuilder(builderOptions);

// =============================================================================
// VALIDATION RESULT
// =============================================================================

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Load and parse an XML file
 * @param filePath Absolute path to XML file
 * @param schemaPath Optional XSD schema path for validation
 * @returns Parsed object
 */
export async function loadXML<T>(filePath: string, schemaPath?: string): Promise<T> {
    try {
        // Check file exists
        if (!fs.existsSync(filePath)) {
            throw new Error(`XML file not found: ${filePath}`);
        }
        
        // Read file content
        const xmlContent = fs.readFileSync(filePath, 'utf-8');
        
        // Basic XML validation
        const validationResult = XMLValidator.validate(xmlContent, {
            allowBooleanAttributes: true
        });
        
        if (validationResult !== true) {
            throw new Error(`Invalid XML: ${JSON.stringify(validationResult)}`);
        }
        
        // Parse XML to object
        const parsed = parser.parse(xmlContent);
        
        // XSD validation (if schema provided)
        if (schemaPath) {
            const validation = await validateXSD(filePath, schemaPath);
            if (!validation.valid) {
                logger.warn(`XSD validation warnings for ${filePath}:`, validation.errors);
                // Don't throw - just warn. Full XSD validation is complex in Node.js
            }
        }
        
        logger.debug(`Loaded XML: ${filePath}`);
        return parsed as T;
        
    } catch (error) {
        logger.error(`Failed to load XML: ${filePath}`, error);
        throw error;
    }
}

/**
 * Save object as XML file
 * @param filePath Absolute path to save
 * @param data Object to serialize
 * @param rootElement Root element name
 */
export async function saveXML<T>(
    filePath: string, 
    data: T, 
    rootElement?: string
): Promise<void> {
    try {
        // Wrap in root element if specified
        const toSerialize = rootElement ? { [rootElement]: data } : data;
        
        // Build XML
        let xmlContent = builder.build(toSerialize);
        
        // Add XML declaration if missing
        if (!xmlContent.startsWith('<?xml')) {
            xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlContent;
        }
        
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write file
        fs.writeFileSync(filePath, xmlContent, 'utf-8');
        
        logger.debug(`Saved XML: ${filePath}`);
        
    } catch (error) {
        logger.error(`Failed to save XML: ${filePath}`, error);
        throw error;
    }
}

/**
 * Validate XML against XSD schema
 * Note: Full XSD validation requires native libraries. 
 * This is a simplified validation that checks structure.
 * 
 * @param xmlPath Path to XML file
 * @param xsdPath Path to XSD schema file
 * @returns Validation result
 */
export async function validateXSD(
    xmlPath: string, 
    xsdPath: string
): Promise<ValidationResult> {
    const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: []
    };
    
    try {
        // Check files exist
        if (!fs.existsSync(xmlPath)) {
            result.valid = false;
            result.errors.push(`XML file not found: ${xmlPath}`);
            return result;
        }
        
        if (!fs.existsSync(xsdPath)) {
            result.warnings.push(`XSD schema not found: ${xsdPath} - skipping validation`);
            return result;
        }
        
        // Read and parse XML
        const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
        const basicValidation = XMLValidator.validate(xmlContent);
        
        if (basicValidation !== true) {
            result.valid = false;
            result.errors.push(`XML syntax error: ${JSON.stringify(basicValidation)}`);
            return result;
        }
        
        // Parse XSD to extract expected structure
        const xsdContent = fs.readFileSync(xsdPath, 'utf-8');
        const xsdParsed = parser.parse(xsdContent);
        
        // Basic structural validation
        // TODO: Implement full XSD validation with libxmljs or similar
        result.warnings.push('Full XSD validation not implemented - using basic checks');
        
        logger.debug(`XSD validation completed for ${xmlPath}`);
        
    } catch (error) {
        result.valid = false;
        result.errors.push(`Validation error: ${error}`);
    }
    
    return result;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse XML string to object
 */
export function parseXMLString<T>(xmlString: string): T {
    const validationResult = XMLValidator.validate(xmlString);
    if (validationResult !== true) {
        throw new Error(`Invalid XML string: ${JSON.stringify(validationResult)}`);
    }
    return parser.parse(xmlString) as T;
}

/**
 * Serialize object to XML string
 */
export function serializeToXML<T>(data: T, rootElement?: string): string {
    const toSerialize = rootElement ? { [rootElement]: data } : data;
    let xmlContent = builder.build(toSerialize);
    
    if (!xmlContent.startsWith('<?xml')) {
        xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlContent;
    }
    
    return xmlContent;
}

/**
 * Check if file is XML format
 */
export function isXMLFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.xml');
}

/**
 * Convert JSON file path to XML equivalent
 */
export function jsonToXmlPath(jsonPath: string): string {
    return jsonPath.replace(/\.json$/i, '.xml');
}

/**
 * Extract attribute value from parsed element
 * fast-xml-parser prefixes attributes with @_
 */
export function getAttr(element: Record<string, unknown>, attrName: string): unknown {
    return element[`@_${attrName}`];
}

/**
 * Safely get text content from element (handles both direct value and #text)
 */
export function getText(element: unknown): string {
    if (typeof element === 'string') {
        return element;
    }
    if (typeof element === 'number') {
        return String(element);
    }
    if (element && typeof element === 'object' && '#text' in element) {
        return String((element as Record<string, unknown>)['#text']);
    }
    return '';
}

/**
 * Ensure value is array (for elements that might be single or array)
 */
export function ensureArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

// =============================================================================
// LOCK FILE HELPERS (for atomic XML updates)
// =============================================================================

/**
 * Acquire lock for XML file
 */
export async function acquireLock(filePath: string, timeout: number = 5000): Promise<boolean> {
    const lockPath = `${filePath}.lock`;
    const startTime = Date.now();
    
    while (fs.existsSync(lockPath)) {
        if (Date.now() - startTime > timeout) {
            logger.warn(`Lock acquisition timeout for ${filePath}`);
            return false;
        }
        await sleep(100);
    }
    
    try {
        fs.writeFileSync(lockPath, process.pid.toString(), { flag: 'wx' });
        return true;
    } catch {
        // Another process got the lock
        return false;
    }
}

/**
 * Release lock for XML file
 */
export function releaseLock(filePath: string): void {
    const lockPath = `${filePath}.lock`;
    try {
        if (fs.existsSync(lockPath)) {
            fs.unlinkSync(lockPath);
        }
    } catch (error) {
        logger.warn(`Failed to release lock: ${lockPath}`, error);
    }
}

/**
 * Execute operation with file lock
 */
export async function withLock<T>(
    filePath: string, 
    operation: () => Promise<T>
): Promise<T> {
    const acquired = await acquireLock(filePath);
    if (!acquired) {
        throw new Error(`Could not acquire lock for ${filePath}`);
    }
    
    try {
        return await operation();
    } finally {
        releaseLock(filePath);
    }
}

// Helper
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
