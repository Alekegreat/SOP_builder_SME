import type { WorkspaceRole } from '@sop/shared';

/**
 * RBAC permission definitions.
 * Maps actions to required minimum roles.
 */
type Permission =
  | 'sop:create'
  | 'sop:read'
  | 'sop:update'
  | 'sop:delete'
  | 'sop:submit_review'
  | 'sop:publish'
  | 'sop:archive'
  | 'interview:start'
  | 'interview:answer'
  | 'interview:cancel'
  | 'generate:trigger'
  | 'version:read'
  | 'approval:create'
  | 'approval:decide'
  | 'approval:read'
  | 'checklist:run'
  | 'checklist:read'
  | 'member:invite'
  | 'member:remove'
  | 'member:change_role'
  | 'workspace:settings'
  | 'workspace:billing'
  | 'admin:audit_logs'
  | 'admin:manual_payment'
  | 'export:create';

/**
 * Role hierarchy: owner > admin > editor > approver > viewer
 */
const ROLE_LEVELS: Record<WorkspaceRole, number> = {
  owner: 100,
  admin: 80,
  editor: 60,
  approver: 40,
  viewer: 20,
};

/**
 * Minimum role required for each permission
 */
const PERMISSION_RULES: Record<Permission, WorkspaceRole> = {
  'sop:create': 'editor',
  'sop:read': 'viewer',
  'sop:update': 'editor',
  'sop:delete': 'admin',
  'sop:submit_review': 'editor',
  'sop:publish': 'admin',
  'sop:archive': 'admin',
  'interview:start': 'editor',
  'interview:answer': 'editor',
  'interview:cancel': 'editor',
  'generate:trigger': 'editor',
  'version:read': 'viewer',
  'approval:create': 'editor',
  'approval:decide': 'approver',
  'approval:read': 'viewer',
  'checklist:run': 'viewer',
  'checklist:read': 'viewer',
  'member:invite': 'admin',
  'member:remove': 'admin',
  'member:change_role': 'owner',
  'workspace:settings': 'admin',
  'workspace:billing': 'owner',
  'admin:audit_logs': 'admin',
  'admin:manual_payment': 'owner',
  'export:create': 'viewer',
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: WorkspaceRole, permission: Permission): boolean {
  const requiredRole = PERMISSION_RULES[permission];
  if (!requiredRole) return false;
  return ROLE_LEVELS[role] >= ROLE_LEVELS[requiredRole];
}

/**
 * Assert permission — throws if insufficient
 */
export function assertPermission(role: WorkspaceRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new RBACError(
      `Insufficient permissions: requires "${PERMISSION_RULES[permission]}" role, you have "${role}"`,
      permission,
      role,
    );
  }
}

/**
 * Check if role A is higher than role B
 */
export function isHigherRole(a: WorkspaceRole, b: WorkspaceRole): boolean {
  return ROLE_LEVELS[a] > ROLE_LEVELS[b];
}

/**
 * Get the effective role for display
 */
export function getRoleLevel(role: WorkspaceRole): number {
  return ROLE_LEVELS[role];
}

export class RBACError extends Error {
  public readonly permission: Permission;
  public readonly role: WorkspaceRole;

  constructor(message: string, permission: Permission, role: WorkspaceRole) {
    super(message);
    this.name = 'RBACError';
    this.permission = permission;
    this.role = role;
  }
}

export type { Permission };
