// Spec 105: vocabulary catalog categories and their pictograms in order.
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

const as = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, body?: object, token = therapist) =>
  t.http()[method](url).auth(token, { type: 'bearer' }).send(body);

const importArasaac = async (arasaacId: number) => (await as('post', '/pictograms/arasaac', { arasaacId })).body.id as string;
const newCategory = async (name: string) => (await as('post', '/categories', { name, color: '#BA68C8' })).body.id as string;
const labels = (res: { body: { items: { label: string }[] } }) => res.body.items.map((p) => p.label);

describe('Categories', () => {
  it('the therapist creates, edits and deactivates; the name is not repeated (case-insensitive)', async () => {
    const res = await as('post', '/categories', { name: ' Emociones ', color: '#64b5f6', sortOrder: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Emociones', color: '#64B5F6', sortOrder: 2, active: true });

    expect((await as('post', '/categories', { name: 'emociones', color: '#000000' })).status).toBe(409);
    expect((await as('post', '/categories', { name: 'Otra', color: 'azul' })).status).toBe(400);

    const off = await as('patch', `/categories/${res.body.id}`, { active: false, name: 'Sentimientos' });
    expect(off.body).toMatchObject({ name: 'Sentimientos', active: false });
    expect((await as('get', '/categories')).body.total).toBe(1); // the deactivated one is still visible in the catalog
    expect(await t.prisma.auditLog.count({ where: { entity: 'Category' } })).toBe(2);
  });

  it('the admin does not edit the vocabulary', async () => {
    expect((await as('get', '/categories', undefined, admin)).status).toBe(403);
    expect((await as('post', '/categories', { name: 'X', color: '#000000' }, admin)).status).toBe(403);
  });
});

describe('Pictograms of a category', () => {
  it('the array order is the order and the list brings how many each one has', async () => {
    const category = await newCategory('Lugares');
    const [casa, agua] = [await importArasaac(200), await importArasaac(100)];

    expect((await as('put', `/categories/${category}/pictograms`, { pictogramIds: [casa, agua] })).status).toBe(204);
    expect((await as('get', '/categories')).body.items).toEqual([expect.objectContaining({ name: 'Lugares', pictogramCount: 2 })]);
    expect(labels(await as('get', `/categories/${category}/pictograms`))).toEqual(['casa', 'agua']);
  });

  it('appends to the end and removes one without sending the list; the category is paginated', async () => {
    const category = await newCategory('Lugares');
    const [agua, casa, campo] = [await importArasaac(100), await importArasaac(200), await importArasaac(201)];

    for (const id of [agua, casa, campo, agua])
      expect((await as('post', `/categories/${category}/pictograms`, { pictogramId: id })).status).toBe(204);
    const page2 = await as('get', `/categories/${category}/pictograms?page=2&limit=2`);
    expect(page2.body).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 }); // agua was not duplicated
    expect(labels(page2)).toEqual(['casa de campo']);

    expect((await as('delete', `/categories/${category}/pictograms/${casa}`)).status).toBe(204);
    expect(labels(await as('get', `/categories/${category}/pictograms`))).toEqual(['agua', 'casa de campo']);
    expect(await t.prisma.pictogram.count()).toBe(3); // removing from the category does not delete the pictogram
  });

  it('rejects nonexistent pictograms and categories', async () => {
    const category = await newCategory('Acciones');
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await as('put', `/categories/${category}/pictograms`, { pictogramIds: [missing] })).body.error).toBe('UnknownPictograms');
    expect((await as('post', `/categories/${category}/pictograms`, { pictogramId: missing })).body.error).toBe('PictogramNotFound');
    expect((await as('get', `/categories/${missing}/pictograms`)).body.error).toBe('CategoryNotFound');
  });
});
