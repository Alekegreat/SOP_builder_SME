import { Hono } from 'hono';
import type { AppEnv } from '../app.js';

export const webhookRoute = new Hono<AppEnv>();

/**
 * POST /webhook/telegram — Bot webhook endpoint
 * Validates webhook secret and processes Telegram updates
 */
webhookRoute.post('/telegram', async (c) => {
  // Validate webhook secret
  const secretHeader = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (secretHeader !== c.env.BOT_WEBHOOK_SECRET) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret' } }, 401);
  }

  const update = await c.req.json();

  try {
    await handleTelegramUpdate(update, c.env);
  } catch (err) {
    console.error('Bot webhook error:', err);
  }

  // Always return 200 to Telegram
  return c.json({ ok: true });
});

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; last_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    successful_payment?: Record<string, unknown>;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    data: string;
    message?: { chat: { id: number }; message_id: number };
  };
  pre_checkout_query?: {
    id: string;
    from: { id: number };
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
}

async function handleTelegramUpdate(update: TelegramUpdate, env: import('../env.js').Env) {
  if (update.pre_checkout_query) {
    // Answer pre-checkout query OK
    await callTelegramApi(env.BOT_TOKEN, 'answerPreCheckoutQuery', {
      pre_checkout_query_id: update.pre_checkout_query.id,
      ok: true,
    });
    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
    return;
  }

  if (!update.message?.text) return;

  const text = update.message.text;
  const chatId = update.message.chat.id;
  const userId = update.message.from.id;

  // Command routing
  if (text.startsWith('/start')) {
    await handleStartCommand(chatId, userId, update.message.from, env);
  } else if (text.startsWith('/new_sop')) {
    await handleNewSopCommand(chatId, userId, env);
  } else if (text.startsWith('/my_sops')) {
    await handleMySopsCommand(chatId, userId, env);
  } else if (text.startsWith('/my_tasks')) {
    await handleMyTasksCommand(chatId, userId, env);
  } else if (text.startsWith('/approve')) {
    await handleApproveCommand(chatId, userId, env);
  } else if (text.startsWith('/billing')) {
    await handleBillingCommand(chatId, userId, env);
  } else if (text.startsWith('/update_sop')) {
    await handleUpdateSopCommand(chatId, userId, text, env);
  } else {
    // Check if user is in an interview session
    await handleInterviewMessage(chatId, userId, text, env);
  }
}

async function handleStartCommand(
  chatId: number,
  _telegramUserId: number,
  from: { first_name: string },
  env: import('../env.js').Env,
) {
  const webAppUrl =
    env.ENVIRONMENT === 'production'
      ? 'https://sop-builder.pages.dev'
      : 'https://sop-builder-dev.pages.dev';

  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    `👋 Welcome to SOP Builder, ${from.first_name}!

I help you create Standard Operating Procedures through structured interviews.

🔹 /new_sop — Start creating a new SOP
🔹 /update_sop — Update an existing SOP
🔹 /my_sops — View your SOPs
🔹 /my_tasks — See pending approvals
🔹 /billing — Manage your plan

Or open the full app:`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: '🚀 Open SOP Builder', web_app: { url: webAppUrl } }]],
      },
    },
  );
}

async function handleNewSopCommand(
  chatId: number,
  telegramUserId: number,
  env: import('../env.js').Env,
) {
  // Find user and workspace
  const user = await env.DB.prepare('SELECT id FROM users WHERE telegram_user_id = ?')
    .bind(telegramUserId)
    .first<{ id: string }>();

  if (!user) {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      'Please open the app first with /start to set up your account.',
    );
    return;
  }

  const membership = await env.DB.prepare(
    "SELECT workspace_id FROM memberships WHERE user_id = ? AND role IN ('owner', 'admin', 'editor') LIMIT 1",
  )
    .bind(user.id)
    .first<{ workspace_id: string }>();

  if (!membership) {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      'You need editor access to a workspace to create SOPs.',
    );
    return;
  }

  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    "📝 Let's create a new SOP!\n\nPlease send me a title for your SOP:",
    {
      reply_markup: {
        force_reply: true,
        selective: true,
        input_field_placeholder: 'e.g., Employee Onboarding Process',
      },
    },
  );
}

