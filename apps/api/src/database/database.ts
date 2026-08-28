import { createDatabase } from '@campaign-iq/database';
import { env } from '../config/env.js';

export const databaseConnection = createDatabase(env.DATABASE_URL);
