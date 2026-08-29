import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createDatabase,
  dataQualityIssues,
  importRuns,
  organization,
} from '@campaign-iq/database';
import { NotFoundException } from '@nestjs/common';
import { ImportsService } from './imports.service.js';
import type { StorageService } from './storage.service.js';

const connection = createDatabase(
  process.env.DATABASE_URL ??
    'postgresql://campaign_iq:campaign_iq@localhost:5432/campaign_iq',
);
const firstOrganizationId = randomUUID();
const secondOrganizationId = randomUUID();

const storage = {
  createPresignedUpload: async () => ({
    url: 'http://localhost:9000/campaigniq-raw/signed',
    method: 'PUT' as const,
    headers: { 'content-type': 'text/csv' },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }),
  headObject: async () => ({ contentLength: 100, contentType: 'text/csv' }),
} as unknown as StorageService;

const service = new ImportsService(connection.db, storage);

describe('ImportsService', () => {
  beforeAll(async () => {
    await connection.db.insert(organization).values([
      {
        id: firstOrganizationId,
        name: 'Import Test One',
        slug: `import-test-${firstOrganizationId}`,
        createdAt: new Date(),
      },
      {
        id: secondOrganizationId,
        name: 'Import Test Two',
        slug: `import-test-${secondOrganizationId}`,
        createdAt: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    await connection.db
      .delete(organization)
      .where(eq(organization.id, firstOrganizationId));
    await connection.db
      .delete(organization)
      .where(eq(organization.id, secondOrganizationId));
    await connection.pool.end();
  });

  it('creates and lists imports only within the resolved organization', async () => {
    const created = await service.create(firstOrganizationId, {
      filename: 'campaigns.csv',
      contentType: 'text/csv',
      size: 100,
    });

    const firstList = await service.list(firstOrganizationId, {
      status: '',
      page: 1,
      pageSize: 20,
    });
    const secondList = await service.list(secondOrganizationId, {
      status: '',
      page: 1,
      pageSize: 20,
    });

    expect(created.import.status).toBe('uploading');
    expect(firstList.items.map((item) => item.id)).toContain(created.import.id);
    expect(secondList.items).toEqual([]);
    await expect(
      service.get(secondOrganizationId, created.import.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reconciles issue counts and valid percentage for an owned import', async () => {
    const [run] = await connection.db
      .insert(importRuns)
      .values({
        organizationId: firstOrganizationId,
        filename: 'quality.csv',
        status: 'completed',
        receivedRows: 10,
        loadedRows: 7,
        rejectedRows: 3,
      })
      .returning();
    await connection.db.insert(dataQualityIssues).values([
      {
        importRunId: run.id,
        issueType: 'invalid_date',
        field: 'date',
        count: 2,
      },
      {
        importRunId: run.id,
        issueType: 'duplicate_record',
        field: null,
        count: 1,
      },
    ]);

    const report = await service.getIssues(firstOrganizationId, run.id);

    expect(report.summary).toEqual({ validPercentage: 70, totalIssues: 3 });
    expect(report.issues.map((issue) => issue.count)).toEqual([2, 1]);
    await expect(
      service.getIssues(secondOrganizationId, run.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('moves an uploaded run to the ETL queue', async () => {
    const created = await service.create(firstOrganizationId, {
      filename: 'queued.csv',
      contentType: 'text/csv',
      size: 100,
    });

    const prepared = await service.prepareForProcessing(
      firstOrganizationId,
      created.import.id,
    );

    expect(prepared.shouldProcess).toBe(true);
    expect(prepared.record.status).toBe('received');
  });

  it('persists a failed direct upload for import history', async () => {
    const created = await service.create(firstOrganizationId, {
      filename: 'failed-upload.csv',
      contentType: 'text/csv',
      size: 100,
    });

    const failed = await service.markUploadFailed(
      firstOrganizationId,
      created.import.id,
    );

    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('Direct upload did not complete');
  });
});
