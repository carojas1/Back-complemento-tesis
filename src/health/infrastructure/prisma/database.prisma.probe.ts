import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { asSystem } from '../../../tenancy/tenancy';
import { DatabaseProbe } from '../../domain/ports/database.probe';

// Past this the database counts as down: the Docker healthcheck must not wait for the pool timeout.
const timeoutMs = 3_000;

// `SELECT 1` as table owner: depends on no institution and no RLS.
@Injectable()
export class DatabasePrismaProbe extends DatabaseProbe {
  private readonly logger = new Logger(DatabasePrismaProbe.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isUp() {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`sin respuesta en ${timeoutMs} ms`)), timeoutMs);
    });
    try {
      await Promise.race([asSystem(() => this.prisma.$queryRaw`SELECT 1`), timeout]);
      return true;
    } catch (e) {
      this.logger.warn(`Database down: ${String(e)}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