async function handleMySopsCommand(
  chatId: number,
  telegramUserId: number,
  env: import('../env.js').Env,
) {
  const user = await env.DB.prepare('SELECT id FROM users WHERE telegram_user_id = ?')
    .bind(telegramUserId)
    .first<{ id: string }>();

  if (!user) {
    await sendMessage(env.BOT_TOKEN, chatId, 'Please /start first.');
    return;
  }

  const sops = await env.DB.prepare(
    `SELECT s.title, s.status, s.created_at
     FROM sops s
     JOIN memberships m ON s.workspace_id = m.workspace_id
     WHERE m.user_id = ?
     ORDER BY s.created_at DESC
     LIMIT 10`,
  )
    .bind(user.id)
    .all();

  if (!sops.results?.length) {
    await sendMessage(env.BOT_TOKEN, chatId, 'You have no SOPs yet. Use /new_sop to create one!');
    return;
  }

  const list = sops.results
    .map((s: Record<string, unknown>, i: number) => `${i + 1}. *${s.title}* — _${s.status}_`)
    .join('\n');

  await sendMessage(env.BOT_TOKEN, chatId, `📋 Your SOPs:\n\n${list}`, { parse_mode: 'Markdown' });
}

async function handleMyTasksCommand(
  chatId: number,
  telegramUserId: number,
  env: import('../env.js').Env,
) {
  const user = await env.DB.prepare('SELECT id FROM users WHERE telegram_user_id = ?')
    .bind(telegramUserId)
    .first<{ id: string }>();

  if (!user) {
    await sendMessage(env.BOT_TOKEN, chatId, 'Please /start first.');
    return;
  }

  const approvals = await env.DB.prepare(
    `SELECT a.id, s.title, sv.semver
     FROM approvals a
     JOIN sops s ON a.sop_id = s.id
     JOIN sop_versions sv ON a.version_id = sv.id
     WHERE a.approver_user_id = ? AND a.state = 'PENDING'
     LIMIT 10`,
  )
    .bind(user.id)
    .all();

  if (!approvals.results?.length) {
    await sendMessage(env.BOT_TOKEN, chatId, '✅ No pending tasks!');
    return;
  }

  const buttons = approvals.results.map((a: Record<string, unknown>) => [
    { text: `✅ ${a.title} (${a.semver})`, callback_data: `approve:${a.id}` },
    { text: `❌ Reject`, callback_data: `reject:${a.id}` },
  ]);

  await sendMessage(env.BOT_TOKEN, chatId, '📋 Pending approvals:', {
    reply_markup: { inline_keyboard: buttons },
  });
}

async function handleApproveCommand(
  chatId: number,
  telegramUserId: number,
  env: import('../env.js').Env,
) {
  // Same as /my_tasks
  await handleMyTasksCommand(chatId, telegramUserId, env);
}

