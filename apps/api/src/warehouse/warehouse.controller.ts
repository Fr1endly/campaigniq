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
import { WarehouseService } from './warehouse.service.js';

@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}

  @Get('status')
  getStatus(@Req() request: AuthenticatedRequest) {
    return this.warehouse.getStatus(request.auth.organization.id);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  refresh(@Req() request: AuthenticatedRequest) {
    if (!['owner', 'admin'].includes(request.auth.role)) {
      throw new ForbiddenException(
        'Only organization administrators can refresh reporting',
      );
    }
    return this.warehouse.startRefresh();
  }
}
