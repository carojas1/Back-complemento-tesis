import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { DomainException } from '../../common/exceptions/base.exception';
import { PageRequest } from '../../common/pagination/page';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { PatientAccess } from '../../profiles/domain/ports/profiles.repository';
import { Period, SessionsReadModel } from '../domain/ports/sessions.read-model';

export class SessionNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'SessionNotFound', 'La sesión no existe');
  }
}

type Reader = { therapistId: string; ip?: string };

// Spec 107: the assigned therapist queries sessions, their detail and indicators; each query is audited (FR-003).
// The three actions share the access check and the audit, which is why they live together.
@Injectable()
export class SessionsUseCases {
  constructor(
    private readonly read: SessionsReadModel,
    private readonly access: PatientAccess,
    private readonly audit: AuthAuditLog,
  ) {}

  private async allow(
    patientId: string,
    reader: Reader,
    what: string,
    extra: Record<string, unknown> = {},
    action: 'SESSION_READ' | 'REPORT_EXPORT' = 'SESSION_READ',
  ) {
    if (!(await this.access.isAssigned(patientId, reader.therapistId))) throw new PatientNotAssigned();
    await this.audit.record({
      action,
      actorType: 'USER',
      actorId: reader.therapistId,
      entity: 'Patient',
      entityId: patientId,
      patientCode: (await this.read.patientCode(patientId)) ?? undefined,
      ip: reader.ip,
      summary: { what, ...extra },
    });
  }

  async list(patientId: string, period: Partial<Period>, page: PageRequest, reader: Reader) {
    await this.allow(patientId, reader, 'list');
    return this.read.list(patientId, period, page);
  }

  async get(sessionId: string, reader: Reader) {
    const session = await this.read.find(sessionId);
    if (!session) throw new SessionNotFound();
    await this.allow(session.patientId, reader, 'detail', { sessionId });
    return session;
  }

  // By default, the last 30 days. The PDF (spec 107 T007) uses the same calculation and is audited as REPORT_EXPORT.
  async report(patientId: string, period: Partial<Period>, reader: Reader, as: 'json' | 'pdf' = 'json') {
    const to = period.to ?? new Date();
    const from = period.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60_000);
    if (as === 'pdf') await this.allow(patientId, reader, 'report_pdf', { from, to }, 'REPORT_EXPORT');
    else await this.allow(patientId, reader, 'report', { from, to });
    return { from, to, ...(await this.read.report(patientId, { from, to })) };
  }
}
