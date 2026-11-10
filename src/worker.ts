import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JobsWorker } from './jobs/application/jobs.worker';
import { WorkerModule } from './worker.module';

// Queue worker (report PDF, data ZIP and cloned voice), in a process separate from the API:
// `pnpm run start:worker` (development) or `node dist/worker` (production). One job at a time per lane and process.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks(); // SIGTERM: finishes the job in progress and closes
  app.get(JobsWorker).start();
  Logger.log('Queue worker running (documents and voice)', 'Worker');
}

bootstrap().catch((error) => {
  Logger.error('Could not start the worker', error, 'Worker');
  process.exit(1);
});
