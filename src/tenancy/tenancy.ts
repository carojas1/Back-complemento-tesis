import { AsyncLocalStorage } from 'node:async_hooks';

// Institution of whatever is running (spec 113). Every HTTP request runs inside a context (the global
// interceptor); authentication puts the user's or tablet's institution there and the PrismaService pool sets it on the
// PostgreSQL connection, where RLS filters every query. Without a context (scripts, seeds, the worker when taking a
// job, tests) queries run as the table owner, without RLS.
interface Scope {
  institutionId?: string | null;
  system?: boolean; // sees all institutions (sign-in lookups, platform)
}

const storage = new AsyncLocalStorage<Scope>();

// Base of the data from before spec 113 and template of the catalogs of new institutions.
export const baseInstitutionId = '00000000-0000-4000-8000-000000000001';

export const currentScope = () => storage.getStore();

// The institution of the current request; throws if there is none (a programming error, not the user's).
export function currentInstitution(): string {
  const id = storage.getStore()?.institutionId;
  if (!id) throw new Error('No institution in the context');
  return id;
}

// A Prisma query does not run when created but when awaited: the `await` goes inside the context.
const run = <T>(scope: Scope, fn: () => T | Promise<T>) => storage.run(scope, async () => await fn());

export const inScope = <T>(scope: Scope, fn: () => T) => storage.run(scope, fn); // synchronous: the interceptor subscribes inside
export const inInstitution = <T>(institutionId: string | null, fn: () => T | Promise<T>) => run({ institutionId }, fn);
// For whatever must see all institutions: only lookups by a secret (token, code, e-mail + password) or the platform.
export const asSystem = <T>(fn: () => T | Promise<T>) => run({ system: true }, fn);

// The request's institution is already known (login, refresh, tablet registration): what follows runs inside it.
export function enterInstitution(institutionId: string | null) {
  const scope = storage.getStore();
  if (!scope) throw new Error('enterInstitution outside a context');
  scope.institutionId = institutionId;
}
