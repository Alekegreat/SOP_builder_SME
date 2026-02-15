// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  assertPermission,
  isHigherRole,
  PERMISSIONS,
  ROLE_HIERARCHY,
} from '../rbac.js';
import type { Permission } from '@sop/shared';

describe('RBAC Service', () => {
  describe('ROLE_HIERARCHY', () => {
    it('owner has highest level', () => {
      expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.admin);
      expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.editor);
    });

    it('viewer has lowest level', () => {
      expect(ROLE_HIERARCHY.viewer).toBeLessThan(ROLE_HIERARCHY.approver);
    });
  });

  describe('hasPermission', () => {
    it('owner has all permissions', () => {
      const allPermissions = Object.keys(PERMISSIONS) as Permission[];
      for (const perm of allPermissions) {
        expect(hasPermission('owner', perm)).toBe(true);
      }
    });

    it('viewer can only read', () => {
      expect(hasPermission('viewer', 'sop:read')).toBe(true);
      expect(hasPermission('viewer', 'version:read')).toBe(true);
      expect(hasPermission('viewer', 'sop:create')).toBe(false);
      expect(hasPermission('viewer', 'sop:publish')).toBe(false);
    });

    it('editor can create and edit SOPs', () => {
      expect(hasPermission('editor', 'sop:create')).toBe(true);
      expect(hasPermission('editor', 'sop:read')).toBe(true);
      expect(hasPermission('editor', 'interview:start')).toBe(true);
    });

    it('approver can decide approvals', () => {
      expect(hasPermission('approver', 'approval:decide')).toBe(true);
      expect(hasPermission('approver', 'approval:read')).toBe(true);
    });

    it('editor cannot do admin tasks', () => {
      expect(hasPermission('editor', 'admin:audit_logs')).toBe(false);
      expect(hasPermission('editor', 'admin:manual_payment')).toBe(false);
    });
  });

  describe('assertPermission', () => {
    it('does not throw for allowed actions', () => {
      expect(() => assertPermission('owner', 'sop:create')).not.toThrow();
      expect(() => assertPermission('editor', 'sop:read')).not.toThrow();
    });

    it('throws RBACError for disallowed actions', () => {
      expect(() => assertPermission('viewer', 'sop:create')).toThrow();
      expect(() => assertPermission('editor', 'admin:audit_logs')).toThrow();
    });

    it('throws with correct error properties', () => {
      try {
        assertPermission('viewer', 'sop:create');
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        expect(error.message).toContain('sop:create');
        expect(error.name).toBe('RBACError');
      }
    });
  });

  describe('isHigherRole', () => {
    it('owner > admin', () => {
      expect(isHigherRole('owner', 'admin')).toBe(true);
    });

    it('admin > editor', () => {
      expect(isHigherRole('admin', 'editor')).toBe(true);
    });

    it('viewer is not higher than anyone', () => {
      expect(isHigherRole('viewer', 'approver')).toBe(false);
      expect(isHigherRole('viewer', 'editor')).toBe(false);
    });

    it('same role is not higher', () => {
      expect(isHigherRole('editor', 'editor')).toBe(false);
    });
  });
});
