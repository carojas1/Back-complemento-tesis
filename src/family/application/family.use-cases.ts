import { Injectable } from '@nestjs/common';
import { AuthAuditEntry, AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { FileStorage } from '../../common/storage/file-storage';
import { toHomeworkView } from '../../homework/application/homework-view';
import { HomeworkNotFound } from '../../homework/domain/entities/homework.entity';
import { HomeworkRepository, HomeworkStatus } from '../../homework/domain/ports/homework.repository';
import { toProfileView } from '../../profiles/application/profile-view';
import { ProfilesRepository } from '../../profiles/domain/ports/profiles.repository';
import { Period, SessionsReadModel } from '../../sessions/domain/ports/sessions.read-model';
import { ProcessBatchUseCase } from '../../sync/application/process-batch.use-case';
import { SyncBatch } from '../../sync/domain/ports/sync.repository';
import { PatientNotLinked } from '../domain/exceptions/family.exceptions';
import { Child, FamilyRead } from '../domain/ports/family.read';

type Guardian = { guardianId: string; ip?: string };

// Spec 112: the guardian sees their children (read-only) and uploads home practice. Everything goes through the
// guardian ↔ patient link: someone else's patient is a 403 PatientNotLinked.
@Injectable()
export class FamilyUseCases {
  constructor(
    private readonly family: FamilyRead,
    private readonly profiles: ProfilesRepository,
    private readonly sessionsRead: SessionsReadModel,
    private readonly homework: HomeworkRepository,
    private readonly processBatch: ProcessBatchUseCase,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  private async allow(patientId: string, guardian: Guardian) {
    if (!(await this.family.isLinked(patientId, guardian.guardianId))) throw new PatientNotLinked();
  }

  private record(entry: Omit<AuthAuditEntry, 'actorType' | 'actorId'>, guardian: Guardian) {
    return this.audit.record({ ...entry, actorType: 'USER', actorId: guardian.guardianId, ip: guardian.ip });
  }

  private async withAvatar<T extends Child>({ avatarPath, ...child }: T) {
    return { ...child, avatarUrl: await this.storage.signedUrl(avatarPath) };
  }

  async children(page: PageRequest, guardian: Guardian) {
    return mapPage(await this.family.children(guardian.guardianId, page), (child) => this.withAvatar(child));
  }

  async child(patientId: string, guardian: Guardian) {
    await this.allow(patientId, guardian);
    const child = await this.family.child(patientId);
    if (!child) throw new PatientNotLinked();
    await this.record({ action: 'FAMILY_READ', entity: 'Patient', entityId: patientId, patientCode: child.code }, guardian);
    return this.withAvatar(child);
  }

  // The board, same as the tablet (spec 106): the app uses it to practice at home.
  async profile(patientId: string, guardian: Guardian) {
    await this.allow(patientId, guardian);
    const board = await this.profiles.findBoard(patientId);
    if (!board) throw new PatientNotLinked();
    return toProfileView(board, this.storage);
  }

  async sessions(patientId: string, period: Partial<Period>, page: PageRequest, guardian: Guardian) {
    await this.allow(patientId, guardian);
    return this.sessionsRead.list(patientId, period, page);
  }

  async notes(patientId: string, page: PageRequest, guardian: Guardian) {
    await this.allow(patientId, guardian);
    return this.family.sharedNotes(patientId, page);
  }

  async homeworkList(patientId: string, status: HomeworkStatus | undefined, page: PageRequest, guardian: Guardian) {
    await this.allow(patientId, guardian);
    return mapPage(await this.homework.list(patientId, status, page), (row) => toHomeworkView(row, this.storage));
  }

  async completeHomework(id: string, guardian: Guardian) {
    const homework = await this.homework.find(id);
    if (!homework) throw new HomeworkNotFound();
    await this.allow(homework.patientId, guardian);
    if (homework.complete(guardian.guardianId)) {
      await this.homework.save(homework);
      const patientCode = await this.homework.patientCode(homework.patientId);
      await this.record({ action: 'HOMEWORK_COMPLETE', entity: 'Homework', entityId: id, patientCode }, guardian);
    }
    const row = await this.homework.row(id);
    return toHomeworkView(row!, this.storage);
  }

  // FR-006: the same batch as the tablet, saved as home practice.
  async practice(batch: SyncBatch, guardian: Guardian) {
    const result = await this.processBatch.execute({ guardianId: guardian.guardianId }, batch);
    if (result.accepted.sessions.length > 0)
      await this.record({ action: 'HOME_PRACTICE', entity: 'Session', summary: { sessions: result.accepted.sessions } }, guardian);
    return result;
  }
}
