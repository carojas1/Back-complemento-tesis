import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { isGoodWord, WordAudio } from '../common/audio/word-audio';
import { FileStorage } from '../common/storage/file-storage';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceJobs, VoicesRepository } from '../voices/domain/ports/voices.repository';
import { WorkerModule } from '../worker.module';

// One-off (agreed 2026-10-25), over the already stored audios of the cloned voice and of the recordings:
// - leaves them as the new ones come out: without edge silence and at a level volume (common/audio);
// - the cloned-voice ones that came out bad (over 3 s or near silence) are deleted and «Generar voces» is queued for their
//   voice: the worker requests them again from the cloning service, with the same check.
// Each changed audio is uploaded under a new name (the tablets store audios by name and would not download it again) and the
// previous one is deleted. Uses the .env database and bucket. `node dist/scripts/fix-word-audio --dry-run` only counts.
// Running it again only touches what is still wrong.
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn'] }); // without starting the queue
  const prisma = app.get(PrismaService);
  const storage = app.get(FileStorage);
  const words = app.get(WordAudio, { strict: false });
  const voices = app.get(VoicesRepository, { strict: false });
  const jobs = app.get(VoiceJobs, { strict: false });
  const touched = new Set<string>();
  const regenerate = new Set<string>();
  const count = { clips: 0, clipsFixed: 0, clipsBad: 0, recordings: 0, recordingsFixed: 0, unreadable: 0 };

  const clips = await prisma.voiceClip.findMany({
    select: { voiceId: true, pictogramId: true, text: true, path: true, voice: { select: { patientId: true } } },
  });
  for (const clip of clips) {
    count.clips++;
    const where = { voiceId_pictogramId: { voiceId: clip.voiceId, pictogramId: clip.pictogramId } };
    const audio = await storage.get(clip.path);
    const word = await words.prepare(audio, 'mp3');
    if (!word) {
      count.unreadable++;
      continue;
    }
    if (!isGoodWord(word)) {
      count.clipsBad++;
      Logger.warn(`«${clip.text}» (voz ${clip.voiceId}): ${word.seconds.toFixed(1)} s, ${word.loudestDb.toFixed(0)} dB`, 'ArreglarAudios');
      if (dryRun) continue;
      await prisma.voiceClip.delete({ where }); // stays pending: «Generar voces» requests it again
      await storage.remove(clip.path);
      regenerate.add(clip.voiceId);
      touched.add(clip.voice.patientId);
      continue;
    }
    if (word.audio === audio) continue;
    count.clipsFixed++;
    if (dryRun) continue;
    const path = `voices/${clip.voiceId}/${clip.pictogramId}-${randomUUID()}.mp3`;
    await storage.put(path, word.audio, 'audio/mpeg');
    await prisma.voiceClip.update({ where, data: { path } });
    await storage.remove(clip.path);
    touched.add(clip.voice.patientId);
  }

  const recordings = await prisma.profilePictogram.findMany({
    where: { recordingPath: { not: null } },
    select: { id: true, recordingPath: true, profile: { select: { patientId: true } } },
  });
  for (const recording of recordings) {
    count.recordings++;
    const audio = await storage.get(recording.recordingPath!);
    const word = await words.prepare(audio, 'm4a');
    if (!word || word.audio === audio) continue; // the recording is the therapist's: it is leveled, not discarded
    count.recordingsFixed++;
    if (dryRun) continue;
    const path = `recordings/${recording.id}-${randomUUID()}.m4a`;
    await storage.put(path, word.audio, 'audio/mp4');
    await prisma.profilePictogram.update({ where: { id: recording.id }, data: { recordingPath: path } });
    await storage.remove(recording.recordingPath!);
    touched.add(recording.profile.patientId);
  }

  if (!dryRun) {
    await voices.touchProfiles([...touched]); // the tablets download the new audios on the next sync
    for (const voiceId of regenerate) {
      const voice = await voices.findById(voiceId);
      if (voice?.status === 'READY') await jobs.generate(voice, voice.createdById);
    }
  }
  // To standard output: the context was created with only errors and warnings, so startup does not flood the console.
  const summary = { ...count, perfiles: touched.size, vocesARegenerar: regenerate.size };
  process.stdout.write(`${dryRun ? 'Dry run, no changes' : 'Done'}: ${JSON.stringify(summary)}\n`);
  await app.close();
}

main().catch((error) => {
  Logger.error('Could not fix the audios', error, 'ArreglarAudios');
  process.exit(1);
});
