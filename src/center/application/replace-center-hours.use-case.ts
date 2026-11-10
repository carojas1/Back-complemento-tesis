import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { CenterHoursEntry } from '../domain/entities/center.entity';
import { InvalidCenterHours } from '../domain/exceptions/center.exceptions';
import { CenterRepository } from '../domain/ports/center.repository';

// The whole week at once: a day left out is closed. An empty week means no hours are enforced.
@Injectable()
export class ReplaceCenterHoursUseCase {
  constructor(
    private readonly repo: CenterRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(hours: CenterHoursEntry[], actor: { id: string; ip?: string }) {
    const days = new Set(hours.map((h) => h.weekday));
    if (days.size !== hours.length || hours.some((h) => h.opensAt >= h.closesAt)) throw new InvalidCenterHours();
    await this.repo.replaceHours(hours);
    await this.audit.record({
      action: 'CENTER_HOURS_CHANGE',
      actorType: 'USER',
      actorId: actor.id,
      entity: 'CenterHours',
      ip: actor.ip,
      summary: { days: hours.length },
    });
    return this.repo.getHours();
  }
}
