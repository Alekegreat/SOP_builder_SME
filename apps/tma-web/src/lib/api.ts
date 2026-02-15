const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

let accessToken: string | null = null;

export function setAccessToken(token: string) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: { message: resp.statusText } }));
    const err = new Error(body.error?.message ?? `HTTP ${resp.status}`) as Error & {
      status: number;
      code: string;
    };
    err.status = resp.status;
    err.code = body.error?.code ?? 'UNKNOWN';
    throw err;
  }

  return resp.json() as Promise<T>;
}

// ── Auth ──
export function authenticateTelegram(initData: string) {
  return request<{ accessToken: string; user: { id: string; name: string; telegramUserId: number }; workspaceId: string }>(
    '/auth/telegram',
    { method: 'POST', body: JSON.stringify({ initData }) },
  );
}

// ── SOPs ──
export function listSops(params: { workspaceId: string; status?: string; search?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  qs.set('workspaceId', params.workspaceId);
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  return request<{ data: Record<string, unknown>[]; total: number; limit?: number; offset?: number }>(`/sops?${qs}`);
}

export function getSop(id: string) {
  return request<Record<string, unknown>>(`/sops/${id}`);
}

export function createSop(data: { workspaceId: string; title: string; tags: string[] }) {
  return request<Record<string, unknown>>('/sops', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function startInterview(sopId: string) {
  return request<{ sessionId: string; nextQuestion: unknown }>(`/sops/${sopId}/interview/start`, {
    method: 'POST',
  });
}

export function answerInterview(sopId: string, data: { questionKey: string; answer: string }) {
  return request<{ nextQuestion: unknown; isComplete: boolean }>(`/sops/${sopId}/interview/answer`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function generateSop(sopId: string, data?: { isDelta?: boolean; previousVersionId?: string }) {
  return request<{ status: string; sessionId: string }>(`/sops/${sopId}/generate`, {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export function listVersions(sopId: string) {
  return request<{ data: Record<string, unknown>[] }>(`/sops/${sopId}/versions`);
}

export function publishVersion(sopId: string, versionId: string) {
  return request<{ status: string }>(`/sops/${sopId}/versions/${versionId}/publish`, {
    method: 'POST',
  });
}

// ── Approvals ──
export function getApprovalInbox(workspaceId: string) {
  return request<{ data: Record<string, unknown>[] }>(`/approvals/inbox?workspaceId=${workspaceId}`);
}

export function createApproval(data: { sopId: string; versionId: string; approverUserId: string }) {
  return request<Record<string, unknown>>('/approvals', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function decideApproval(approvalId: string, data: { decision: 'APPROVED' | 'REJECTED'; comment?: string }) {
  return request<Record<string, unknown>>(`/approvals/${approvalId}/decide`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Billing ──
export function getBillingPlan(workspaceId: string) {
  return request<Record<string, unknown>>(`/billing/plan?workspaceId=${workspaceId}`);
}

export function upgradePlan(workspaceId: string, plan: string) {
  return request<Record<string, unknown>>('/billing/upgrade', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, plan }),
  });
}

export function purchaseCredits(workspaceId: string, packId: string) {
  return request<Record<string, unknown>>('/billing/credits', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, packId }),
  });
}

// ── Admin ──
export function getAuditLogs(params: { workspaceId: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  qs.set('workspaceId', params.workspaceId);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  return request<{ data: Record<string, unknown>[]; total: number }>(`/admin/audit_logs?${qs}`);
}

// ── Workspace ──
export function getWorkspaceSettings(workspaceId: string) {
  return request<{
    id: string; name: string; plan: string;
    reviewCycleDays: number; strictApprovals: boolean; requireApprovalToPublish: boolean;
  }>(`/workspace/settings?workspaceId=${workspaceId}`);
}

export function updateWorkspaceSettings(workspaceId: string, data: {
  name?: string; reviewCycleDays?: number; strictApprovals?: boolean; requireApprovalToPublish?: boolean;
}) {
  return request<{ status: string }>('/workspace/settings', {
    method: 'PUT',
    body: JSON.stringify({ workspaceId, ...data }),
  });
}

export function updateAiConfig(workspaceId: string, data: { provider: string; model: string; apiKey?: string }) {
  return request<{ status: string }>('/workspace/ai-config', {
    method: 'PUT',
    body: JSON.stringify({ workspaceId, ...data }),
  });
}

export function getWorkspaceMembers(workspaceId: string) {
  return request<{ data: Array<{ user_id: string; role: string; name: string; telegram_user_id: number }> }>(
    `/workspace/members?workspaceId=${workspaceId}`,
  );
}

export function inviteMember(workspaceId: string, data: { telegramUserId: number; role?: string }) {
  return request<{ status: string; userId: string; role: string }>('/workspace/members/invite', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, ...data }),
  });
}

export function changeMemberRole(workspaceId: string, userId: string, role: string) {
  return request<{ status: string }>(`/workspace/members/${userId}/role`, {
    method: 'PUT',
    body: JSON.stringify({ workspaceId, role }),
  });
}

// ── SOP Actions ──
export function deleteSop(sopId: string) {
  return request<{ status: string }>(`/sops/${sopId}`, { method: 'DELETE' });
}

export function exportSop(sopId: string, format: 'html' | 'pdf' = 'html') {
  return request<{ status: string; sopId: string; format: string }>(`/sops/${sopId}/export`, {
    method: 'POST',
    body: JSON.stringify({ format }),
  });
}
