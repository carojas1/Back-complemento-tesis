import { Injectable } from '@nestjs/common';
import { baseInstitutionId } from '../../tenancy/tenancy';
import { InstitutionNotFound } from '../domain/exceptions/institutions.exceptions';
import { InstitutionsRepository } from '../domain/ports/institutions.repository';

// A center for the super admin: profile, limits, admins and usage counts. Never patients or clinical data.
@Injectable()
export class GetInstitutionUseCase {
  constructor(private readonly repo: InstitutionsRepository) {}

  async execute(id: string) {
    const institution = await this.repo.findInstitution(id);
    if (!institution) throw new InstitutionNotFound();
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const [usage, admins] = await Promise.all([this.repo.institutionUsage(id, monthAgo), this.repo.listAdmins(id)]);
    return { ...institution, usage, admins, isTemplate: id === baseInstitutionId };
  }
}
