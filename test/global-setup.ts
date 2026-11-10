// The e2e tests delete tables: they use DATABASE_URL_TEST, or DATABASE_URL if the database is test-only.
import 'dotenv/config';
import { execSync } from 'node:child_process';

export default function globalSetup() {
  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL_TEST o DATABASE_URL');
  // No advisory lock: through the Neon pooler the lock can stay held by a recycled connection
  // and only the tests migrate this database.
  const env = { ...process.env, DATABASE_URL: url, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1' };
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env });
}
