// Loads the basic vocabulary of spec 105 from ARASAAC: 5 categories and 40 pictograms, with the images in the bucket.
// Idempotent: does not duplicate pictograms and does not touch categories that already exist (they may have therapist changes).
//   pnpm db:seed:vocabulary   (INSTITUTION_ID=<uuid> for another institution; defaults to «Centro»)
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { baseInstitutionId, inInstitution } from '../src/tenancy/tenancy';
import { AppModule } from '../src/app.module';
import { CreateCategoryUseCase } from '../src/categories/application/create-category.use-case';
import { ImportArasaacPictogramUseCase } from '../src/pictograms/application/import-arasaac-pictogram.use-case';
import { ReplaceCategoryPictogramsUseCase } from '../src/categories/application/replace-category-pictograms.use-case';
import { CategoriesRepository } from '../src/categories/domain/ports/categories.repository';
import { ArasaacClient } from '../src/pictograms/domain/ports/pictograms.repository';

// ⚑ Draft for the speech therapist to validate or replace (agreed 2026-10-21).
const basicVocabulary = [
  { name: 'Necesidades', color: '#FFB74D', words: ['agua', 'comer', 'baño', 'dormir', 'ayuda', 'más', 'sí', 'no'] },
  { name: 'Emociones', color: '#64B5F6', words: ['feliz', 'triste', 'enfadado', 'miedo', 'cansado', 'dolor', 'sorpresa', 'tranquilo'] },
  { name: 'Personas', color: '#FFD54F', words: ['yo', 'mamá', 'papá', 'hermano', 'abuela', 'amigo', 'profesora', 'bebé'] },
  { name: 'Acciones', color: '#81C784', words: ['querer', 'jugar', 'ir', 'dar', 'mirar', 'abrir', 'beber', 'escuchar'] },
  { name: 'Lugares', color: '#BA68C8', words: ['casa', 'escuela', 'parque', 'cocina', 'hospital', 'tienda', 'calle', 'habitación'] },
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const log = { log: console.log, warn: console.warn }; // the Nest logger stays at error/warn so startup is not shown
  try {
    const arasaac = app.get(ArasaacClient);
    const categories = app.get(CategoriesRepository);

    for (const [sortOrder, { name, color, words }] of basicVocabulary.entries()) {
      if (await categories.findCategoryByName(name)) {
        log.log(`${name}: already exists, left untouched`);
        continue;
      }
      const category = await app.get(CreateCategoryUseCase).execute({ name, color, sortOrder, actorId: null });

      const pictogramIds: string[] = [];
      for (const word of words) {
        const results = await arasaac.search(word);
        const match = results.find((r) => r.label.toLowerCase() === word) ?? results[0]; // the exact word, if ARASAAC has it
        if (!match) {
          log.warn(`${name}: ARASAAC no tiene "${word}"`);
          continue;
        }
        const { pictogram } = await app
          .get(ImportArasaacPictogramUseCase)
          .execute({ arasaacId: match.arasaacId, label: word, actorId: null });
        pictogramIds.push(pictogram.id);
      }
      await app.get(ReplaceCategoryPictogramsUseCase).execute({ id: category.id, pictogramIds, actorId: null });
      log.log(`${name}: ${pictogramIds.length} pictogramas`);
    }
  } finally {
    await app.close();
  }
}

inInstitution(process.env.INSTITUTION_ID ?? baseInstitutionId, main).catch((error: Error) => {
  Logger.error(error.message, 'vocabulary');
  process.exitCode = 1;
});
