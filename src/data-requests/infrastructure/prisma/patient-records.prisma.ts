import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { anonymousPatientCode } from '../../domain/entities/data-request.entity';
import { PatientExport, PatientRecords } from '../../domain/ports/data-requests.repository';

const ref = { id: true, code: true, createdAt: true } as const;

@Injectable()
export class PatientRecordsPrisma extends PatientRecords {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // The anonymous technical patient is not a person: it accepts no requests.
  findById(id: string) {
    return this.prisma.patient.findFirst({ where: { id, code: { not: anonymousPatientCode } }, select: ref });
  }

  findByCode(code: string) {
    return code === anonymousPatientCode ? Promise.resolve(null) : this.prisma.patient.findFirst({ where: { code }, select: ref });
  }

  async exportData(patientId: string): Promise<PatientExport> {
    const p = await this.prisma.patient.findUniqueOrThrow({
      where: { id: patientId },
      include: {
        avatar: { select: { name: true } },
        diagnosis: { select: { name: true } },
        conditions: { select: { condition: { select: { name: true } } } },
        therapists: { select: { therapist: { select: { name: true } } } },
        profile: { select: { gridSize: true, activityLevel: true, speechRate: true, sentenceBarEnabled: true, voice: true } },
        voice: { select: { ownerName: true, relationship: true, consentDate: true, status: true } },
        notes: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true } } } },
        goals: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true } } } },
        homeworks: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { name: true } },
            pictograms: { orderBy: { sortOrder: 'asc' }, select: { pictogram: { select: { label: true } } } },
          },
        },
      },
    });
    const sessions = await this.prisma.session.findMany({
      where: { patientId },
      orderBy: { startedAt: 'asc' },
      select: {
        id: true,
        kind: true,
        startedAt: true,
        endedAt: true,
        device: { select: { name: true } },
        therapist: { select: { name: true } },
        guardian: { select: { name: true } },
        events: { orderBy: { occurredAt: 'asc' }, select: { occurredAt: true, type: true, payload: true } },
        activityRuns: { select: { type: true, results: { orderBy: { answeredAt: 'asc' } } } },
      },
    });
    const raw = sessions.flatMap((s) =>
      s.activityRuns.flatMap((run) => run.results.map((r) => ({ ...r, sessionId: s.id, activityType: run.type }))),
    );
    const ids = [...new Set(raw.flatMap((r) => [r.targetPictogramId, r.chosenPictogramId]))];
    const labels = new Map(
      (await this.prisma.pictogram.findMany({ where: { id: { in: ids } }, select: { id: true, label: true } })).map((x) => [x.id, x.label]),
    );
    return {
      patient: {
        code: p.code,
        firstNames: p.firstNames,
        lastNames: p.lastNames,
        birthDate: p.birthDate,
        guardianName: p.guardianName,
        guardianPhone: p.guardianPhone,
        consentDate: p.consentDate,
        status: p.status,
        dischargedAt: p.dischargedAt,
        createdAt: p.createdAt,
        avatar: p.avatar.name,
        diagnosis: p.diagnosis?.name ?? null,
        conditions: p.conditions.map((c) => c.condition.name),
        therapists: p.therapists.map((t) => t.therapist.name),
        profile: p.profile,
        voice: p.voice,
      },
      notes: p.notes.map((n) => ({
        createdAt: n.createdAt,
        editedAt: n.editedAt,
        authorName: n.author.name,
        sessionId: n.sessionId,
        text: n.text,
      })),
      goals: p.goals.map((g) => ({
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        authorName: g.author.name,
        text: g.text,
        status: g.status,
        targetDate: g.targetDate,
      })),
      // Spec 112: homework and practice at home (no tablet, with the guardian who did it).
      homework: p.homeworks.map((h) => ({
        createdAt: h.createdAt,
        authorName: h.author.name,
        instructions: h.instructions,
        dueDate: h.dueDate,
        pictograms: h.pictograms.map((x) => x.pictogram.label),
        withActivity: h.withActivity,
        completedAt: h.completedAt,
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        kind: s.kind,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        deviceName: s.device?.name ?? null,
        therapistName: s.therapist?.name ?? null,
        guardianName: s.guardian?.name ?? null,
      })),
      events: sessions.flatMap((s) => s.events.map((e) => ({ sessionId: s.id, ...e }))),
      results: raw.map((r) => ({
        sessionId: r.sessionId,
        activityType: r.activityType,
        answeredAt: r.answeredAt,
        target: labels.get(r.targetPictogramId) ?? r.targetPictogramId,
        chosen: labels.get(r.chosenPictogramId) ?? r.chosenPictogramId,
        correct: r.correct,
        firstAttempt: r.firstAttempt,
        responseMs: r.responseMs,
      })),
    };
  }
}
