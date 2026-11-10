import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsOptional } from 'class-validator';
import { CenterDayEnd, CenterDayStart } from '../../../common/time/center-day';

// Period of the PDF report; with no period, the last 30 days (like GET /patients/:id/reports).
export class ReportJobQuery {
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @CenterDayStart() @IsDate() from?: Date;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @CenterDayEnd() @IsDate() to?: Date;
}

export class JobResponse {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['REPORT_PDF', 'EXPORT_ZIP'] }) type: string;
  @ApiProperty({ enum: ['QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELED'] }) status: string;
  @ApiProperty({ example: 'P-0007' }) patientCode: string;
  @ApiProperty({ example: { from: '2026-10-01T00:00:00.000Z', to: null } }) params: { from: string | null; to: string | null };
  @ApiPropertyOptional({ nullable: true, description: 'Jobs ahead of this one (queued only)' }) position: number | null;
  @ApiProperty() attempts: number;
  @ApiPropertyOptional({ nullable: true }) error: string | null;
  @ApiPropertyOptional({ nullable: true }) fileName: string | null;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional({ nullable: true }) startedAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) finishedAt: Date | null;
  @ApiPropertyOptional({ nullable: true, description: 'Until when it can be downloaded (24 h)' }) expiresAt: Date | null;
  @ApiPropertyOptional({ nullable: true, description: 'Signed bucket URL, 5 min; DONE only and for whoever requested it' })
  downloadUrl: string | null;
}
