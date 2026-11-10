// Heavy background job: the API enqueues it and responds right away with its id; the worker does it one at a time per lane.
export type JobType = 'REPORT_PDF' | 'EXPORT_ZIP' | 'VOICE_REGISTER' | 'VOICE_CLIPS';
export type JobStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELED';

// Parameters stored with the job. `ip` belongs to whoever requested it (for the audit) and is never returned.
// `voiceId`: the cloned voice of the voice jobs.
export type JobParams = { from?: string; to?: string; ip?: string; voiceId?: string };

export interface Job {
  id: string;
  institutionId: string; // the worker runs it inside it (spec 113)
  type: JobType;
  status: JobStatus;
  requestedBy: string;
  patientId: string | null;
  patientCode: string;
  params: JobParams;
  resultPath: string | null;
  fileName: string | null;
  error: string | null;
  attempts: number;
  runAfter: Date;
  lockedUntil: Date | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  expiresAt: Date | null;
}

// The file a finished job leaves; voice jobs leave no file (they store their audio on the board).
export type JobResult = { file: Buffer; fileName: string; contentType: string } | null;

export const jobRules = {
  maxAttempts: 3, // transient errors (bucket, database): retried; a business error fails at once
  retryDelayMs: (attempt: number) => 30_000 * 2 ** (attempt - 1), // 30 s, 1 min, 2 min
  leaseMs: 2 * 60_000, // if the worker crashes, after this time another one picks it up
  heartbeatMs: 30_000, // the worker renews the lease while working
  resultTtlMs: 24 * 60 * 60_000, // the file can be downloaded for 24 h and is then deleted
  linkSeconds: 300, // the signed download URL lasts 5 min
  pollMs: 1_500, // with no jobs, the worker checks the queue again every 1.5 s
  cleanupMs: 5 * 60_000, // how often it deletes expired files
};

export const activeStatuses: JobStatus[] = ['QUEUED', 'RUNNING'];

// Lanes: each does one job at a time. Voice is separate because generating a board takes minutes and must not
// delay a PDF; the cloning service also synthesizes one word at a time.
export const documentTypes: JobType[] = ['REPORT_PDF', 'EXPORT_ZIP'];
export const voiceTypes: JobType[] = ['VOICE_REGISTER', 'VOICE_CLIPS'];
export const lanes = [documentTypes, voiceTypes];
