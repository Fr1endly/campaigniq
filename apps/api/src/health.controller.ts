import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from './auth/public.decorator.js';
import { InjectDatabase, type Database } from './database/database.module.js';

@Controller('health')
export class HealthController {
  constructor(@InjectDatabase() private readonly db: Database) {}

  @Get()
  @Public()
  getHealth() {
    return { status: 'ok', service: 'campaign-iq-api' };
  }

  @Get('ready')
  @Public()
  async getReadiness() {
    try {
      await this.db.execute(sql`select 1`);
      return { status: 'ready', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException('Database is unavailable');
    }
  }
}
