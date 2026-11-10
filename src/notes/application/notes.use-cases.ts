import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuthAuditLog, AuthAuditEntry } from '../../auth/domain/ports/auth-notifications.ports';
import { DomainException } from '../../common/exceptions/base.exception';
import { PageRequest } from '../../common/pagination/page';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { PatientAccess } from '../../profiles/domain/ports/profiles.repository';
import { GoalStatus, Note } from '../domain/entities/note.entity';
import { NotesRepository } from '../domain/ports/notes.repository';

export class NoteNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'NoteNotFound', 'La observación, el objetivo o la sesión no existe para este paciente');
  }
}

type Actor = { therapistId: string; ip?: string };

// Spec 108: patient observations and goals, only for their assigned therapists; every change is audited.
// They share the access check and the audit, which is why the actions live together.
@Injectable()
export class NotesUseCases {
  constructor(
    private readonly notes: NotesRepository,
    private readonly access: PatientAccess,
    private readonly audit: AuthAuditLog,
  ) {}

  private async allow(patientId: string, actor: Actor) {
    if (!(await this.access.isAssigned(patientId, actor.therapistId))) throw new PatientNotAssigned();
  }

  private async record(entry: Omit<AuthAuditEntry, 'actorType' | 'actorId'>, patientId: string, actor: Actor) {
    const patientCode = await this.notes.patientCode(patientId);
    await this.audit.record({ ...entry, actorType: 'USER', actorId: actor.therapistId, ip: actor.ip, patientCode });
  }

  async listNotes(patientId: string, period: { from?: Date; to?: Date }, page: PageRequest, actor: Actor) {
    await this.allow(patientId, actor);
    const result = await this.notes.listNotes(patientId, period, page);
    return { ...result, items: result.items.map((n) => ({ ...n, editable: n.editableBy(actor.therapistId) })) };
  }

  async createNote(patientId: string, input: { text: string; sessionId?: string; sharedWithFamily?: boolean }, actor: Actor) {
    await this.allow(patientId, actor);
    if (input.sessionId && !(await this.notes.sessionOfPatient(input.sessionId, patientId))) throw new NoteNotFound();
    const note = Note.create({
      id: randomUUID(),
      patientId,
      sessionId: input.sessionId ?? null,
      authorId: actor.therapistId,
      text: input.text,
      sharedWithFamily: input.sharedWithFamily,
    });
    await this.notes.saveNote(note);
    await this.record(
      {
        action: 'NOTE_CREATE',
        entity: 'Note',
        entityId: note.id,
        summary: { sessionId: note.sessionId, sharedWithFamily: note.sharedWithFamily },
      },
      patientId,
      actor,
    );
    return { ...note, editable: true };
  }

  async editNote(id: string, text: string, actor: Actor) {
    const note = await this.notes.findNote(id);
    if (!note) throw new NoteNotFound();
    await this.allow(note.patientId, actor);
    const previous = note.edit(actor.therapistId, text);
    await this.notes.saveNote(note);
    await this.record({ action: 'NOTE_UPDATE', entity: 'Note', entityId: id, summary: { previous } }, note.patientId, actor); // FR-001
    return { ...note, editable: true };
  }

  async shareNote(id: string, shared: boolean, actor: Actor) {
    const note = await this.notes.findNote(id);
    if (!note) throw new NoteNotFound();
    await this.allow(note.patientId, actor);
    note.share(shared);
    await this.notes.saveNote(note);
    await this.record({ action: 'NOTE_SHARE', entity: 'Note', entityId: id, summary: { sharedWithFamily: shared } }, note.patientId, actor);
    return { ...note, editable: note.editableBy(actor.therapistId) };
  }

  async listGoals(patientId: string, page: PageRequest, actor: Actor) {
    await this.allow(patientId, actor);
    return this.notes.listGoals(patientId, page);
  }

  async createGoal(patientId: string, input: { text: string; targetDate?: Date }, actor: Actor) {
    await this.allow(patientId, actor);
    const id = await this.notes.createGoal({
      patientId,
      authorId: actor.therapistId,
      text: input.text,
      targetDate: input.targetDate ?? null,
    });
    await this.record({ action: 'GOAL_CREATE', entity: 'Goal', entityId: id }, patientId, actor);
    return (await this.notes.listGoals(patientId, { page: 1, limit: 100 })).items.find((g) => g.id === id);
  }

  async updateGoal(id: string, changes: { status?: GoalStatus; text?: string; targetDate?: Date }, actor: Actor) {
    const goal = await this.notes.findGoal(id);
    if (!goal) throw new NoteNotFound();
    await this.allow(goal.patientId, actor);
    await this.notes.updateGoal(id, changes);
    await this.record(
      { action: 'GOAL_UPDATE', entity: 'Goal', entityId: id, summary: { fields: Object.keys(changes) } },
      goal.patientId,
      actor,
    );
    return { ...goal, ...changes };
  }
}
