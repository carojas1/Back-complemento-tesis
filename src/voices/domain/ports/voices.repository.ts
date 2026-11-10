import { Voice } from '../entities/voice.entity';

// Profile word that does not yet have audio with the cloned voice (or whose label changed).
export interface MissingClip {
  voiceId: string;
  engineVoiceId: string;
  patientId: string;
  pictogramId: string;
  text: string;
}

export abstract class VoicesRepository {
  abstract findByPatient(patientId: string): Promise<Voice | null>;
  abstract findById(id: string): Promise<Voice | null>;
  abstract save(voice: Voice): Promise<void>;
  // Deletes the voice and its audios; if the profile used it, it goes back to the system voice. Returns the paths to delete from the bucket.
  abstract delete(voice: Voice): Promise<string[]>;
  // Only for the requested voices (generation is on the therapist's request).
  abstract missingClips(voiceIds: string[], limit: number): Promise<MissingClip[]>;
  // Saves a word's audio; returns the previous path (if any) so it can be deleted from the bucket.
  abstract saveClip(clip: { voiceId: string; pictogramId: string; text: string; path: string }): Promise<string | null>;
  abstract progress(voiceId: string): Promise<{ ready: number; total: number }>;
  // Bumps the profile version so the tablet downloads the new audios.
  abstract touchProfiles(patientIds: string[]): Promise<void>;
}

// Queue jobs (jobs module) for the voice: register the base voice and generate the board audios.
export abstract class VoiceJobs {
  abstract register(voice: Voice, requestedBy: string): Promise<void>;
  // Queues the generation if none is in progress; returns the job id to follow it with GET /jobs/:id.
  abstract generate(voice: Voice, requestedBy: string): Promise<string>;
  // Id of this voice's queued or in-progress generation, if any.
  abstract activeGeneration(voiceId: string): Promise<string | null>;
}

// Voice cloning service (spec 010 FR-005): currently `Clonar-voz` (Qwen3-TTS + llama.cpp) over HTTP.
export abstract class VoiceSynthesizer {
  // Registers the sample (with its transcript, if any) and returns the voice id in the service.
  abstract register(sample: Buffer, fileName: string, name: string, transcript?: string | null): Promise<string>;
  // Speaks `text` with that voice; returns the audio as mp3.
  abstract synthesize(engineVoiceId: string, text: string): Promise<Buffer>;
}
