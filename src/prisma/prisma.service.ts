import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool, PoolClient, PoolConfig, QueryConfig } from 'pg';
import { currentScope } from '../tenancy/tenancy';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Scoped = PoolClient & { necon?: string };

// Spec 113 FR-003: every connection a request takes ends up with the `necon_app` role (RLS applies) and the request's
// institution. It is PostgreSQL session state: it is only sent when it changes on that connection, and it requires a direct
// connection (with PgBouncer in transaction mode each statement may land in another session). Outside a request or with
// `asSystem` a separate pool with the table owner is used, so no connection alternates roles on every request
// (validating the JWT looks the user up as system: with a single pool it was two more round trips to Neon per request).
function sessionFor(client: Scoped, institutionId: string) {
  if (client.necon === institutionId) return null;
  if (institutionId && !uuid.test(institutionId)) throw new Error('Invalid institution'); // goes inside the SQL
  return `SET ROLE necon_app; SELECT set_config('app.institution_id', '${institutionId}', false)`;
}

const logger = new Logger('PrismaPool');

// While a connection is checked out the pool does not listen to it. If it drops in the middle of a query (ECONNRESET), the query fails and its caller answers;
// without a listener the same drop is an unhandled 'error' event and it takes the API or the worker down.
const survivesDrops = (client: PoolClient) => {
  client.on('error', (e: Error) => logger.warn(`Connection dropped: ${e.message}`));
};

class ScopedPool extends Pool {
  private readonly owner = new Pool({ ...this.options, max: Math.max(2, Math.ceil((this.options.max ?? 20) / 4)) })
    .on('error', (e) => this.emit('error', e)) // an idle connection that drops: the Prisma adapter listens only to the main pool
    .on('connect', survivesDrops);

  constructor(options: PoolConfig) {
    super(options);
    this.on('connect', survivesDrops);
  }

  // Only the promise form: it is the one the Prisma adapter uses.
  override async connect() {
    const scope = currentScope();
    if (!scope || scope.system) return this.owner.connect();
    const institutionId = scope.institutionId ?? '';
    const client = (await super.connect()) as Scoped;
    try {
      const sql = sessionFor(client, institutionId);
      if (sql) await client.query(sql);
      client.necon = institutionId;
      return client;
    } catch (e) {
      client.release(e as Error);
      throw e;
    }
  }

  // @ts-expect-error: only the (config) => Promise form, the one the adapter uses
  override async query(config: QueryConfig) {
    const client = await this.connect();
    try {
      const result = await client.query(config);
      client.release();
      return result;
    } catch (e) {
      client.release(e as Error); // like pg-pool: on an error the connection is discarded
      throw e;
    }
  }

  override async end() {
    await this.owner.end();
    return super.end();
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // Pool of 20 connections (10 by default) and up to 5 s (2 by default) for a transaction to get one: with 20
  // tablets syncing at once it ran out and the API answered 500 (k6 test, test/perf/RESULTADOS.md). The API and the
  // worker each have their own pool.
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (/-pooler\./.test(connectionString ?? ''))
      throw new Error('DATABASE_URL must be the direct Neon connection (no -pooler): per-institution RLS uses session state');
    super({
      adapter: new PrismaPg(new ScopedPool({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 20) }) as unknown as Pool, {
        disposeExternalPool: true,
      }),
      transactionOptions: { maxWait: 5_000 },
      log: ['error', 'warn'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
