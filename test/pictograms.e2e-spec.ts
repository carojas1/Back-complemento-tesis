// Spec 105: pictograms saved on the server (ARASAAC and own images) with the images in the bucket.
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, png, TestApp } from './app';

let t: TestApp;
let therapist: string;
let admin: string;

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  t.arasaac.down = false;
  await t.createUser('fono@centro.org');
  await t.createUser('jefe@centro.org', Role.ADMIN);
  therapist = (await t.login('fono@centro.org')).token;
  admin = (await t.login('jefe@centro.org')).token;
});
afterAll(() => t.app.close());

const as = (method: 'get' | 'post' | 'patch', url: string, body?: object, token = therapist) =>
  t.http()[method](url).auth(token, { type: 'bearer' }).send(body);

const importArasaac = async (arasaacId: number) => (await as('post', '/pictograms/arasaac', { arasaacId })).body.id as string;

describe('Pictogramas de ARASAAC', () => {
  it('copies the image to the bucket, stores only the path and is idempotent', async () => {
    const first = await as('post', '/pictograms/arasaac', { arasaacId: 100 });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ arasaacId: 100, label: 'agua', active: true });
    expect(first.body.imageUrl).toContain('pictograms/arasaac/100.png');

    const row = await t.prisma.pictogram.findFirstOrThrow({ where: { arasaacId: 100 } });
    expect(row.imagePath).toBe('pictograms/arasaac/100.png'); // the database does not store the URL
    if (t.memoryStorage) expect(t.memoryStorage.files.get(row.imagePath)).toEqual(png);

    const again = await as('post', '/pictograms/arasaac', { arasaacId: 100 });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await t.prisma.pictogram.count()).toBe(1);
  });

  it('404 if ARASAAC does not have the pictogram', async () => {
    expect((await as('post', '/pictograms/arasaac', { arasaacId: 999 })).body.error).toBe('ArasaacPictogramNotFound');
  });

  it('the search flags the already saved ones; if ARASAAC does not respond, it returns the saved ones and reports it', async () => {
    await importArasaac(200);
    const res = await as('get', '/pictograms/arasaac?q=casa');
    expect(res.body.arasaacAvailable).toBe(true);
    expect(res.body.items.map((r: { arasaacId: number; saved: boolean }) => [r.arasaacId, r.saved])).toEqual([
      [200, true],
      [201, false],
    ]);

    t.arasaac.down = true;
    const fallback = await as('get', '/pictograms/arasaac?q=casa');
    expect(fallback.body.arasaacAvailable).toBe(false);
    expect(fallback.body.items.map((p: { label: string }) => p.label)).toEqual(['casa']);
    expect((await as('post', '/pictograms/arasaac', { arasaacId: 201 })).body.error).toBe('ArasaacUnavailable');
  });

  it('paginates the saved ones and the ARASAAC search', async () => {
    for (const id of [100, 200, 201]) await importArasaac(id);
    expect((await as('get', '/pictograms?limit=2')).body).toMatchObject({ total: 3, totalPages: 2 });
    expect((await as('get', '/pictograms/arasaac?q=casa&limit=1&page=2')).body).toMatchObject({
      total: 2,
      items: [expect.objectContaining({ arasaacId: 201 })],
    });
  });
});

describe('Own images and editing', () => {
  it('accepts PNG verified by its bytes and rejects what is not an image', async () => {
    const upload = (file: Buffer, name: string) =>
      t.http().post('/pictograms').auth(therapist, { type: 'bearer' }).field('label', 'Mi perro').attach('image', file, name);

    const ok = await upload(png, 'perro.png');
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ arasaacId: null, label: 'Mi perro' });
    expect((await t.prisma.pictogram.findFirstOrThrow()).imagePath).toMatch(/^pictograms\/uploads\/[0-9a-f-]+\.png$/);

    expect((await upload(Buffer.from('no soy una imagen'), 'falso.png')).body.error).toBe('InvalidImage');
    const noFile = await t.http().post('/pictograms').auth(therapist, { type: 'bearer' }).field('label', 'Nada');
    expect(noFile.body.error).toBe('InvalidImage');
  });

  it('changes the label and deactivates; the admin does not edit pictograms', async () => {
    const id = await importArasaac(100);
    expect((await as('patch', `/pictograms/${id}`, { label: 'agua fría', active: false })).body).toMatchObject({
      label: 'agua fría',
      active: false,
    });
    expect((await as('get', '/pictograms', undefined, admin)).status).toBe(403);
  });

  it('brings the word type from ARASAAC and the therapist corrects it or leaves it unclassified (agreed 2026-10-25)', async () => {
    const id = await importArasaac(100);
    expect((await as('get', '/pictograms')).body.items[0]).toMatchObject({ label: 'agua', wordType: 'THING' });
    expect((await as('patch', `/pictograms/${id}`, { wordType: 'ACTION' })).body.wordType).toBe('ACTION');
    expect((await as('patch', `/pictograms/${id}`, { wordType: 'VERBO' })).status).toBe(400);
    expect((await as('patch', `/pictograms/${id}`, { wordType: null })).body.wordType).toBeNull();
    expect(await t.prisma.auditLog.count({ where: { action: 'PICTOGRAM_UPDATE' } })).toBe(2);
  });
});
