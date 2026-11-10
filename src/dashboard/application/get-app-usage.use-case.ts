import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { DashboardReadModel } from '../domain/ports/dashboard.read-model';
import { resolvePeriod } from './analytics-period';
import { dayMs, tabletStaleDays } from '../../common/time/center-time';

// How much the app is used in a period, against the period just before it. A specialist counts only their assigned patients and does
// not see the tablets, which the admin manages.
@Injectable()
export class GetAppUsageUseCase {
  constructor(private readonly readModel: DashboardReadModel) {}

  execute({ from, to, therapistId }: { from?: Date; to?: Date; therapistId?: string }, actor: { id: string; role: Role }) {
    const period = resolvePeriod(from, to);
    const admin = actor.role === Role.ADMIN;
    return this.readModel.appUsage({
      ...period,
      previousFrom: new Date(period.from.getTime() - (period.to.getTime() - period.from.getTime())),
      therapistId: admin ? therapistId : actor.id,
      withDevices: admin,
      staleBefore: new Date(Date.now() - tabletStaleDays * dayMs),
    });
  }
}
