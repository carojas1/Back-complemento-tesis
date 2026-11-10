import { Injectable } from '@nestjs/common';
import { eventProblem } from '../domain/event-types';
import { BatchTooLarge } from '../domain/exceptions/sync.exceptions';
import { BatchSource, LiveFeed, SessionRow, SyncBatch, SyncRepository } from '../domain/ports/sync.repository';

type Rejection = {
  id: string;
  reason: 'UnknownPatientCode' | 'UnknownSession' | 'UnknownRun' | 'UnknownEventType' | 'InvalidEventPayload';
};

// POST /sync/batch and the WebSocket (spec 106): saves what is new, ignores what is repeated and says which UUIDs were accepted.
// The response (or the ack) goes out after writing to PostgreSQL: the tablet only marks as sent what was accepted.
// POST /family/practice (spec 112) uses the same batch: home practice by a guardian, only for their children and without
// tablet or therapist; it does not show in the live panel (it belongs to the Center).
@Injectable()
export class ProcessBatchUseCase {
  constructor(
    private readonly sync: SyncRepository,
    private readonly live: LiveFeed,
  ) {}

  async execute(source: BatchSource, batch: SyncBatch) {
    const total = batch.sessions.length + batch.events.length + batch.activityRuns.length + batch.activityResults.length;
    if (total > 100) throw new BatchTooLarge();
    const rejected: Rejection[] = [];

    // Sessions: the patient must exist and be active, or have started before being discharged (agreed 2026-10-21).
    const patients = new Map((await this.sync.findPatients(batch.sessions.map((s) => s.patientCode))).map((p) => [p.code, p]));
    const guardianId = 'guardianId' in source ? source.guardianId : null;
    const deviceId = 'deviceId' in source ? source.deviceId : null;
    const children = guardianId ? new Set(await this.sync.guardianPatientIds(guardianId)) : null;
    const homeworkIds = batch.sessions.flatMap((s) => (s.homeworkId ? [s.homeworkId] : []));
    const homework = new Map((guardianId ? await this.sync.homeworkPatients(homeworkIds) : []).map((h) => [h.id, h.patientId]));
    const therapists = new Set(await this.sync.therapistIds(batch.sessions.flatMap((s) => (s.therapistId ? [s.therapistId] : []))));
    const sessions: SessionRow[] = [];
    for (const { patientCode, homeworkId, ...session } of batch.sessions) {
      const patient = patients.get(patientCode);
      const discharged = patient?.status === 'DISCHARGED' && (!patient.dischargedAt || session.startedAt >= patient.dischargedAt);
      if (!patient || discharged || (children && !children.has(patient.id))) {
        rejected.push({ id: session.id, reason: 'UnknownPatientCode' });
        continue;
      }
      if (guardianId) {
        // Home practice: a homework item of another patient is ignored (spec 112 FR-006).
        const own = homeworkId && homework.get(homeworkId) === patient.id ? homeworkId : null;
        const home = { therapistId: null, therapistVerified: false, kind: 'HOME', deviceId: null, guardianId, homeworkId: own } as const;
        sessions.push({ ...session, ...home, patientId: patient.id });
        continue;
      }
      const therapistId = session.therapistId && therapists.has(session.therapistId) ? session.therapistId : null;
      // "Verified" only if the server saw that therapist's correct personal PIN on that tablet.
      const verified =
        !!therapistId && !!session.therapistVerified && (await this.sync.pinVerifiedBefore(deviceId!, therapistId, session.startedAt));
      const therapy = { kind: 'THERAPY', deviceId, guardianId: null, homeworkId: null } as const;
      sessions.push({ ...session, ...therapy, therapistId, therapistVerified: verified, patientId: patient.id });
    }

    // Events and runs: their session comes in the batch or is already on the server.
    const knownRuns = await this.sync.existingRuns(batch.activityResults.map((r) => r.runId));
    // A guardian only adds to their own home practice, never to a therapy session or to another guardian's.
    const pending = [...new Set([...batch.events, ...batch.activityRuns, ...knownRuns].map((e) => e.sessionId))];
    const known = (await this.sync.existingSessions(pending)).filter((s) => !guardianId || s.guardianId === guardianId);
    const patientOf = new Map([...known.map((s) => [s.id, s.patientId] as const), ...sessions.map((s) => [s.id, s.patientId] as const)]);
    // Keeps the ones that qualify and records the rejection of the rest.
    const keep = <T extends { id: string }>(items: T[], ok: (item: T) => boolean, reason: Rejection['reason']) => {
      for (const item of items) if (!ok(item)) rejected.push({ id: item.id, reason });
      return items.filter(ok);
    };
    // Spec 008 FR-004: known type and valid content; otherwise that event is rejected and the rest of the batch continues.
    const typed = batch.events.filter((e) => {
      const problem = eventProblem(e.type, e.payload);
      if (problem) rejected.push({ id: e.id, reason: problem });
      return !problem;
    });
    const events = keep(typed, (e) => patientOf.has(e.sessionId), 'UnknownSession');
    const activityRuns = keep(batch.activityRuns, (r) => patientOf.has(r.sessionId), 'UnknownSession');
    // Known runs count only inside a session this source may add to: a family cannot answer into another session's run.
    const ownRuns = knownRuns.filter((r) => patientOf.has(r.sessionId));
    const runSession = new Map([...ownRuns, ...activityRuns].map((r) => [r.id, r.sessionId] as const));
    const activityResults = keep(batch.activityResults, (r) => runSession.has(r.runId), 'UnknownRun');

    await this.sync.save({ sessions, events, activityRuns, activityResults }, source);

    // "Most used" (spec 105 FR-008): only when pictogram taps arrive.
    const taps = events.filter((e) => e.type === 'pictogram_tapped' && typeof e.payload.pictogramId === 'string');
    if (taps.length > 0)
      await this.sync.refreshUsage(
        [...new Set(taps.map((e) => patientOf.get(e.sessionId)!))],
        [...new Set(taps.map((e) => e.payload.pictogramId as string))],
      );

    const ids = <T extends { id: string }>(items: T[]) => items.map((item) => item.id);
    const accepted = {
      sessions: ids(sessions),
      events: ids(events),
      activityRuns: ids(activityRuns),
      activityResults: ids(activityResults),
    };
    if (guardianId) return { accepted, rejected };

    // Live (spec 106 FR-005/006), already saved in PostgreSQL: events and responses to whoever watches that patient
    // and the new status to whoever watches presence.
    const group = <T>(items: T[], patient: (item: T) => string) =>
      items.reduce((map, item) => map.set(patient(item), [...(map.get(patient(item)) ?? []), item]), new Map<string, T[]>());
    for (const [patientId, items] of group(events, (e) => patientOf.get(e.sessionId)!))
      this.live.publish(patientId, { type: 'events', patientId, events: items });
    for (const [patientId, items] of group(activityResults, (r) => patientOf.get(runSession.get(r.runId)!)!))
      this.live.publish(patientId, { type: 'results', patientId, results: items });
    await this.live.statusChanged([...new Set([...sessions.map((s) => s.patientId), ...events.map((e) => patientOf.get(e.sessionId)!)])]);

    return { accepted, rejected };
  }
}
