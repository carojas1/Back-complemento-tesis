import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/base.exception';
import { FileStorage } from '../../common/storage/file-storage';
import { inInstitution } from '../../tenancy/tenancy';
import { documentTypes, Job, JobType, jobRules, lanes } from '../domain/entities/job.entity';
import { JobRequesterInactive } from '../domain/exceptions/jobs.exceptions';
import { JobHandlers, JobsRepository } from '../domain/ports/jobs.repository';
import { dayMs } from '../../common/time/center-time';

// Long enough to investigate an incident, and no longer: nothing else needs them once expired.
const credentialRetentionDays = 30;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const genericError = 'No se pudo generar el archivo. Intente de nuevo más tarde.';

// Queue worker: runs in its own process (src/worker.ts) so that drawing a PDF or generating voices does not slow the
// API or the tablets. Does one job at a time per lane (documents and voice); several processes share the queue
// without stepping on each other (FOR UPDATE SKIP LOCKED).
@Injectable()
export class JobsWorker implements OnModuleDestroy {
  private readonly logger = new Logger('JobsWorker');
  private running = false;
  private loops: Promise<void>[] = [];

  constructor(
    private readonly jobs: JobsRepository,
    private readonly handlers: JobHandlers,
    private readonly storage: FileStorage,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.loops = lanes.map((types) => this.work(types));
  }

  async onModuleDestroy() {
    this.running = false;
    await Promise.all(this.loops); // finishes the running jobs before closing
  }

  private async work(types: JobType[]) {
    let lastCleanup = 0;
    while (this.running) {
      const did = await this.runOnce(new Date(), types).catch((e: unknown) => {
        this.logger.error(`Worker failure: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      });
      if (types === documentTypes && Date.now() - lastCleanup > jobRules.cleanupMs) {
        lastCleanup = Date.now();
        await this.cleanup().catch((e: unknown) => this.logger.warn(`Cleanup: ${String(e)}`));
      }
      if (!did) await sleep(jobRules.pollMs);
    }
  }

  // Takes and does one job, if there is one. Returns whether it did any (tests call it directly).
  // The queue spans all institutions; the job runs inside its own (spec 113 FR-010).
  async runOnce(now = new Date(), types = documentTypes) {
    const job = await this.jobs.claimNext(types, now, new Date(now.getTime() + jobRules.leaseMs));
    if (!job) return false;
    await inInstitution(job.institutionId, () => this.run(job));
    return true;
  }

  private async run(job: Job) {
    if (job.attempts > jobRules.maxAttempts) {
      // Already attempted and the worker crashed each time: it is not retried forever.
      await this.jobs.fail(job.id, genericError, new Date());
      return;
    }
    const heartbeat = setInterval(
      () => void this.jobs.renew(job.id, new Date(Date.now() + jobRules.leaseMs)).catch(() => undefined),
      jobRules.heartbeatMs,
    );
    try {
      await this.process(job);
    } catch (e) {
      await this.failed(job, e);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async process(job: Job) {
    // What held at enqueue time is checked again: the account may have been deactivated while waiting
    // (the patient assignment is checked by each use case).
    if (!(await this.jobs.requesterActive(job.requestedBy))) throw new JobRequesterInactive();
    const result = await this.handlers.run(job);
    const finishedAt = new Date();
    if (!result) {
      await this.jobs.complete(job.id, { resultPath: null, fileName: null, finishedAt, expiresAt: null });
      return;
    }
    const resultPath = `jobs/${job.id}/${result.fileName}`;
    await this.storage.put(resultPath, result.file, result.contentType);
    const saved = await this.jobs.complete(job.id, {
      resultPath,
      fileName: result.fileName,
      finishedAt,
      expiresAt: new Date(finishedAt.getTime() + jobRules.resultTtlMs),
    });
    if (!saved) await this.storage.remove(resultPath); // the patient was deleted while it was being generated: no copy remains
  }

  // Business error (patient deleted or unassigned, inactive account): fails with its message and is not retried.
  // Other error (bucket, database): retried with increasing backoff up to `maxAttempts`.
  private async failed(job: Job, e: unknown) {
    if (e instanceof DomainException) return this.jobs.fail(job.id, e.safeMessage ?? e.message, new Date());
    this.logger.warn(`Job ${job.id} (${job.type}), attempt ${job.attempts}: ${e instanceof Error ? e.message : String(e)}`);
    if (job.attempts >= jobRules.maxAttempts) return this.jobs.fail(job.id, genericError, new Date());
    await this.jobs.retry(job.id, genericError, new Date(Date.now() + jobRules.retryDelayMs(job.attempts)));
  }

  // Deletes expired files from the bucket; the job stays as history without a download.
  async cleanup(now = new Date()) {
    for (const job of await this.jobs.expiredResults(now, 50)) {
      await this.storage.remove(job.resultPath!).catch(() => undefined);
      await this.jobs.clearResult(job.id);
    }
    await this.jobs.purgeExpiredCredentials(new Date(now.getTime() - credentialRetentionDays * dayMs));
  }
}
