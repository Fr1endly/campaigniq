import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://campaign_iq:campaign_iq@localhost:5432/campaign_iq',
  },
  migrations: {
    prefix: 'timestamp',
  },
  strict: true,
  verbose: true,
});
