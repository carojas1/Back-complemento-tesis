// prettier-ignore
import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { Auth, GetUser, Role } from '../../../auth';
import { CreatePatientUseCase } from '../../application/create-patient.use-case';
import { GetConsentUseCase } from '../../application/get-consent.use-case';
import { GetPatientAdministrativeRecordUseCase } from '../../application/get-patient-administrative-record.use-case';
import { GetPatientUseCase } from '../../application/get-patient.use-case';
import { ListPatientsUseCase } from '../../application/list-patients.use-case';
import { SetPatientStatusUseCase } from '../../application/set-patient-status.use-case';
import { UpdatePatientUseCase } from '../../application/update-patient.use-case';
import { CreatePatientDto, ListPatientsQuery, UpdatePatientDto } from './patients.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

// Spec 104: the admin registers (with the consent photo); the assigned therapist views and edits.
@ApiTags('patients')
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly createPatient: CreatePatientUseCase,
    private readonly listPatients: ListPatientsUseCase,
    private readonly getPatient: GetPatientUseCase,
    private readonly getAdministrativeRecord: GetPatientAdministrativeRecordUseCase,
    private readonly updatePatient: UpdatePatientUseCase,
    private readonly setStatus: SetPatientStatusUseCase,
    private readonly getConsent: GetConsentUseCase,
  ) {}

  @Auth(Role.ADMIN)
  @Post()
  @UseInterceptors(FileInterceptor('consentImage', { limits: { fileSize: 1_000_000 } })) // 1 MB: the app shrinks it first (spec 113 FR-011)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { consentImage: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Registers a patient: basic data, therapists and consent photo (JPG or PNG)' })
  create(
    @Body() dto: CreatePatientDto,
    @UploadedFile() consent: { buffer: Buffer } | undefined,
    @GetUser('id') actorId: string,
    @Req() req: Request,
  ) {
    return this.createPatient.execute({ ...dto, consentImage: consent?.buffer, actorId, ip: req.ip });
  }

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get()
  @ApiOperation({ summary: 'Patients paginated by code: the admin sees all; the therapist, her assigned ones. No clinical data' })
  list(@Query() { page, limit, search, status, assignedTo, notAssignedTo }: ListPatientsQuery, @GetUser() user: AuthenticatedUser) {
    return this.listPatients.execute(
      { actorId: user.id, actorRole: user.role, search, status, assignedTo, notAssignedTo },
      { page, limit },
    );
  }

  @Auth(Role.THERAPIST)
  @Get(':id')
  @ApiOperation({ summary: 'Full record (assigned therapist only; audited)' })
  get(@Param('id', uuid) id: string, @GetUser('id') therapistId: string, @Req() req: Request) {
    return this.getPatient.execute({ id, therapistId, ip: req.ip });
  }

  @Auth(Role.ADMIN)
  @Get(':id/administrative')
  @ApiOperation({ summary: 'What the admin registered and the tablets the patient used; no clinical data (audited)' })
  administrative(@Param('id', uuid) id: string, @GetUser('id') actorId: string, @Req() req: Request) {
    return this.getAdministrativeRecord.execute({ id, actorId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Patch(':id')
  @ApiOperation({ summary: 'Edits names, birth date, guardian, avatar, diagnosis and conditions' })
  update(@Param('id', uuid) id: string, @Body() dto: UpdatePatientDto, @GetUser('id') therapistId: string, @Req() req: Request) {
    return this.updatePatient.execute({ ...dto, id, therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Post(':id/discharge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Therapeutic discharge: stops being downloaded to tablets' })
  discharge(@Param('id', uuid) id: string, @GetUser('id') therapistId: string, @Req() req: Request) {
    return this.setStatus.execute({ id, discharge: true, therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivates a discharged patient' })
  reactivate(@Param('id', uuid) id: string, @GetUser('id') therapistId: string, @Req() req: Request) {
    return this.setStatus.execute({ id, discharge: false, therapistId, ip: req.ip });
  }

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get(':id/consent')
  @ApiOperation({ summary: 'Consent photo, decrypted (admin or assigned therapist; audited)' })
  async consent(@Param('id', uuid) id: string, @GetUser() user: AuthenticatedUser, @Req() req: Request, @Res() res: Response) {
    const { data, contentType } = await this.getConsent.execute({ id, actorId: user.id, actorRole: user.role, ip: req.ip });
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'no-store' }).send(data);
  }
}
