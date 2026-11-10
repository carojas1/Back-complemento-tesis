import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, Role } from '../../../auth';
import { GetLimitsUseCase } from '../../application/get-limits.use-case';

// Center admin: the limits of their center, read only (the super admin sets them at /platform/institutions/:id).
@ApiTags('limits')
@Auth(Role.ADMIN)
@Controller('limits')
export class LimitsController {
  constructor(private readonly getLimits: GetLimitsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Limits of my center (therapists and tablets) and how much is used' })
  get() {
    return this.getLimits.execute();
  }
}
