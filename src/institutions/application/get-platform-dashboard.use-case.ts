import { Injectable } from '@nestjs/common';
import { contactWindowHours, isContactOverdue } from '../domain/entities/institution-request.entity';
import { InstitutionsRepository } from '../domain/ports/institutions.repository';

// Super admin home: requests, centers and the activity of each center (counts only).
@Injectable()
export class GetPlatformDashboardUseCase {
  constructor(private readonly repo: InstitutionsRepository) {}

  async execute() {
    const now = new Date();
    const hour = 60 * 60_000;
    const { oldestOpenRequests, ...stats } = await this.repo.platformStats(
      new Date(now.getTime() - contactWindowHours * hour),
      new Date(now.getTime() - 30 * 24 * hour),
    );
    return {
      ...stats,
      oldestOpenRequests: oldestOpenRequests.map(({ id, institutionName, city, status, createdAt }) => ({
        ...{ id, institutionName, city, status, createdAt },
        contactOverdue: isContactOverdue({ status, createdAt }, now),
      })),
    };
  }
}
