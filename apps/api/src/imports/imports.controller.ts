import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  createImportRequestSchema,
  importListQuerySchema,
} from '@campaign-iq/contracts';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ImportProcessingService } from './import-processing.service.js';
import { ImportsService } from './imports.service.js';

function parse<T>(
  schema: {
    safeParse: (value: unknown) => {
      success: boolean;
      data?: T;
      error?: unknown;
    };
  },
  value: unknown,
) {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error);
  return result.data as T;
}

@Controller('imports')
export class ImportsController {
  constructor(
    private readonly imports: ImportsService,
    private readonly processing: ImportProcessingService,
  ) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.imports.create(
      request.auth.organization.id,
      parse(createImportRequestSchema, body),
    );
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.imports.list(
      request.auth.organization.id,
      parse(importListQuerySchema, query),
    );
  }

  @Get(':id')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.imports.get(request.auth.organization.id, id);
  }

  @Post(':id/process')
  @HttpCode(HttpStatus.ACCEPTED)
  process(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.processing.start(request.auth.organization.id, id);
  }

  @Get(':id/issues')
  getIssues(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.imports.getIssues(request.auth.organization.id, id);
  }

  @Post(':id/upload-failed')
  markUploadFailed(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.imports.markUploadFailed(request.auth.organization.id, id);
  }
}
