import { Module } from '@nestjs/common';
import { ImportProcessingService } from './import-processing.service.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';
import { StorageService } from './storage.service.js';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, ImportProcessingService, StorageService],
})
export class ImportsModule {}
