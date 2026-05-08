import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../../../../.env') });

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3300),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    MONGO_URI: z.string().min(1),
    REDIS_URL: z.string().min(1),

    DATA_ENCRYPTION_KEY: z
      .string()
      .refine(
        (v) => Buffer.from(v, 'base64').length === 32,
        'DATA_ENCRYPTION_KEY must be 32 raw bytes, base64-encoded',
      ),

    AIRTABLE_OAUTH_CLIENT_ID: z.string().optional(),
    AIRTABLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    AIRTABLE_OAUTH_REDIRECT_URI: z
      .string()
      .url()
      .default('http://localhost:3300/api/airtable/oauth/callback'),

    AIRTABLE_SCRAPER_HEADLESS: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    AIRTABLE_SCRAPER_PROFILE_DIR: z.string().default('./.playwright-profiles'),

    WEB_ORIGIN: z.string().url().default('http://localhost:4200'),
  })
  .refine((env) => !env.AIRTABLE_OAUTH_CLIENT_ID || !!env.AIRTABLE_OAUTH_CLIENT_SECRET, {
    message: 'AIRTABLE_OAUTH_CLIENT_SECRET is required when AIRTABLE_OAUTH_CLIENT_ID is set',
    path: ['AIRTABLE_OAUTH_CLIENT_SECRET'],
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const messages = parsed.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment variables:\n${messages}\n\nSee .env.example for the full list.`,
    );
  }
  return parsed.data;
}
