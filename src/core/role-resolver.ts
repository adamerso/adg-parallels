/**
 * Role Resolver v1.0
 * 
 * Resolves role codes based on hierarchy depth.
 * Each depth (1-16) has a unique set of role names where:
 * - Position in array = layer number (0 = CEO, 1 = first subordinate, etc.)
 * - Role name is unique per depth, so seeing "DELIVCO" means "4-layer structure, layer 2"
 * 
 * Source: docs/CHAIN_OF_COMMAND_xD.md
 */

// =============================================================================
// TYPES
// =============================================================================

export interface RoleInfo {
  code: string;
  fullName: string;
  layer: number;
  totalLayers: number;
  isLeaf: boolean;
  isCEO: boolean;
}

export interface HierarchyInfo {
  depth: number;
  roles: RoleInfo[];
  theme?: string;
}

// =============================================================================
// ROLE DEFINITIONS (from CHAIN_OF_COMMAND_xD.md)
// =============================================================================

/**
 * All role hierarchies indexed by depth (1-16)
 * Each array: [CEO, layer1, layer2, ..., lastLayer]
 */
const ROLE_HIERARCHIES: Record<number, { roles: [string, string][]; theme?: string }> = {
  1: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
    ],
  },
  2: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['EXECOPS', 'Execution Operations Associate'],
    ],
  },
  3: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['PROCCTL', 'Process Control Manager'],
      ['TASKENG', 'Task Execution Specialist'],
    ],
  },
  4: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['STRATOP', 'Strategic Operations Director'],
      ['DELIVCO', 'Delivery Coordination Lead'],
      ['EXESUPP', 'Execution Support Agent'],
    ],
  },
  5: {
    theme: 'LEGAL / COMPLIANCE CORE',
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['LEGALHD', 'Legal Affairs Director'],
      ['COMPRSK', 'Compliance Risk Manager'],
      ['POLICYO', 'Policy Enforcement Officer'],
      ['CASECLR', 'Case Resolution Associate'],
    ],
  },
  6: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['CORPGOV', 'Corporate Governance Director'],
      ['XDOMAIN', 'Cross-Domain Program Manager'],
      ['DEPOPS', 'Department Operations Supervisor'],
      ['PROCFLO', 'Process Execution Specialist'],
      ['TASKHND', 'Task Handling Associate'],
    ],
  },
  7: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['GLOBSTR', 'Global Strategy Director'],
      ['ENTPRGM', 'Enterprise Program Executive'],
      ['DOMAINM', 'Domain Operations Manager'],
      ['FLOWCTL', 'Workflow Coordination Lead'],
      ['OPSUPRT', 'Operational Support Specialist'],
      ['TASKAGN', 'Task Execution Agent'],
    ],
  },
  8: {
    theme: 'IT / ENGINEERING CORE',
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['ITARCH', 'IT Architecture Executive'],
      ['SYSENG', 'Systems Engineering Director'],
      ['PLATFORM', 'Platform Operations Manager'],
      ['INFRALD', 'Infrastructure Team Lead'],
      ['DEVOPS', 'DevOps Process Lead'],
      ['SRENG', 'Site Reliability Specialist'],
      ['TECHOPS', 'Technical Operations Agent'],
    ],
  },
  9: {
    theme: 'MARKETING / COMMUNICATION',
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['BRANDHD', 'Brand Strategy Executive'],
      ['MKTSTR', 'Marketing Strategy Director'],
      ['CAMPMGR', 'Campaign Operations Manager'],
      ['CONTENT', 'Content Program Lead'],
      ['COMMSPL', 'Communications Specialist'],
      ['ANALYTS', 'Market Analytics Coordinator'],
      ['OUTREACH', 'Outreach Execution Associate'],
      ['SOCIAL', 'Social Channel Operator'],
    ],
  },
  10: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['EXECCTR', 'Executive Steering Chair'],
      ['ENTERPR', 'Enterprise Governance Officer'],
      ['PROGDIR', 'Strategic Program Director'],
      ['SERVDEL', 'Service Delivery Director'],
      ['WORKADM', 'Workflow Administration Manager'],
      ['OPSCON', 'Operational Control Supervisor'],
      ['RELIABL', 'Execution Reliability Specialist'],
      ['TASKRES', 'Task Resolution Associate'],
      ['SUPPORT', 'Support Queue Intern'],
    ],
  },
  11: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['POLICYX', 'Corporate Policy Executive'],
      ['PORTFOL', 'Global Portfolio Officer'],
      ['BIZOPS', 'Business Operations Director'],
      ['PROGCO', 'Program Coordination Manager'],
      ['PERFLD', 'Department Performance Lead'],
      ['COMPLY', 'Process Compliance Supervisor'],
      ['ENABLE', 'Execution Enablement Specialist'],
      ['DISPATCH', 'Task Dispatch Coordinator'],
      ['INTAKE', 'Work Intake Specialist'],
      ['TRAINEE', 'Basic Task Trainee'],
    ],
  },
  12: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['EXECCTL', 'Executive Control Officer'],
      ['STRATCO', 'Enterprise Strategy Coordinator'],
      ['CORPSVC', 'Corporate Services Director'],
      ['OVERSGT', 'Program Oversight Manager'],
      ['MULTOPS', 'Multi-Team Operations Manager'],
      ['OPTIMZ', 'Process Optimization Lead'],
      ['QUALREV', 'Quality Review Supervisor'],
      ['EXECTRL', 'Execution Control Specialist'],
      ['FULFILL', 'Task Fulfillment Associate'],
      ['DESKHND', 'Handling Desk Assistant'],
      ['ENTRYIN', 'Entry Support Intern'],
    ],
  },
  13: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['GOVCHAI', 'Executive Governance Chair'],
      ['PORTDIR', 'Corporate Portfolio Director'],
      ['ORGSTR', 'Organization Strategy Director'],
      ['INTEGRA', 'Program Integration Manager'],
      ['DELIVOP', 'Delivery Operations Manager'],
      ['STANDRD', 'Process Standards Lead'],
      ['ASSURE', 'Assurance Review Manager'],
      ['VALIDAT', 'Execution Validation Specialist'],
      ['ROUTING', 'Task Routing Coordinator'],
      ['INTKASS', 'Work Intake Associate'],
      ['SERVDSK', 'Service Desk Assistant'],
      ['TASKTRN', 'Trainee Task Operator'],
    ],
  },
  14: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['CMDEXEC', 'Corporate Command Executive'],
      ['CTRLENT', 'Enterprise Controls Director'],
      ['INITSTR', 'Strategic Initiatives Director'],
      ['HLTHPRG', 'Program Health Manager'],
      ['DEPOPM', 'Department Operations Manager'],
      ['XTCOORD', 'Cross-Team Coordination Lead'],
      ['GOVPROC', 'Process Governance Lead'],
      ['QUALCTL', 'Quality Control Supervisor'],
      ['EXESPEC', 'Execution Support Specialist'],
      ['TASKDIST', 'Task Distribution Associate'],
      ['QUEUEHD', 'Work Queue Handler'],
      ['ENTRYOPS', 'Entry Operations Assistant'],
      ['JUNINTR', 'Junior Intake Intern'],
    ],
  },
  15: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['AUTHXEC', 'Corporate Authority Executive'],
      ['DIRCTEN', 'Enterprise Direction Director'],
      ['STRCTL', 'Strategic Control Director'],
      ['PORTMGR', 'Program Portfolio Manager'],
      ['SERVOPS', 'Service Operations Manager'],
      ['DEPCOOR', 'Department Coordination Manager'],
      ['MGRCTRL', 'Process Control Managerial Lead'],
      ['QUALASS', 'Quality Assurance Supervisor'],
      ['MONITOR', 'Execution Monitoring Specialist'],
      ['TASKCOA', 'Task Coordination Associate'],
      ['ALLOCAT', 'Work Allocation Handler'],
      ['SUPPORTO', 'Support Operations Assistant'],
      ['BASINT', 'Basic Task Intern'],
      ['TEMPHLP', 'Temporary Queue Helper'],
    ],
  },
  16: {
    roles: [
      ['CEO', 'Chief Egg Officer'],
      ['CMDCHAI', 'Executive Command Chair'],
      ['OVRSEER', 'Corporate Oversight Director'],
      ['INTEGRT', 'Enterprise Integrity Director'],
      ['STRPORT', 'Strategic Portfolio Manager'],
      ['PRGCMND', 'Program Command Manager'],
      ['SERVMGT', 'Service Delivery Manager'],
      ['DEPCTRL', 'Department Control Manager'],
      ['STDPROC', 'Process Standards Supervisor'],
      ['QUALSYS', 'Quality Systems Lead'],
      ['ASSUREX', 'Execution Assurance Specialist'],
      ['ASSIGN', 'Task Assignment Coordinator'],
      ['INTKHND', 'Work Intake Handler'],
      ['DESKTRN', 'Service Desk Trainee'],
      ['TMPSUPP', 'Temporary Support Intern'],
      ['ONESHOT', 'One-Off Task Temp'],
    ],
  },
};

