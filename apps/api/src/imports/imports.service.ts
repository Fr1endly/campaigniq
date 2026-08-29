import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  dataQualityIssues,
  importRuns,
  type importStatus,
} from '@campaign-iq/database/schema';
import type {
  CreateImportRequest,
  CreateImportResponse,
  ImportIssuesResponse,
  ImportListQuery,
  ImportListResponse,
  ImportRun,
} from '@campaign-iq/contracts';
import { env } from '../config/env.js';
import { InjectDatabase, type Database } from '../database/database.module.js';
import { StorageService } from './storage.service.js';

type ImportRecord = typeof importRuns.$inferSelect;
type ImportStatus = (typeof importStatus.enumValues)[number];

@Injectable()
export class ImportsService {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  async create(
    organizationId: string,
    input: CreateImportRequest,
  ): Promise<CreateImportResponse> {
    if (input.size > env.IMPORT_MAX_BYTES) {
      throw new BadRequestException(
        `CSV files must be ${this.maxFileSizeLabel()} or smaller`,
      );
    }

    const id = randomUUID();
    const objectKey = `raw/${organizationId}/${id}/${input.filename}`;
    const upload = await this.storage.createPresignedUpload(
      objectKey,
      input.contentType,
    );
    const [created] = await this.db
      .insert(importRuns)
      .values({
        id,
        organizationId,
        filename: input.filename,
        status: 'uploading',
        s3Key: objectKey,
      })
      .returning();

    return { import: this.toImportRun(created), upload };
  }

  async list(
    organizationId: string,
    query: ImportListQuery,
  ): Promise<ImportListResponse> {
    const conditions = [eq(importRuns.organizationId, organizationId)];
    if (query.status) conditions.push(eq(importRuns.status, query.status));
    const where = and(...conditions);
    const offset = (query.page - 1) * query.pageSize;
    const [records, countRows] = await Promise.all([
      this.db
        .select()
        .from(importRuns)
        .where(where)
        .orderBy(desc(importRuns.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(importRuns)
        .where(where),
    ]);
    const totalItems = countRows[0]?.count ?? 0;
    return {
      items: records.map((record) => this.toImportRun(record)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async get(organizationId: string, id: string): Promise<ImportRun> {
    return this.toImportRun(await this.getRecord(organizationId, id));
  }

  async getIssues(
    organizationId: string,
    id: string,
  ): Promise<ImportIssuesResponse> {
    const record = await this.getRecord(organizationId, id);
    const issues = await this.db
      .select()
      .from(dataQualityIssues)
      .where(eq(dataQualityIssues.importRunId, record.id))
      .orderBy(desc(dataQualityIssues.count), dataQualityIssues.issueType);
    const totalIssues = issues.reduce((total, issue) => total + issue.count, 0);
    const validPercentage =
      record.receivedRows === 0
        ? null
        : Math.round((record.loadedRows / record.receivedRows) * 10_000) / 100;

    return {
      import: this.toImportRun(record),
      issues: issues.map((issue) => ({
        id: issue.id,
        importRunId: issue.importRunId,
        issueType: issue.issueType,
        field: issue.field,
        count: issue.count,
        createdAt: issue.createdAt.toISOString(),
      })),
      summary: { validPercentage, totalIssues },
    };
  }

  async prepareForProcessing(organizationId: string, id: string) {
    const record = await this.getRecord(organizationId, id);
    if (record.status === 'completed') return { record, shouldProcess: false };
    if (record.status === 'processing') {
      throw new ConflictException('Import is already processing');
    }
    if (!record.s3Key)
      throw new ConflictException('Import has no object-storage key');

    const metadata = await this.storage.headObject(record.s3Key);
    if (!metadata)
      throw new ConflictException('Upload the CSV before starting processing');
    if (metadata.contentLength <= 0)
      throw new BadRequestException('The uploaded CSV is empty');
    if (metadata.contentLength > env.IMPORT_MAX_BYTES) {
      throw new BadRequestException(
        `CSV files must be ${this.maxFileSizeLabel()} or smaller`,
      );
    }

    const [prepared] = await this.db
      .update(importRuns)
      .set({
        status: 'received',
        receivedRows: 0,
        loadedRows: 0,
        rejectedRows: 0,
        insertedRows: null,
        updatedRows: null,
        unchangedRows: null,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        errorMessage: null,
      })
      .where(
        and(
          eq(importRuns.id, id),
          eq(importRuns.organizationId, organizationId),
          inArray(importRuns.status, ['received', 'uploading', 'failed']),
        ),
      )
      .returning();
    if (!prepared)
      throw new ConflictException(
        'Import state changed; refresh and try again',
      );
    return { record: prepared, shouldProcess: true };
  }

  async markOrchestrationFailed(
    organizationId: string,
    id: string,
    message: string,
  ) {
    await this.db
      .update(importRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage: message.slice(0, 1000),
      })
      .where(
        and(
          eq(importRuns.id, id),
          eq(importRuns.organizationId, organizationId),
          inArray(importRuns.status, ['received', 'uploading']),
        ),
      );
  }

  async markUploadFailed(organizationId: string, id: string) {
    const [failed] = await this.db
      .update(importRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Direct upload did not complete',
      })
      .where(
        and(
          eq(importRuns.id, id),
          eq(importRuns.organizationId, organizationId),
          eq(importRuns.status, 'uploading'),
        ),
      )
      .returning();
    if (!failed) await this.getRecord(organizationId, id);
    return this.toImportRun(
      failed ?? (await this.getRecord(organizationId, id)),
    );
  }

  async getRecord(organizationId: string, id: string): Promise<ImportRecord> {
    const [record] = await this.db
      .select()
      .from(importRuns)
      .where(
        and(
          eq(importRuns.id, id),
          eq(importRuns.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!record) throw new NotFoundException('Import not found');
    return record;
  }

  private toImportRun(record: ImportRecord): ImportRun {
    return {
      id: record.id,
      filename: record.filename,
      status: record.status as ImportStatus,
      receivedRows: record.receivedRows,
      loadedRows: record.loadedRows,
      rejectedRows: record.rejectedRows,
      insertedRows: record.insertedRows,
      updatedRows: record.updatedRows,
      unchangedRows: record.unchangedRows,
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      durationMs: record.durationMs,
      errorMessage: record.errorMessage,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private maxFileSizeLabel() {
    return `${Math.floor(env.IMPORT_MAX_BYTES / (1024 * 1024))} MB`;
  }
}
