import { handleLlmGeneration } from './handlers/llm-generation.js';
import { handleExport } from './handlers/export.js';
import { handleDigest } from './handlers/digest.js';
import { handleReminder } from './handlers/reminder.js';

export interface ConsumerEnv {
  DB: D1Database;
  R2: R2Bucket;
  QUEUE: Queue;
  OPENAI_API_KEY: string;
  BOT_TOKEN: string;
  ENVIRONMENT: string;
  ENCRYPTION_KEY: string;
}

export interface QueueMessage {
  type: string;
  [key: string]: unknown;
}

export default {
  async queue(batch: MessageBatch<QueueMessage>, env: ConsumerEnv): Promise<void> {
    for (const message of batch.messages) {
      try {
        const job = message.body;

        switch (job.type) {
          case 'llm_generation':
            await handleLlmGeneration(job, env);
            break;
          case 'export':
            await handleExport(job, env);
            break;
          case 'digest':
            await handleDigest(job, env);
            break;
          case 'reminder':
            await handleReminder(job, env);
            break;
          default:
            console.error(`Unknown job type: ${job.type}`);
        }

        message.ack();
      } catch (err) {
        console.error(`Queue job error [${message.body.type}]:`, err);
        message.retry();
      }
    }
  },
};
