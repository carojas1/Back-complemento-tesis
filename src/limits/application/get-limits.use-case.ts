import { Injectable } from '@nestjs/common';
import { QuotaReader } from '../domain/ports/quota.reader';

// The center admin sees its limits and usage, read only (the super admin changes them).
@Injectable()
export class GetLimitsUseCase {
  constructor(private readonly quota: QuotaReader) {}

  execute() {
    return this.quota.usage();
  }
}
