import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuthAuditEntry, AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { FileStorage } from '../../common/storage/file-storage';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { PatientAccess } from '../../profiles/domain/ports/profiles.repository';
import { Homework, HomeworkNotFound, InvalidHomeworkPictograms } from '../domain/entities/homework.entity';
import { HomeworkRepository, HomeworkStatus } from '../domain/ports/homework.repository';
import { toHomeworkView } from './homework-view';

type Actor = { therapistId: string; ip?: string };
type Fields = { instructions: string; pictogramIds: string[]; dueDate?: Date | null; withActivity?: boolean };

// Spec 112: home review homework sent by a therapist assigned to the patient; every change is audited.
@Injectable()
export class HomeworkUseCases {
  constructor(
    private readonly homework: HomeworkRepository,
    private readonly access: PatientAccess,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  private async allow(patientId: string, actor: Actor) {
    if (!(await this.access.isAssigned(patientId, actor.therapistId))) throw new PatientNotAssigned();
  }

  // Only pictograms from the patient's board (FR-005).
  private async checkBoard(patientId: string, ids: string[] | undefined) {
    if (ids && (await this.homework.boardPictogramIds(patientId, ids)).length !== new Set(ids).size) throw new InvalidHomeworkPictograms();
  }

  private async record(entry: Omit<AuthAuditEntry, 'actorType' | 'actorId' | 'entity'>, patientId: string, actor: Actor) {
    const patientCode = await this.homework.patientCode(patientId);
    await this.audit.record({ ...entry, entity: 'Homework', actorType: 'USER', actorId: actor.therapistId, ip: actor.ip, patientCode });
  }

  private async view(id: string) {
    const row = await this.homework.row(id);
    if (!row) throw new HomeworkNotFound();
    return toHomeworkView(row, this.storage);
  }

  private async load(id: string, actor: Actor) {
    const homework = await this.homework.find(id);
    if (!homework) throw new HomeworkNotFound();
    await this.allow(homework.patientId, actor);
    return homework;
  }

  async list(patientId: string, status: HomeworkStatus | undefined, page: PageRequest, actor: Actor) {
    await this.allow(patientId, actor);
    return mapPage(await this.homework.list(patientId, status, page), (row) => toHomeworkView(row, this.storage));
  }

  async create(patientId: string, input: Fields, actor: Actor) {
    await this.allow(patientId, actor);
    await this.checkBoard(patientId, input.pictogramIds);
    const homework = Homework.create({
      id: randomUUID(),
      patientId,
      authorId: actor.therapistId,
      instructions: input.instructions,
      dueDate: input.dueDate ?? null,
      withActivity: input.withActivity ?? false,
      pictogramIds: input.pictogramIds,
    });
    await this.homework.save(homework);
    await this.record(
      { action: 'HOMEWORK_CREATE', entityId: homework.id, summary: { pictograms: homework.pictogramIds.length } },
      patientId,
      actor,
    );
    return this.view(homework.id);
  }

  async update(id: string, changes: Partial<Fields>, actor: Actor) {
    const homework = await this.load(id, actor);
    await this.checkBoard(homework.patientId, changes.pictogramIds);
    homework.change(changes);
    await this.homework.save(homework);
    await this.record({ action: 'HOMEWORK_UPDATE', entityId: id, summary: { fields: Object.keys(changes) } }, homework.patientId, actor);
    return this.view(id);
  }

  async remove(id: string, actor: Actor) {
    const homework = await this.load(id, actor);
    homework.assertOpen();
    await this.homework.delete(id);
    await this.record({ action: 'HOMEWORK_DELETE', entityId: id }, homework.patientId, actor);
  }
}
