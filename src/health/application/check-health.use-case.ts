import { Injectable } from '@nestjs/common';
import { DatabaseProbe } from '../domain/ports/database.probe';

export type Health = { status: 'ok'; database: 'up' } | { status: 'error'; database: 'down' };

// Health check of the constitution (§3): the API is healthy only if the database answers.
@Injectable()
export class CheckHealthUseCase {
  constructor(private readonly database: DatabaseProbe) {}

  async execute(): Promise<Health> {
    return (await this.database.isUp()) ? { status: 'ok', database: 'up' } : { status: 'error', database: 'down' };
  }
}
