import { FileStorage } from '../../common/storage/file-storage';
import { Voice } from '../domain/entities/voice.entity';

// What the therapist sees in the panel: who lends the voice, the status, how many words have audio, how many are missing
// (new or renamed pictograms) and whether they are being generated (`jobId`: the queue job, for GET /jobs/:id).
export async function toVoiceView(voice: Voice, progress: { ready: number; total: number }, storage: FileStorage, jobId: string | null) {
  const { ownerName, relationship, consentDate, transcript, status, error, createdAt } = voice;
  return {
    ownerName,
    relationship,
    transcript,
    consentDate: consentDate.toISOString().slice(0, 10),
    status,
    error,
    createdAt,
    progress,
    missing: progress.total - progress.ready,
    generating: !!jobId,
    jobId,
    sampleUrl: await storage.signedUrl(voice.samplePath),
  };
}
