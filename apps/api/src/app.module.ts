import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { SessionController } from './auth/session.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { ImportsModule } from './imports/imports.module.js';
import { InsightsModule } from './insights/insights.module.js';
import { WarehouseModule } from './warehouse/warehouse.module.js';

@Module({
  imports: [
    DatabaseModule,
    AnalyticsModule,
    ImportsModule,
    WarehouseModule,
    InsightsModule,
  ],
  controllers: [HealthController, SessionController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