async function handleUpdateSopCommand(
  chatId: number,
  telegramUserId: number,
  text: string,
  env: import('../env.js').Env,
) {
  const user = await env.DB.prepare('SELECT id FROM users WHERE telegram_user_id = ?')
    .bind(telegramUserId)
    .first<{ id: string }>();

  if (!user) {
    await sendMessage(env.BOT_TOKEN, chatId, 'Please /start first.');
    return;
  }

  // Parse SOP selection from command: /update_sop <number>
  const parts = text.trim().split(/\s+/);
  const sopIndex = parts.length > 1 ? parseInt(parts[1], 10) : NaN;

  // List SOPs for the user to pick from if no number given
  const sops = await env.DB.prepare(
    `SELECT s.id, s.title, s.status
     FROM sops s
     JOIN memberships m ON s.workspace_id = m.workspace_id
     WHERE m.user_id = ? AND s.status IN ('PUBLISHED', 'APPROVED', 'DRAFT')
     ORDER BY s.created_at DESC
     LIMIT 10`,
  )
    .bind(user.id)
    .all();

  if (!sops.results?.length) {
    await sendMessage(env.BOT_TOKEN, chatId, 'You have no SOPs to update. Use /new_sop first.');
    return;
  }

  if (isNaN(sopIndex) || sopIndex < 1 || sopIndex > sops.results.length) {
    const list = sops.results
      .map((s: Record<string, unknown>, i: number) => `${i + 1}. ${s.title} — _${s.status}_`)
      .join('\n');
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      `📝 Which SOP to update? Reply with:\n/update_sop <number>\n\n${list}`,
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const selectedSop = sops.results[sopIndex - 1];
  const sopId = selectedSop.id as string;
  const sopTitle = selectedSop.title as string;

  // Find workspace
  const sop = await env.DB.prepare('SELECT workspace_id FROM sops WHERE id = ?')
    .bind(sopId)
    .first<{ workspace_id: string }>();
  if (!sop) {
    await sendMessage(env.BOT_TOKEN, chatId, 'SOP not found.');
    return;
  }

  // Create a new interview session for delta update
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO interview_sessions (id, sop_id, workspace_id, state, transcript_json, current_question_index, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, 'IN_PROGRESS', '[]', 0, ?, ?, ?)`,
  )
    .bind(sessionId, sopId, sop.workspace_id, user.id, now, now)
    .run();

  const { INTERVIEW_QUESTIONS } = await import('@sop/shared');
  const firstQ = INTERVIEW_QUESTIONS[0];

  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    `🔄 Starting delta update for: *${sopTitle}*\n\nAnswer the following questions. Your new answers will be used to generate an updated version.\n\n📝 *Question 1/${INTERVIEW_QUESTIONS.length}*\n\n${firstQ.question}`,
    { parse_mode: 'Markdown' },
  );
}

async function handleBillingCommand(
  chatId: number,
  telegramUserId: number,
  env: import('../env.js').Env,
) {
  const user = await env.DB.prepare('SELECT id FROM users WHERE telegram_user_id = ?')
    .bind(telegramUserId)
    .first<{ id: string }>();

  if (!user) {
    await sendMessage(env.BOT_TOKEN, chatId, 'Please /start first.');
    return;
  }

  const membership = await env.DB.prepare(
    "SELECT workspace_id FROM memberships WHERE user_id = ? AND role = 'owner' LIMIT 1",
  )
    .bind(user.id)
    .first<{ workspace_id: string }>();

  if (!membership) {
    await sendMessage(env.BOT_TOKEN, chatId, 'Only workspace owners can manage billing.');
    return;
  }

  const workspace = await env.DB.prepare('SELECT plan FROM workspaces WHERE id = ?')
    .bind(membership.workspace_id)
    .first<{ plan: string }>();

  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    `💳 Current plan: *${workspace?.plan ?? 'FREE'}*\n\nUpgrade options:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⭐ Solo Pro — $12/mo', callback_data: `upgrade:SOLO_PRO` }],
          [{ text: '👥 Team — $39/mo', callback_data: `upgrade:TEAM` }],
          [{ text: '🏢 Business — $99/mo', callback_data: `upgrade:BUSINESS` }],
          [{ text: '🎁 Buy AI Credits', callback_data: `credits:buy` }],
        ],
      },
    },
  );
}

