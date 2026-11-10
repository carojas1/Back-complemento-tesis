import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Voice } from '../../domain/entities/voice.entity';
import { VoiceJobs } from '../../domain/ports/voices.repository';

const active = { in: ['QUEUED' as const, 'RUNNING' as const] };

// Enqueues in the Job table (the same queue as the PDF and the ZIP); the worker picks it up through the voice lane.
@Injectable()
export class VoiceJobsPrisma extends VoiceJobs {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async register(voice: Voice, requestedBy: string) {
    await this.create('VOICE_REGISTER', voice, requestedBy);
  }

  async generate(voice: Voice, requestedBy: string) {
    return (await this.activeGeneration(voice.id)) ?? (await this.create('VOICE_CLIPS', voice, requestedBy));
  }

  async activeGeneration(voiceId: string) {
    const job = await this.prisma.job.findFirst({
      where: { type: 'VOICE_CLIPS', status: active, params: { path: ['voiceId'], equals: voiceId } },
      select: { id: true },
    });
    return job?.id ?? null;
  }

  private async create(type: 'VOICE_REGISTER' | 'VOICE_CLIPS', voice: Voice, requestedBy: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: voice.patientId }, select: { code: true } });
    const job = await this.prisma.job.create({
      data: {
        type,
        requestedBy,
        patientId: voice.patientId,
        patientCode: patient?.code ?? '',
        params: { voiceId: voice.id },
        runAfter: new Date(),
      },
      select: { id: true },
    });
    return job.id;
  }
}
