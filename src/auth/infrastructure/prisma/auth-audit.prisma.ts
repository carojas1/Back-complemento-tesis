import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthAuditEntry, AuthAuditLog } from '../../domain/ports/auth-notifications.ports';

// ponytail: writes AuditLog directly; once the spec 109 AuditService exists, this adapter delegates to it.
@Injectable()
export class AuthAuditPrisma extends AuthAuditLog {
  private readonly logger = new Logger(AuthAuditPrisma.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(entry: AuthAuditEntry) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorType: entry.actorType,
          actorId: entry.actorId ?? null,
          action: entry.action,
          entity: entry.entity ?? 'User',
          entityId: entry.entityId ?? entry.userId ?? null,
          patientCode: entry.patientCode ?? null,
          ip: entry.ip ?? null,
          summary: (entry.summary as Prisma.InputJsonObject) ?? Prisma.DbNull,
        },
      });
    } catch (error) {
      // An audit failure must not take down the login; it stays in the server log.
      this.logger.error(`Could not audit ${entry.action}`, (error as Error).stack);
    }
  }
}
