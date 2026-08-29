import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { ImportRun } from '@campaign-iq/contracts';
import { env } from '../config/env.js';
import { ImportsService } from './imports.service.js';
import { StorageService } from './storage.service.js';

const execFileAsync = promisify(execFile);

@Injectable()
export class ImportProcessingService {
  private readonly activeImports = new Set<string>();
  private readonly logger = new Logger(ImportProcessingService.name);

  constructor(
    private readonly imports: ImportsService,
    private readonly storage: StorageService,
  ) {}

  async start(organizationId: string, id: string): Promise<ImportRun> {
    if (this.activeImports.has(id))
      throw new ConflictException('Import is already processing');
    const { record, shouldProcess } = await this.imports.prepareForProcessing(
      organizationId,
      id,
    );
    if (!shouldProcess) return this.imports.get(organizationId, id);

    this.activeImports.add(id);
    void this.execute(
      organizationId,
      record.id,
      record.filename,
      record.s3Key!,
    );
    return this.imports.get(organizationId, id);
  }

  private async execute(
    organizationId: string,
    id: string,
    filename: string,
    objectKey: string,
  ) {
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), 'campaigniq-import-'));
      const destination = join(directory, basename(filename));
      await this.storage.downloadObject(objectKey, destination);
      await execFileAsync(
        env.ETL_PYTHON_BIN,
        [
          '-m',
          'campaigniq_etl',
          'load',
          '--file',
          destination,
          '--organization-id',
          organizationId,
          '--import-run-id',
          id,
        ],
        {
          env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
          maxBuffer: 1024 * 1024,
        },
      );
    } catch (error) {
      try {
        await this.imports.markOrchestrationFailed(
          organizationId,
          id,
          this.processingErrorMessage(error),
        );
      } catch (markError) {
        this.logger.error(
          `Could not persist failure for import ${id}`,
          markError,
        );
      }
    } finally {
      this.activeImports.delete(id);
      if (directory) {
        await rm(directory, { recursive: true, force: true }).catch(
          (cleanupError: unknown) => {
            this.logger.warn(
              `Could not remove temporary import directory ${directory}`,
              cleanupError,
            );
          },
        );
      }
    }
  }

  private processingErrorMessage(error: unknown) {
    if (error && typeof error === 'object' && 'stderr' in error) {
      const stderr = String(
        (error as { stderr?: unknown }).stderr ?? '',
      ).trim();
      if (stderr) {
        try {
          const parsed = JSON.parse(stderr) as { error_message?: string };
          if (parsed.error_message) return parsed.error_message;
        } catch {
          return stderr.split('\n')[0].slice(0, 1000);
        }
      }
    }
    return error instanceof Error ? error.message : 'Import processing failed';
  }
}
