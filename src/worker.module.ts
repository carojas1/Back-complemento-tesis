import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from './common/storage/storage.module';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './prisma/prisma.module';

// Queue worker process: what is needed to generate PDFs, ZIPs and voices (no HTTP or WebSocket).
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, StorageModule, JobsModule] })
export class WorkerModule {}
