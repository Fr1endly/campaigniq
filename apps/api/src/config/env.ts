import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgresql://campaign_iq:campaign_iq@localhost:5432/campaign_iq'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  BETTER_AUTH_URL: z.url().default('http://localhost:3000'),
  BETTER_AUTH_SECRET: z.string().min(32).default('campaign-iq-local-development-secret-change-me'),
});

export const env = envSchema.parse(process.env);
