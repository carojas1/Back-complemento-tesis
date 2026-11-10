import { Injectable } from '@nestjs/common';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { FileStorage } from '../../common/storage/file-storage';
import { PatientNotFound } from '../../patients/domain/exceptions/patients.exceptions';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { PatientAccess } from '../../profiles/domain/ports/profiles.repository';
import { documentTypes, Job, JobType, voiceTypes } from '../domain/entities/job.entity';
import { JobNotCancelable, JobNotFound } from '../domain/exceptions/jobs.exceptions';
import { JobsRepository } from '../domain/ports/jobs.repository';
import { toJobView } from './job-view';

export type Requester = { userId: string; ip?: string };
export type Period = { from?: Date; to?: Date };

const laneOf = (type: JobType) => (documentTypes.includes(type) ? documentTypes : voiceTypes);

// API side: validates, enqueues and responds with the id; the status is then queried with that id.
@Injectable()
export class JobsUseCases {
  constructor(
    private readonly jobs: JobsRepository,
    private readonly access: PatientAccess,
    private readonly storage: FileStorage,
  ) {}

  // Validates before enqueuing (assigned patient, period) so an invalid request fails instantly and not in the queue.
  async enqueue(type: JobType, patientId: string, period: Period, requester: Requester) {
    const patientCode = await this.jobs.patientCode(patientId);
    if (!patientCode) throw new PatientNotFound();
    if (!(await this.access.isAssigned(patientId, requester.userId))) throw new PatientNotAssigned();
    const params = { from: period.from?.toISOString(), to: period.to?.toISOString() };
    const wanted = { type, requestedBy: requester.userId, patientId, params };
    const job =
      (await this.jobs.findActive(wanted)) ?? (await this.jobs.create({ ...wanted, patientCode, params: { ...params, ip: requester.ip } }));
    return toJobView(job, this.storage, await this.jobs.ahead(job, documentTypes));
  }

  // A file of a patient is only for whoever still attends them: a specialist taken off the patient sees how their job went, not the download.
  private async viewFor(job: Job, userId: string, position?: number | null) {
    const view = await toJobView(job, this.storage, position);
    const assigned = !job.patientId || (await this.access.isAssigned(job.patientId, userId));
    return assigned ? view : { ...view, downloadUrl: null };
  }

  async get(id: string, userId: string) {
    const job = await this.jobs.find(id);
    if (!job || job.requestedBy !== userId) throw new JobNotFound();
    return this.viewFor(job, userId, await this.jobs.ahead(job, laneOf(job.type)));
  }

  async list(userId: string, page: PageRequest) {
    return mapPage(await this.jobs.listByRequester(userId, page), (job) => this.viewFor(job, userId));
  }

  async cancel(id: string, userId: string) {
    const job = await this.jobs.find(id);
    if (!job || job.requestedBy !== userId) throw new JobNotFound();
    if (!(await this.jobs.cancel(id, new Date()))) throw new JobNotCancelable();
    return toJobView((await this.jobs.find(id))!, this.storage);
  }
}
