// Initial avatars for testing (spec 104): simple SVG figures, uploaded to the bucket like any avatar.
// The administrator replaces them or adds others from the panel. Idempotent: does not duplicate by name.
//   pnpm db:seed:avatars   (INSTITUTION_ID=<uuid> for another institution; defaults to «Centro»)
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { baseInstitutionId, inInstitution } from '../src/tenancy/tenancy';
import { AppModule } from '../src/app.module';
import { CreateCatalogItemUseCase } from '../src/catalogs/application/create-catalog-item.use-case';
import { CatalogsRepository } from '../src/catalogs/domain/ports/catalogs.repository';

// An animal face: colored background, head, ears and eyes. Enough to tell them apart at a glance.
const face = (background: string, head: string, ears: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="${background}"/>${ears}` +
  `<circle cx="50" cy="56" r="28" fill="${head}"/><circle cx="40" cy="52" r="4" fill="#1B2421"/><circle cx="60" cy="52" r="4" fill="#1B2421"/>` +
  `<ellipse cx="50" cy="64" rx="6" ry="4" fill="#1B2421"/></svg>`;
const round = (color: string) => `<circle cx="28" cy="32" r="12" fill="${color}"/><circle cx="72" cy="32" r="12" fill="${color}"/>`;
const pointed = (color: string) =>
  `<polygon points="22,40 30,12 44,32" fill="${color}"/><polygon points="78,40 70,12 56,32" fill="${color}"/>`;
const long = (color: string) =>
  `<ellipse cx="38" cy="22" rx="7" ry="20" fill="${color}"/><ellipse cx="62" cy="22" rx="7" ry="20" fill="${color}"/>`;

const avatars = [
  { name: 'Oso', svg: face('#D3EBE7', '#A1887F', round('#8D6E63')) },
  { name: 'Zorro', svg: face('#FCE9C6', '#F57C00', pointed('#E65100')) },
  { name: 'Conejo', svg: face('#E9ECE7', '#ECEFF1', long('#CFD8DC')) },
  { name: 'Gato', svg: face('#FAE1DE', '#FFB74D', pointed('#FB8C00')) },
  { name: 'Panda', svg: face('#E3F2FD', '#FAFAFA', round('#263238')) },
  { name: 'León', svg: face('#FFF3E0', '#FFCA28', round('#F9A825')) },
  { name: 'Ratón', svg: face('#EDE7F6', '#B0BEC5', round('#90A4AE')) },
  { name: 'Koala', svg: face('#E0F2F1', '#90A4AE', round('#78909C')) },
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    for (const { name, svg } of avatars) {
      if (await app.get(CatalogsRepository).findByName('avatars', name)) {
        console.log(`${name}: ya existe`);
        continue;
      }
      await app.get(CreateCatalogItemUseCase).execute({ kind: 'avatars', name, image: Buffer.from(svg), actorId: null, actorRole: null });
      console.log(`${name}: creado`);
    }
  } finally {
    await app.close();
  }
}

void inInstitution(process.env.INSTITUTION_ID ?? baseInstitutionId, main);
