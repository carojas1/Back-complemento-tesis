import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { isGoodWord, WordAudio } from '../../common/audio/word-audio';
import { FileStorage } from '../../common/storage/file-storage';
import { MissingClip, VoicesRepository, VoiceSynthesizer } from '../domain/ports/voices.repository';

const extension = (path: string) => path.split('.').pop() ?? 'wav';
const attemptsPerWord = 3; // the service sometimes returns seconds of mumbling or near silence: it is requested again

// Spec 010 FR-005, in the queue worker (voice lane): registers the sample with the cloning service (the base
// voice) and, when the therapist asks, generates the audio of each board word, one at a time (the service
// synthesizes one at a time). If the service goes down midway, what was generated stays saved and the retry continues with what is missing.
// Each audio is saved trimmed and at the same volume as the others (common/audio), so the phrase sounds continuous. A
// word that comes out bad three times (over 3 s or with no audible voice) is left without audio and the tablet uses the
// system voice; «Generar voces» tries it again.
@Injectable()
export class VoiceJobRunner {
  private readonly logger = new Logger('VoiceJobRunner');

  constructor(
    private readonly voices: VoicesRepository,
    private readonly synthesizer: VoiceSynthesizer,
    private readonly storage: FileStorage,
    private readonly words: WordAudio,
  ) {}

  async run(type: 'VOICE_REGISTER' | 'VOICE_CLIPS', voiceId?: string) {
    if (voiceId) await (type === 'VOICE_REGISTER' ? this.register(voiceId) : this.clips(voiceId));
    return null; // leaves no file: the audios stay on the patient's board
  }

  // Service down on registration: the voice becomes FAILED with the reason (the therapist deletes it and creates it again).
  private async register(voiceId: string) {
    const voice = await this.voices.findById(voiceId);
    if (!voice || voice.status !== 'PENDING') return; // it was deleted or already registered
    try {
      const sample = await this.storage.get(voice.samplePath);
      const name = `muestra.${extension(voice.samplePath)}`;
      voice.registered(await this.synthesizer.register(sample, name, voice.ownerName, voice.transcript));
    } catch (e) {
      voice.failed(e instanceof Error ? e.message : String(e));
      this.logger.warn(`Voz ${voice.id}: ${voice.error}`);
    }
    await this.voices.save(voice);
  }

  // With no pending audios (or the voice was deleted) it finishes; a service error bubbles up to the worker, which retries.
  private async clips(voiceId: string) {
    const touched = new Set<string>();
    const failed = new Set<string>(); // words that did not come out right in this pass: not requested again in a loop
    try {
      for (;;) {
        const missing = (await this.voices.missingClips([voiceId], 10 + failed.size)).filter((c) => !failed.has(c.pictogramId));
        if (missing.length === 0) return;
        for (const clip of missing) {
          const audio = await this.goodWord(clip);
          if (!audio) {
            failed.add(clip.pictogramId);
            continue;
          }
          const path = `voices/${clip.voiceId}/${clip.pictogramId}-${randomUUID()}.mp3`;
          await this.storage.put(path, audio, 'audio/mpeg');
          const previous = await this.voices.saveClip({ ...clip, path }).catch(async (e: unknown) => {
            await this.storage.remove(path); // the voice was deleted while generating: no stray audio is left
            throw e;
          });
          if (previous) await this.storage.remove(previous);
          touched.add(clip.patientId);
        }
      }
    } finally {
      await this.voices.touchProfiles([...touched]); // the tablet downloads what has already been generated
    }
  }

  // The word's audio, trimmed and level; up to three requests to the service if it comes out over 3 s or nearly silent.
  private async goodWord(clip: MissingClip) {
    for (let attempt = 1; attempt <= attemptsPerWord; attempt++) {
      const raw = await this.synthesizer.synthesize(clip.engineVoiceId, clip.text);
      const word = await this.words.prepare(raw, 'mp3');
      if (!word) return raw; // could not be measured (ffmpeg is missing): saved as received, as before
      if (isGoodWord(word)) return word.audio;
      this.logger.warn(
        `Voz ${clip.voiceId}, «${clip.text}» (intento ${attempt}): ${word.seconds.toFixed(1)} s, ${word.loudestDb.toFixed(0)} dB`,
      );
    }
    return null;
  }
}
