import { Module } from '@nestjs/common';
import { DataRequestsModule } from '../data-requests/data-requests.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { SessionsModule } from '../sessions/sessions.module';
import { VoicesModule } from '../voices/voices.module';
import { JobsUseCases } from './application/jobs.use-cases';
import { JobsWorker } from './application/jobs.worker';
import { JobHandlers, JobsRepository } from './domain/ports/jobs.repository';
import { DocumentJobHandlers } from './infrastructure/handlers/document-job.handlers';
import { QueueJobHandlers } from './infrastructure/handlers/queue-job.handlers';
import { JobsController } from './infrastructure/http/jobs.controller';
import { JobsPrismaRepository } from './infrastructure/prisma/jobs.prisma.repository';

// Background job queue. The API uses JobsUseCases (enqueue and query); JobsWorker only starts in the
// worker process (src/worker.ts), never in the API's. ProfilesModule: assignment. Sessions and DataRequests:
// the use cases that generate the PDF and the ZIP. Voices: register the base voice and generate its audio (voices enqueues it).
@Module({
  imports: [ProfilesModule, SessionsModule, DataRequestsModule, VoicesModule],
  controllers: [JobsController],
  providers: [
    { provide: JobsRepository, useClass: JobsPrismaRepository },
    DocumentJobHandlers,
    { provide: JobHandlers, useClass: QueueJobHandlers },
    JobsUseCases,
    JobsWorker,
  ],
  exports: [JobsWorker],
})
export class JobsModule {}
