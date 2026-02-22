import type { ConsumerEnv, QueueMessage } from '../index.js';
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseLlmResponse,
  initialVersion,
  bumpMinor,
} from '@sop/engine';
import { createAiProvider } from '../services/ai-provider.js';
import { consumeCredits } from '../services/billing.js';
import { decrypt } from '../services/encryption.js';
import { writeAuditLog } from '../services/audit.js';

interface LlmGenerationJob extends QueueMessage {
  type: 'llm_generation';
  sopId: string;
  workspaceId: string;
  interviewSessionId: string;
  userId: string;
  isDelta: boolean;
  previousVersionId?: string;
}

export async function handleLlmGeneration(job: QueueMessage, env: ConsumerEnv): Promise<void> {
  const data = job as LlmGenerationJob;
  const { sopId, workspaceId, interviewSessionId, userId, isDelta } = data;

  // Get workspace config
  const workspace = await env.DB.prepare('SELECT plan, ai_config_json FROM workspaces WHERE id = ?')
    .bind(workspaceId)
    .first<{ plan: string; ai_config_json: string | null }>();

  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  // Get interview transcript
  const session = await env.DB.prepare(
    'SELECT transcript_json FROM interview_sessions WHERE id = ?',
  )
    .bind(interviewSessionId)
    .first<{ transcript_json: string }>();

  const sop = await env.DB.prepare('SELECT title FROM sops WHERE id = ?')
    .bind(sopId)
    .first<{ title: string }>();

  if (!session || !sop) {
    throw new Error(`Interview session not found: ${interviewSessionId}`);
  }

  const transcript = JSON.parse(session.transcript_json);

  // Build prompt
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(transcript, sop.title, isDelta);

  // Get AI provider
  let aiConfig = null;
  if (workspace.ai_config_json) {
    const config = JSON.parse(workspace.ai_config_json);
    if (config.encryptedApiKey) {
      config.apiKey = await decrypt(config.encryptedApiKey, env.ENCRYPTION_KEY);
      delete config.encryptedApiKey;
    }
    aiConfig = config;
  }

  const aiProvider = aiConfig
    ? createAiProvider(aiConfig)
    : createAiProvider({
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: env.OPENAI_API_KEY,
        baseUrl: 'https://api.openai.com/v1',
      });

  // Call LLM
  const rawLlmResponse = await aiProvider.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  // Parse response
  const sopContent = parseLlmResponse(rawLlmResponse);

  // Determine version
  let semver = initialVersion();
  const lastVersion = await env.DB.prepare(
    'SELECT semver FROM sop_versions WHERE sop_id = ? ORDER BY created_at DESC LIMIT 1',
  )
    .bind(sopId)
    .first<{ semver: string }>();
  if (lastVersion?.semver) {
    semver = bumpMinor(lastVersion.semver);
  }

  // Insert version
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO sop_versions (id, sop_id, semver, change_summary, content_json, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      versionId,
      sopId,
      semver,
      isDelta ? 'Delta interview update' : 'Initial generation',
      JSON.stringify(sopContent),
      userId,
      now,
    )
    .run();

  // Insert structured steps, check items, exceptions
  if (sopContent.steps?.length) {
    for (let i = 0; i < sopContent.steps.length; i++) {
      await env.DB.prepare('INSERT INTO sop_steps (id, version_id, ord, text) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), versionId, i, sopContent.steps[i]?.text ?? '')
        .run();
    }
  }

  if (sopContent.checklistItems?.length) {
    for (let i = 0; i < sopContent.checklistItems.length; i++) {
      await env.DB.prepare(
        'INSERT INTO sop_checkitems (id, version_id, ord, text) VALUES (?, ?, ?, ?)',
      )
        .bind(crypto.randomUUID(), versionId, i, sopContent.checklistItems[i]?.text ?? '')
        .run();
    }
  }

  if (sopContent.exceptions?.length) {
    for (let i = 0; i < sopContent.exceptions.length; i++) {
      await env.DB.prepare(
        'INSERT INTO sop_exceptions (id, version_id, ord, text) VALUES (?, ?, ?, ?)',
      )
        .bind(crypto.randomUUID(), versionId, i, sopContent.exceptions[i]?.text ?? '')
        .run();
    }
  }

  // Update SOP current version
  await env.DB.prepare("UPDATE sops SET current_version_id = ?, status = 'APPROVED' WHERE id = ?")
    .bind(versionId, sopId)
    .run();

  // Consume credits for paid plans
  if (workspace.plan !== 'FREE') {
    await consumeCredits(env.DB, workspaceId, 1);
  }

  // Audit log
  await writeAuditLog(env.DB, {
    workspaceId,
    actorUserId: userId,
    action: 'version.created',
    entityType: 'sop_version',
    entityId: versionId,
    meta: { sopId, semver, model: 'gpt-4o-mini' },
  });

  // Notify user via Telegram
  const user = await env.DB.prepare('SELECT telegram_user_id FROM users WHERE id = ?')
    .bind(userId)
    .first<{ telegram_user_id: number }>();

  if (user && sop) {
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.telegram_user_id,
        text: `✅ SOP "${sop.title}" generated (${semver})!\n\nOpen the app to review and approve.`,
      }),
    });
  }
}
