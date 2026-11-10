// Spec 105/003: what the tablet reads (GET /vocabulary), only what is active and with the device signature.
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, TestApp } from './app';

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

const as = (method: 'get' | 'post' | 'patch' | 'put', url: string, body?: object) =>
  t.http()[method](url).auth(therapist, { type: 'bearer' }).send(body);

const importArasaac = async (arasaacId: number) => (await as('post', '/pictograms/arasaac', { arasaacId })).body.id as string;

describe('GET /vocabulary (tableta)', () => {
  it('only the active categories and pictograms arrive, in order and paginated', async () => {
    const category = (await as('post', '/categories', { name: 'Lugares', color: '#BA68C8' })).body.id as string;
    const [casa, agua] = [await importArasaac(200), await importArasaac(100)];
    await as('put', `/categories/${category}/pictograms`, { pictogramIds: [casa, agua] });
    await as('patch', `/pictograms/${agua}`, { active: false });

    const tablet = await t.newDevice(admin);
    const vocabulary = await tablet('/vocabulary');
    expect(vocabulary.status).toBe(200);
    expect(vocabulary.body).toMatchObject({ page: 1, total: 1 });
    expect(vocabulary.body.items).toEqual([
      expect.objectContaining({ name: 'Lugares', pictograms: [expect.objectContaining({ label: 'casa' })] }),
    ]);

    await as('patch', `/categories/${category}`, { active: false });
    expect((await tablet('/vocabulary')).body).toMatchObject({ items: [], total: 0 });
  });

  it('does not send empty categories or those with only inactive pictograms (105 FR-003)', async () => {
    const empty = (await as('post', '/categories', { name: 'Vacía', color: '#64B5F6' })).body.id as string;
    const inactive = (await as('post', '/categories', { name: 'Inactivos', color: '#FFB74D' })).body.id as string;
    const agua = await importArasaac(100);
    await as('put', `/categories/${inactive}/pictograms`, { pictogramIds: [agua] });
    await as('patch', `/pictograms/${agua}`, { active: false });

    const tablet = await t.newDevice(admin);
    expect((await tablet('/vocabulary')).body).toMatchObject({ items: [], total: 0 });

    await as('post', `/categories/${empty}/pictograms`, { pictogramId: await importArasaac(200) });
    expect((await tablet('/vocabulary')).body.items).toEqual([expect.objectContaining({ name: 'Vacía' })]);
  });

  it('rejects the user JWT: it is a tablet route', async () => {
    expect((await as('get', '/vocabulary')).status).toBe(403); // sin X-App-Key
  });
});
