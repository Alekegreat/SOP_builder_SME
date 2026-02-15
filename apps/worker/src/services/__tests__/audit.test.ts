// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockD1 = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
};

describe('Audit Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('writeAuditLog', () => {
    it('inserts audit entry', async () => {
      const { writeAuditLog } = await import('../audit.js');

      mockD1.run.mockResolvedValue({});

      await writeAuditLog(mockD1 as any, {
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'sop.created',
        resourceType: 'sop',
        resourceId: 'sop-1',
        metadata: { title: 'Test SOP' },
      });

      expect(mockD1.prepare).toHaveBeenCalled();
      expect(mockD1.run).toHaveBeenCalled();
    });

    it('handles null metadata', async () => {
      const { writeAuditLog } = await import('../audit.js');

      mockD1.run.mockResolvedValue({});

      await writeAuditLog(mockD1 as any, {
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'user.login',
        resourceType: 'user',
        resourceId: 'user-1',
      });

      expect(mockD1.run).toHaveBeenCalled();
    });
  });

  describe('queryAuditLogs', () => {
    it('returns paginated results', async () => {
      const { queryAuditLogs } = await import('../audit.js');

      mockD1.all.mockResolvedValue({
        results: [
          { id: '1', action: 'sop.created', createdAt: '2025-01-01T00:00:00Z' },
          { id: '2', action: 'sop.updated', createdAt: '2025-01-02T00:00:00Z' },
        ],
      });
      mockD1.first.mockResolvedValue({ count: 10 });

      const result = await queryAuditLogs(mockD1 as any, 'ws-1', {
        page: 1,
        limit: 20,
      });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result.items).toHaveLength(2);
    });

    it('filters by action', async () => {
      const { queryAuditLogs } = await import('../audit.js');

      mockD1.all.mockResolvedValue({ results: [] });
      mockD1.first.mockResolvedValue({ count: 0 });

      const result = await queryAuditLogs(mockD1 as any, 'ws-1', {
        action: 'sop.created',
        page: 1,
        limit: 20,
      });

      expect(result.items).toHaveLength(0);
    });
  });
});
