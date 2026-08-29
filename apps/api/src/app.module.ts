import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { SessionController } from './auth/session.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { ImportsModule } from './imports/imports.module.js';

@Module({
  imports: [DatabaseModule, AnalyticsModule, ImportsModule],
  controllers: [HealthController, SessionController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