async function handleInterviewMessage(
  chatId: number,
  telegramUserId: number,
  text: string,
  env: import('../env.js').Env,
) {
  // Look up any active interview session for this user
  const user = await env.DB.prepare('SELECT id FROM users WHERE telegram_user_id = ?')
    .bind(telegramUserId)
    .first<{ id: string }>();

  if (!user) return;

  const session = await env.DB.prepare(
    "SELECT * FROM interview_sessions WHERE created_by_user_id = ? AND state = 'IN_PROGRESS' ORDER BY updated_at DESC LIMIT 1",
  )
    .bind(user.id)
    .first();

  if (!session) return; // Not in an interview

  // Process as interview answer
  const { INTERVIEW_QUESTIONS } = await import('@sop/shared');
  const questionIndex = session.current_question_index as number;
  const currentQuestion = INTERVIEW_QUESTIONS[questionIndex];

  if (!currentQuestion) return;

  // Handle cancel
  if (text.toLowerCase() === '/cancel') {
    await env.DB.prepare(
      "UPDATE interview_sessions SET state = 'CANCELLED', updated_at = ? WHERE id = ?",
    )
      .bind(new Date().toISOString(), session.id)
      .run();
    await sendMessage(env.BOT_TOKEN, chatId, '❌ Interview cancelled.');
    return;
  }

  // Save answer
  const transcript = JSON.parse((session.transcript_json as string) || '[]');
  const isSkip =
    !currentQuestion.required && (text.toLowerCase().trim() === 'skip' || text.trim() === '');
  const isDone = currentQuestion.key === 'additional_steps' && text.toLowerCase().trim() === 'done';

  if (!isSkip && !isDone) {
    transcript.push({
      questionKey: currentQuestion.key,
      question: currentQuestion.question,
      answer: text,
      answeredAt: new Date().toISOString(),
    });
  }

  const nextIndex = questionIndex + 1;
  const isComplete = nextIndex >= INTERVIEW_QUESTIONS.length;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE interview_sessions
     SET state = ?, transcript_json = ?, current_question_index = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      isComplete ? 'COMPLETED' : 'IN_PROGRESS',
      JSON.stringify(transcript),
      isComplete ? questionIndex : nextIndex,
      now,
      session.id,
    )
    .run();

  if (isComplete) {
    await sendMessage(env.BOT_TOKEN, chatId, '✅ Interview complete! Generating your SOP...');

    // Enqueue generation
    await env.QUEUE.send({
      type: 'llm_generation',
      sopId: session.sop_id,
      workspaceId: session.workspace_id,
      interviewSessionId: session.id,
      userId: user.id,
      isDelta: false,
    });
  } else {
    const nextQ = INTERVIEW_QUESTIONS[nextIndex];
    const skipHint = nextQ.required ? '' : '\n_(Type "skip" to skip this question)_';
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      `📝 *Question ${nextIndex + 1}/${INTERVIEW_QUESTIONS.length}*\n\n${nextQ.question}${skipHint}`,
      { parse_mode: 'Markdown' },
    );
  }
}

async function handleCallbackQuery(
  query: NonNullable<TelegramUpdate['callback_query']>,
  env: import('../env.js').Env,
) {
  const data = query.data;
  const chatId = query.message?.chat.id;
  if (!chatId) return;

  if (data.startsWith('approve:') || data.startsWith('reject:')) {
    const [action, approvalId] = data.split(':');
    const decision = action === 'approve' ? 'APPROVED' : 'REJECTED';

    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE approvals SET state = ?, decided_at = ? WHERE id = ?')
      .bind(decision, now, approvalId)
      .run();

    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      `${decision === 'APPROVED' ? '✅' : '❌'} Approval ${decision.toLowerCase()}.`,
    );
  }

  // Answer callback query
  await callTelegramApi(env.BOT_TOKEN, 'answerCallbackQuery', {
    callback_query_id: query.id,
  });
}

// ── Telegram API helpers ──
async function sendMessage(
  botToken: string,
  chatId: number,
  text: string,
  extra?: Record<string, unknown>,
) {
  await callTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    ...extra,
  });
}

async function callTelegramApi(botToken: string, method: string, body: Record<string, unknown>) {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`Telegram API error [${method}]:`, err);
  }
}
