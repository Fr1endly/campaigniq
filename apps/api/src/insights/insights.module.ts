import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';
import { PredictionGenerationService } from './prediction-generation.service.js';

@Module({
  controllers: [InsightsController],
  providers: [InsightsService, PredictionGenerationService],
})
export class InsightsModule {}
