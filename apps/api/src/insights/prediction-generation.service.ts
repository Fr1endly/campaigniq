import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env.js';

const execFileAsync = promisify(execFile);

@Injectable()
export class PredictionGenerationService {
  private readonly activeOrganizations = new Set<string>();
  private readonly logger = new Logger(PredictionGenerationService.name);

  start(organizationId: string) {
    if (this.activeOrganizations.has(organizationId)) {
      throw new ConflictException('Prediction generation is already running');
    }
    this.activeOrganizations.add(organizationId);
    void this.execute(organizationId);
    return { status: 'accepted' as const };
  }

  private async execute(organizationId: string) {
    try {
      await execFileAsync(
        env.ETL_PYTHON_BIN,
        [
          '-m',
          'campaigniq_etl',
          'generate-predictions',
          '--organization-id',
          organizationId,
        ],
        {
          env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
          maxBuffer: 1024 * 1024,
        },
      );
    } catch (error) {
      this.logger.error(
        `Prediction generation failed for organization ${organizationId}`,
        error,
      );
    } finally {
      this.activeOrganizations.delete(organizationId);
    }
  }
}
