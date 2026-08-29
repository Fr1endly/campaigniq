import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { InsightsService } from './insights.service.js';
import { PredictionGenerationService } from './prediction-generation.service.js';

@Controller()
export class InsightsController {
  constructor(
    private readonly insights: InsightsService,
    private readonly generation: PredictionGenerationService,
  ) {}

  @Get('insights')
  getInsights(@Req() request: AuthenticatedRequest) {
    return this.insights.getInsights(request.auth.organization.id);
  }

  @Post('predictions')
  @HttpCode(HttpStatus.ACCEPTED)
  generate(@Req() request: AuthenticatedRequest) {
    if (!['owner', 'admin'].includes(request.auth.role)) {
      throw new ForbiddenException(
        'Only organization administrators can generate predictions',
      );
    }
    return this.generation.start(request.auth.organization.id);
  }
}
