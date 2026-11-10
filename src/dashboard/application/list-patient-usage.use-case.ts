import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { FileStorage } from '../../common/storage/file-storage';
import { DashboardReadModel, PatientUsageFlag, PatientUsageSort } from '../domain/ports/dashboard.read-model';
import { resolvePeriod } from './analytics-period';

type Query = { from?: Date; to?: Date; therapistId?: string; search?: string; flag?: PatientUsageFlag; sort?: PatientUsageSort };

// How much each patient used the app and came to their appointments. The admin reads every patient, in counts only; a specialist reads
// only their assigned patients, and also how the activities went.
@Injectable()
export class ListPatientUsageUseCase {
  constructor(
    private readonly readModel: DashboardReadModel,
    private readonly storage: FileStorage,
  ) {}

  async execute({ from, to, therapistId, search, flag, sort }: Query, page: PageRequest, actor: { id: string; role: Role }) {
    const therapist = actor.role === Role.THERAPIST;
    const result = await this.readModel.patientUsage(
      {
        ...resolvePeriod(from, to),
        therapistId: therapist ? actor.id : therapistId,
        search: search?.trim() || undefined,
        flag,
        sort: sort ?? 'CODE',
        withResults: therapist,
      },
      page,
    );
    const mapped = await mapPage(result, async ({ avatarPath, ...row }) => ({
      ...row,
      avatarUrl: await this.storage.signedUrl(avatarPath),
    }));
    return { ...mapped, counts: result.counts };
  }
}
