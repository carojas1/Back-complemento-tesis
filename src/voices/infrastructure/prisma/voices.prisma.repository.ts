import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type * as db from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { Voice, VoiceStatus } from '../../domain/entities/voice.entity';
import { MissingClip, VoicesRepository } from '../../domain/ports/voices.repository';
import { nextSyncVersion } from '../../../prisma/sync-version';

const toDomain = (row: db.Voice) => Voice.reconstitute({ ...row, status: row.status as VoiceStatus });

@Injectable()
export class VoicesPrismaRepository extends VoicesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByPatient(patientId: string) {
    const row = await this.prisma.voice.findUnique({ where: { patientId } });
    return row ? toDomain(row) : null;
  }

  async findById(id: string) {
    const row = await this.prisma.voice.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async save(voice: Voice) {
    const {
      id,
      patientId,
      ownerName,
      relationship,
      consentDate,
      samplePath,
      transcript,
      engineVoiceId,
      status,
      error,
      createdById,
      createdAt,
    } = voice;
    const data = { engineVoiceId, status, error };
    await this.prisma.voice.upsert({
      where: { id },
      create: { id, patientId, ownerName, relationship, consentDate, samplePath, transcript, createdById, createdAt, ...data },
      update: data,
    });
  }

  async delete(voice: Voice) {
    const clips = await this.prisma.voiceClip.findMany({ where: { voiceId: voice.id }, select: { path: true } });
    await this.prisma.$transaction([
      this.prisma.voice.delete({ where: { id: voice.id } }),
      this.prisma.profile.updateMany({ where: { patientId: voice.patientId, voice: 'CLONED' }, data: { voice: 'SYSTEM' } }),
    ]);
    await this.touchProfiles([voice.patientId]);
    return [voice.samplePath, ...clips.map((c) => c.path)];
  }

  // Words of the profiles with a ready voice that have no audio, or whose audio was generated with another label.
  missingClips(voiceIds: string[], limit: number) {
    if (voiceIds.length === 0) return Promise.resolve([]);
    return this.prisma.$queryRaw<MissingClip[]>`
      SELECT DISTINCT v.id AS "voiceId", v."engineVoiceId", v."patientId", p.id AS "pictogramId", p.label AS text
      FROM "Voice" v
      JOIN "Profile" pr ON pr."patientId" = v."patientId"
      JOIN "ProfilePictogram" pp ON pp."profileId" = pr.id
      JOIN "Pictogram" p ON p.id = pp."pictogramId"
      LEFT JOIN "VoiceClip" c ON c."voiceId" = v.id AND c."pictogramId" = p.id AND c.text = p.label
      WHERE v.id IN (${Prisma.join(voiceIds)}) AND v.status = 'READY' AND c."voiceId" IS NULL
      LIMIT ${limit}`;
  }

  async saveClip(clip: { voiceId: string; pictogramId: string; text: string; path: string }) {
    const key = { voiceId_pictogramId: { voiceId: clip.voiceId, pictogramId: clip.pictogramId } };
    const previous = await this.prisma.voiceClip.findUnique({ where: key, select: { path: true } });
    const { voiceId, pictogramId, text, path } = clip;
    await this.prisma.voiceClip.upsert({ where: key, create: { voiceId, pictogramId, text, path }, update: { text, path } });
    return previous?.path ?? null;
  }

  async progress(voiceId: string) {
    const [row] = await this.prisma.$queryRaw<{ ready: number; total: number }[]>`
      SELECT count(DISTINCT pp."pictogramId")::int AS total, count(DISTINCT c."pictogramId")::int AS ready
      FROM "Voice" v
      JOIN "Profile" pr ON pr."patientId" = v."patientId"
      JOIN "ProfilePictogram" pp ON pp."profileId" = pr.id
      JOIN "Pictogram" p ON p.id = pp."pictogramId"
      LEFT JOIN "VoiceClip" c ON c."voiceId" = v.id AND c."pictogramId" = p.id AND c.text = p.label
      WHERE v.id = ${voiceId}`;
    return row ?? { ready: 0, total: 0 };
  }

  async touchProfiles(patientIds: string[]) {
    if (patientIds.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      const value = await nextSyncVersion(tx);
      await tx.profile.updateMany({ where: { patientId: { in: patientIds } }, data: { syncVersion: value } });
    });
  }
}
