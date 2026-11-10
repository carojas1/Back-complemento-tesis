import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { DashboardReadModel } from '../domain/ports/dashboard.read-model';
import { resolvePeriod } from './analytics-period';

type Query = { from?: Date; to?: Date; therapistId?: string; specialty?: string };

// Attendance, room occupancy and patients attended for a period. A specialist always gets only their own figures.
@Injectable()
export class GetCenterAnalyticsUseCase {
  constructor(private readonly readModel: DashboardReadModel) {}

  execute({ from, to, therapistId, specialty }: Query, actor: { id: string; role: Role }) {
    return this.readModel.analytics({
      ...resolvePeriod(from, to),
      therapistId: actor.role === Role.THERAPIST ? actor.id : therapistId,
      specialty,
    });
  }
}
