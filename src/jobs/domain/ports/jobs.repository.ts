import { Page, PageRequest } from '../../../common/pagination/page';
import { Job, JobParams, JobResult, JobType } from '../entities/job.entity';

export type NewJob = { type: JobType; requestedBy: string; patientId: string; patientCode: string; params: JobParams };

export abstract class JobsRepository {
  abstract patientCode(patientId: string): Promise<string | null>;
  // An identical one (same person, type, patient and period) that has not finished: a double tap does not enqueue two.
  abstract findActive(job: Omit<NewJob, 'patientCode'>): Promise<Job | null>;
  abstract create(job: NewJob): Promise<Job>;
  abstract find(id: string): Promise<Job | null>;
  abstract listByRequester(userId: string, page: PageRequest): Promise<Page<Job>>;
  // How many jobs in the same lane are ahead of this one (the running ones and the older queued ones).
  abstract ahead(job: Job, types: JobType[]): Promise<number>;
  // Goes QUEUED → CANCELED only if still queued; returns whether it succeeded.
  abstract cancel(id: string, now: Date): Promise<boolean>;

  // Worker: takes the next available (or one whose lease expired) with FOR UPDATE SKIP LOCKED.
  abstract claimNext(types: JobType[], now: Date, lockedUntil: Date): Promise<Job | null>;
  abstract renew(id: string, lockedUntil: Date): Promise<void>;
  // Returns false if the job no longer exists (the patient was deleted while it was being generated).
  abstract complete(
    id: string,
    result: { resultPath: string | null; fileName: string | null; finishedAt: Date; expiresAt: Date | null },
  ): Promise<boolean>;
  abstract retry(id: string, error: string, runAfter: Date): Promise<void>;
  abstract fail(id: string, error: string, finishedAt: Date): Promise<void>;
  abstract expiredResults(now: Date, limit: number): Promise<Job[]>;
  abstract clearResult(id: string): Promise<void>;
  // Sign-in records past their use: expired tokens and reset links, and old failed attempts.
  abstract purgeExpiredCredentials(before: Date): Promise<void>;
  abstract requesterActive(userId: string): Promise<boolean>;
}

// What the worker knows how to do for each job type (implemented by the modules that own the data). Documents
// return their file; voice, null.
export abstract class JobHandlers {
  abstract run(job: Job): Promise<JobResult>;
}
