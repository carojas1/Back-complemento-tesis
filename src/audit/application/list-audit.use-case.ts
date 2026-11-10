import { Injectable } from '@nestjs/common';
import { PageRequest } from '../../common/pagination/page';
import { AuditFilters, AuditRepository } from '../domain/ports/audit.repository';

// Spec 109: the admin queries the audit filtered and paginated, newest to oldest.
@Injectable()
export class ListAuditUseCase {
  constructor(private readonly audit: AuditRepository) {}

  execute(filters: AuditFilters, page: PageRequest) {
    return this.audit.list(filters, page);
  }
}
