import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'ts-node prisma/seed.ts' },
  // Solo la usa la CLI (migrate). La app se conecta en src/prisma/prisma.service.ts.
  datasource: { url: env('DATABASE_URL') },
});
