import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { ArasaacHttpClient } from '../pictograms/infrastructure/arasaac/arasaac-http.client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerModule } from '../worker.module';

// One-off (agreed 2026-10-25): fills in the word type of the ARASAAC pictograms that do not have it yet,
// using the type of their first keyword in ARASAAC, and bumps the version of the boards that have them so the
// tablets receive it. Own images stay unclassified: the therapist classifies them in the panel. Uses the .env
// database and the public ARASAAC API. `node dist/scripts/fill-word-types --dry-run` only shows what it would do.
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn'] }); // without starting the queue
  const prisma = app.get(PrismaService);
  const arasaac = new ArasaacHttpClient();
  const pending = await prisma.pictogram.findMany({
    where: { wordType: null, arasaacId: { not: null } },
    select: { id: true, label: true, arasaacId: true },
    orderBy: { label: 'asc' },
  });
  const filled: string[] = [];
  const lines: string[] = [];
  for (const pictogram of pending) {
    const source = await arasaac.find(pictogram.arasaacId!).catch(() => null);
    lines.push(`${pictogram.label}: ${source?.wordType ?? 'sin tipo en ARASAAC'}`);
    if (!source?.wordType || dryRun) continue;
    await prisma.pictogram.update({ where: { id: pictogram.id }, data: { wordType: source.wordType } });
    filled.push(pictogram.id);
  }
  if (filled.length > 0)
    await prisma.$transaction(async (tx) => {
      // One version per institution (spec 113): bumps the one of each institution that has those pictograms.
      const versions = await tx.$queryRaw<{ institutionId: string; value: number }[]>`
        UPDATE "GlobalSyncVersion" SET value = value + 1
        WHERE "institutionId" IN (SELECT "institutionId" FROM "Pictogram" WHERE id IN (${Prisma.join(filled)}))
        RETURNING "institutionId", value`;
      for (const { institutionId, value } of versions)
        await tx.profile.updateMany({
          where: { institutionId, pictograms: { some: { pictogramId: { in: filled } } } },
          data: { syncVersion: value },
        });
    });
  // To standard output: the context was created with only errors and warnings, so startup does not flood the console.
  process.stdout.write(
    `${lines.join('\n')}\n${dryRun ? 'Prueba sin cambios' : 'Listo'}: ${pending.length} sin tipo, ${filled.length} llenados\n`,
  );
  await app.close();
}

main().catch((error) => {
  Logger.error('Could not fill in the word type', error, 'TipoDePalabra');
  process.exit(1);
});
