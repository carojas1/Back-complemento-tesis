import { FileStorage } from '../../common/storage/file-storage';
import { Job, jobRules } from '../domain/entities/job.entity';

// Response of a job. `position`: how many are ahead (queued only). `downloadUrl`: signed URL valid 5 min, only
// for whoever requested it and while the file exists. Without the IP stored for the audit.
export async function toJobView(job: Job, storage: FileStorage, position: number | null = null) {
  const { from, to } = job.params;
  const available = job.status === 'DONE' && !!job.resultPath;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    patientCode: job.patientCode,
    params: { from: from ?? null, to: to ?? null },
    position: job.status === 'QUEUED' ? position : null,
    attempts: job.attempts,
    error: job.error,
    fileName: job.fileName,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    expiresAt: job.expiresAt,
    downloadUrl: available ? await storage.signedUrl(job.resultPath!, jobRules.linkSeconds) : null,
  };
}

export type JobView = Awaited<ReturnType<typeof toJobView>>;
