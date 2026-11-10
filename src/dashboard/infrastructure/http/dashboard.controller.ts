import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, GetUser, Role, type AuthenticatedUser } from '../../../auth';
import { GetAppUsageUseCase } from '../../application/get-app-usage.use-case';
import { GetCenterAnalyticsUseCase } from '../../application/get-center-analytics.use-case';
import { GetCenterOverviewUseCase } from '../../application/get-center-overview.use-case';
import { ListPatientUsageUseCase } from '../../application/list-patient-usage.use-case';
import { AnalyticsQuery, AppUsageQuery, OverviewQuery, PatientUsageQuery } from './dashboard.dto';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly getCenterOverview: GetCenterOverviewUseCase,
    private readonly getCenterAnalytics: GetCenterAnalyticsUseCase,
    private readonly listPatientUsage: ListPatientUsageUseCase,
    private readonly getAppUsage: GetAppUsageUseCase,
  ) {}

  @Auth(Role.ADMIN)
  @Get()
  @ApiOperation({ summary: "Center administrator home: team, patients, tablets, today's agenda and open requests (counts only)" })
  get(@Query() query: OverviewQuery) {
    return this.getCenterOverview.execute(query.dayStart);
  }

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get('analytics')
  @ApiOperation({ summary: 'Attendance, room occupancy, patients seen and practice for a period (the specialist sees only their own)' })
  analytics(@Query() query: AnalyticsQuery, @GetUser() user: AuthenticatedUser) {
    return this.getCenterAnalytics.execute(query, user);
  }

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get('patients')
  @ApiOperation({
    summary:
      'Usage and attendance of each patient in a period: the admin sees everyone, without clinical data; the specialist, their assigned ones',
  })
  patients(@Query() { page, limit, ...query }: PatientUsageQuery, @GetUser() user: AuthenticatedUser) {
    return this.listPatientUsage.execute(query, { page, limit }, user);
  }

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get('usage')
  @ApiOperation({
    summary: 'How much the app is used in a period: sessions, time, schedules and tablets (the specialist counts only their patients)',
  })
  usage(@Query() query: AppUsageQuery, @GetUser() user: AuthenticatedUser) {
    return this.getAppUsage.execute(query, user);
  }
}
