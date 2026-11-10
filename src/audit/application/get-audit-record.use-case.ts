import { Injectable } from '@nestjs/common';
import { AuditRecordNotFound } from '../domain/exceptions/audit.exceptions';
import { AuditRepository } from '../domain/ports/audit.repository';

// Spec 109: the full detail of a record (who, what, on what, when, from where and the summary).
@Injectable()
export class GetAuditRecordUseCase {
  constructor(private readonly audit: AuditRepository) {}

  async execute(id: string) {
    const record = /^\d{1,18}$/.test(id) ? await this.audit.find(BigInt(id)) : null;
    if (!record) throw new AuditRecordNotFound();
    return record;
  }
}
