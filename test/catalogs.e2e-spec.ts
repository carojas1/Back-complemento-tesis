// Spec 104 FR-002: avatar catalogs (admin only), diagnoses and conditions (admin and therapists).
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, png, TestApp } from './app';

let t: TestApp;
let admin: string;
let therapist: string;

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
// Diagnoses and conditions are not emptied between tests (they come with initial values): unique names and cleanup at the end.
const unique = (name: string) => `e2e-${name}-${crypto.randomUUID().slice(0, 8)}`;

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  await t.createUser('jefe@centro.org', Role.ADMIN);
  await t.createUser('fono@centro.org');
  admin = (await t.login('jefe@centro.org')).token;
  therapist = (await t.login('fono@centro.org')).token;
});
afterAll(async () => {
  await t.prisma.diagnosis.deleteMany({ where: { name: { startsWith: 'e2e-' } } });
  await t.prisma.condition.deleteMany({ where: { name: { startsWith: 'e2e-' } } });
  await t.app.close();
});

const as = (token: string) => ({
  get: (url: string) => t.http().get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body?: object) => t.http().post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) => t.http().patch(url).auth(token, { type: 'bearer' }).send(body),
  delete: (url: string) => t.http().delete(url).auth(token, { type: 'bearer' }),
});
const upload = (token: string, name: string, image: Buffer, file = 'avatar.svg') =>
  t.http().post('/catalogs/avatars').auth(token, { type: 'bearer' }).field('name', name).attach('image', image, file);

describe('avatares', () => {
  it('the admin uploads SVG or PNG; they are listed with a signed URL; the therapist cannot create them', async () => {
    const fox = await upload(admin, 'zorro', svg);
    expect(fox.status).toBe(201);
    expect(fox.body).toMatchObject({ name: 'zorro', active: true, imageUrl: expect.stringContaining('avatars/') });
    expect((await upload(admin, 'gato', png, 'gato.png')).status).toBe(201);
    expect((await upload(admin, 'texto', Buffer.from('hola'), 'x.txt')).body).toMatchObject({
      statusCode: 400,
      error: 'InvalidAvatarImage',
    });
    expect((await upload(admin, 'zorro', svg)).body).toMatchObject({ statusCode: 409, error: 'CatalogNameTaken' });
    expect((await upload(therapist, 'oso', svg)).status).toBe(403);

    const list = await as(therapist).get('/catalogs/avatars?limit=1');
    expect(list.body).toMatchObject({ total: 2, totalPages: 2, items: [{ name: 'gato' }] });
  });

  it('deleting removes the one nobody uses and deactivates the one a patient uses', async () => {
    const free = (await upload(admin, 'libre', svg)).body.id as string;
    expect((await as(admin).delete(`/catalogs/avatars/${free}`)).body).toEqual({ deleted: true, deactivated: false });

    const owner = await t.prisma.user.findFirstOrThrow({ where: { email: 'jefe@centro.org' } });
    const patient = await t.createPatient('P-9001', owner.id);
    expect((await as(admin).delete(`/catalogs/avatars/${patient.avatarId}`)).body).toEqual({ deleted: false, deactivated: true });
    expect((await as(admin).get('/catalogs/avatars?active=true')).body.total).toBe(0);
  });
});

describe('diagnoses and conditions', () => {
  it('admin and therapists add, edit and delete them; the name is unique', async () => {
    const name = unique('fluidez');
    const created = await as(therapist).post('/catalogs/diagnoses', { name });
    expect(created.body).toMatchObject({ name, active: true });
    expect((await as(admin).post('/catalogs/diagnoses', { name: name.toUpperCase() })).status).toBe(409);

    const id = created.body.id as string;
    expect((await as(admin).patch(`/catalogs/diagnoses/${id}`, { active: false })).body).toMatchObject({ active: false });
    expect((await as(therapist).delete(`/catalogs/diagnoses/${id}`)).body).toEqual({ deleted: true, deactivated: false });
    expect((await as(admin).post('/catalogs/conditions', { name: unique('down') })).status).toBe(201);
    expect((await as(admin).get('/catalogs/otros')).status).toBe(400);
  });
});
