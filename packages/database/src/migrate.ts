import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client.js';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://campaign_iq:campaign_iq@localhost:5432/campaign_iq';
const { db, pool } = createDatabase(databaseUrl);

try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.info('Database migrations applied.');
} finally {
  await pool.end();
}
