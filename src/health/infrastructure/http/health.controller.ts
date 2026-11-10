import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../../auth';
import { CheckHealthUseCase } from '../../application/check-health.use-case';

// Docker and monitors call it every few seconds: outside the short and medium limits (the per-minute one still applies).
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly checkHealth: CheckHealthUseCase) {}

  @Public()
  @SkipThrottle({ short: true, medium: true })
  @Get()
  @ApiOperation({ summary: 'Health check: 200 if the API and the database respond, 503 if the database is down' })
  async check(@Res({ passthrough: true }) res: Response) {
    const health = await this.checkHealth.execute();
    if (health.status === 'error') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return health;
  }
}
