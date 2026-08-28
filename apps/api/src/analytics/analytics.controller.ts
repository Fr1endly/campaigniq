import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import {
  campaignListQuerySchema,
  dashboardQuerySchema,
  rangePresetSchema,
} from '@campaign-iq/contracts';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AnalyticsService } from './analytics.service.js';

function parse<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } }, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error);
  return result.data as T;
}

@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard/summary')
  getDashboard(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const parsed = parse(dashboardQuerySchema, query);
    return this.analytics.getDashboard(request.auth.organization.id, parsed.range);
  }

  @Get('campaigns')
  getCampaigns(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const parsed = parse(campaignListQuerySchema, query);
    return this.analytics.getCampaigns(request.auth.organization.id, parsed);
  }

  @Get('campaigns/:id')
  getCampaign(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('range') range: unknown,
  ) {
    const preset = parse(rangePresetSchema, range ?? '30d');
    return this.analytics.getCampaign(request.auth.organization.id, id, preset);
  }
}