// Build reverse lookup: role code → {depth, layer}
const ROLE_LOOKUP: Map<string, { depth: number; layer: number }> = new Map();

for (const [depthStr, hierarchy] of Object.entries(ROLE_HIERARCHIES)) {
  const depth = parseInt(depthStr);
  hierarchy.roles.forEach(([code], layer) => {
    // CEO exists in all hierarchies, skip duplicate entries
    if (code !== 'CEO') {
      ROLE_LOOKUP.set(code, { depth, layer });
    }
  });
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get hierarchy info for a given depth
 * @param depth Number of layers (1-16)
 * @returns HierarchyInfo or null if depth out of range
 */
export function getHierarchy(depth: number): HierarchyInfo | null {
  if (depth < 1 || depth > 16) {
    return null;
  }

  const hierarchy = ROLE_HIERARCHIES[depth];
  if (!hierarchy) {
    return null;
  }

  const roles: RoleInfo[] = hierarchy.roles.map(([code, fullName], layer) => ({
    code,
    fullName,
    layer,
    totalLayers: depth,
    isLeaf: layer === depth - 1,
    isCEO: layer === 0,
  }));

  return {
    depth,
    roles,
    theme: hierarchy.theme,
  };
}

/**
 * Get role info for a specific layer within a hierarchy depth
 * @param depth Total hierarchy depth (1-16)
 * @param layer Layer number (0 = CEO, 1 = first subordinate, etc.)
 * @returns RoleInfo or null if invalid
 */
export function getRoleAt(depth: number, layer: number): RoleInfo | null {
  const hierarchy = getHierarchy(depth);
  if (!hierarchy) {
    return null;
  }

  if (layer < 0 || layer >= hierarchy.roles.length) {
    return null;
  }

  return hierarchy.roles[layer];
}

/**
 * Get role code for a specific layer within a hierarchy depth
 * @param depth Total hierarchy depth (1-16)
 * @param layer Layer number (0 = CEO)
 * @returns Role code string or null
 */
export function getRoleCode(depth: number, layer: number): string | null {
  const role = getRoleAt(depth, layer);
  return role?.code ?? null;
}

/**
 * Lookup hierarchy info from a role code
 * CEO returns null (exists in all hierarchies - use folder context instead)
 * @param code Role code (e.g., 'DELIVCO', 'EXESUPP')
 * @returns {depth, layer} or null if not found or CEO
 */
export function lookupRole(code: string): { depth: number; layer: number } | null {
  if (code === 'CEO') {
    // CEO is ambiguous - exists in all hierarchies
    // Caller must determine depth from context (e.g., children's roles or config)
    return null;
  }
  return ROLE_LOOKUP.get(code) ?? null;
}

/**
 * Determine hierarchy depth from a non-CEO role code
 * @param code Role code (not CEO)
 * @returns Depth (1-16) or null if not found
 */
export function getDepthFromRole(code: string): number | null {
  const info = lookupRole(code);
  return info?.depth ?? null;
}

/**
 * Determine layer from a role code
 * @param code Role code
 * @returns Layer number or 0 if CEO, null if not found
 */
export function getLayerFromRole(code: string): number | null {
  if (code === 'CEO') {
    return 0;
  }
  const info = lookupRole(code);
  return info?.layer ?? null;
}

/**
 * Check if a role can delegate (is not a leaf)
 * @param code Role code
 * @param depth Hierarchy depth (required for CEO)
 * @returns true if can delegate, false otherwise
 */
export function canDelegate(code: string, depth?: number): boolean {
  if (code === 'CEO') {
    // CEO can always delegate unless depth is 1 (solo)
    return depth !== undefined && depth > 1;
  }

  const info = lookupRole(code);
  if (!info) {
    return false;
  }

  // Can delegate if not the last layer
  return info.layer < info.depth - 1;
}

/**
 * Get all role codes for a given depth
 * @param depth Hierarchy depth (1-16)
 * @returns Array of role codes or empty array if invalid
 */
export function getRoleCodes(depth: number): string[] {
  const hierarchy = getHierarchy(depth);
  if (!hierarchy) {
    return [];
  }
  return hierarchy.roles.map(r => r.code);
}

/**
 * Validate if a role code exists
 * @param code Role code to check
 * @returns true if valid role code
 */
export function isValidRole(code: string): boolean {
  return code === 'CEO' || ROLE_LOOKUP.has(code);
}

/**
 * Get subordinate role for a given role
 * @param code Current role code
 * @param depth Hierarchy depth (required for CEO)
 * @returns Subordinate role code or null if leaf
 */
export function getSubordinateRole(code: string, depth?: number): string | null {
  if (code === 'CEO') {
    if (depth === undefined || depth < 2) {
      return null;
    }
    return getRoleCode(depth, 1);
  }

  const info = lookupRole(code);
  if (!info || info.layer >= info.depth - 1) {
    return null;
  }

  return getRoleCode(info.depth, info.layer + 1);
}

/**
 * Get parent role for a given role
 * @param code Current role code
 * @returns Parent role code or null if CEO
 */
export function getParentRole(code: string): string | null {
  if (code === 'CEO') {
    return null;
  }

  const info = lookupRole(code);
  if (!info || info.layer === 0) {
    return null;
  }

  if (info.layer === 1) {
    return 'CEO';
  }

  return getRoleCode(info.depth, info.layer - 1);
}

// =============================================================================
// CONSTANTS EXPORT
// =============================================================================

export const MIN_DEPTH = 1;
export const MAX_DEPTH = 16;

export { ROLE_HIERARCHIES };
