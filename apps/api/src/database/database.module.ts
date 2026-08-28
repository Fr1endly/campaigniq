import { Global, Inject, Module, type Provider } from '@nestjs/common';
import type { CampaignIqDatabase } from '@campaign-iq/database';
import { databaseConnection } from './database.js';

export const DATABASE = Symbol('DATABASE');

const databaseProvider: Provider = {
  provide: DATABASE,
  useValue: databaseConnection.db,
};

@Global()
@Module({
  providers: [databaseProvider],
  exports: [databaseProvider],
})
export class DatabaseModule {}

export const InjectDatabase = () => Inject(DATABASE);
export type Database = CampaignIqDatabase;
