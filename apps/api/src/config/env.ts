import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgresql://campaign_iq:campaign_iq@localhost:5432/campaign_iq'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  BETTER_AUTH_URL: z.url().default('http://localhost:3000'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .default('campaign-iq-local-development-secret-change-me'),
  S3_ENDPOINT: z.url().default('http://localhost:9000'),
  S3_PUBLIC_ENDPOINT: z.url().default('http://localhost:9000'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(3).default('campaigniq-raw'),
  S3_ACCESS_KEY: z.string().min(1).default('campaign_iq'),
  S3_SECRET_KEY: z.string().min(8).default('campaign-iq-local-storage-secret'),
  IMPORT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024),
  IMPORT_UPLOAD_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),
  ETL_PYTHON_BIN: z.string().min(1).default('python3'),
});

export const env = envSchema.parse(process.env);
