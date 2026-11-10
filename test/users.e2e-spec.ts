// Spec 102: user management by the administrator, against the real API.
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, TestApp } from './app';

let t: TestApp;
let admin: { id: string };
let token: string;

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  admin = await t.createUser('jefe@centro.org', Role.ADMIN);
  token = (await t.login('jefe@centro.org')).token;
});
afterAll(() => t.app.close());

const as = (method: 'get' | 'post' | 'patch' | 'put', url: string, body?: object) =>
  t.http()[method](url).auth(token, { type: 'bearer' }).send(body);

describe('POST /users', () => {
  it('creates a therapist with a temporary password, which must be changed on login', async () => {
    const res = await as('post', '/users', { name: ' Ana ', email: 'Ana@Centro.org', temporaryPassword: 'Temporal2026' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Ana', email: 'ana@centro.org', role: 'THERAPIST', active: true, mustChangePassword: true });
    expect(res.body.passwordHash).toBeUndefined();

    const { res: login } = await t.login('ana@centro.org', 'Temporal2026');
    expect(login.body.user.mustChangePassword).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'USER_CREATE', actorId: admin.id } })).toBe(1);
  });

  it('409 with a repeated email and 400 with a weak password or extra role', async () => {
    await t.createUser('ana@centro.org');
    const dup = await as('post', '/users', { name: 'Otra', email: 'ANA@centro.org', temporaryPassword: 'Temporal2026' });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe('Ese correo ya está registrado');

    const weak = await as('post', '/users', { name: 'Otra', email: 'otra@centro.org', temporaryPassword: 'corta' });
    expect(weak.status).toBe(400);
  });

  it('without a role creates therapists; an administrator is never created through the API (only therapist or guardian, spec 112)', async () => {
    const plain = await as('post', '/users', { name: 'X', email: 'x@centro.org', temporaryPassword: 'Temporal2026' });
    expect(plain.body.role).toBe('THERAPIST');
    const admin = await as('post', '/users', { name: 'Y', email: 'y@centro.org', temporaryPassword: 'Temporal2026', role: 'ADMIN' });
    expect(admin.status).toBe(400);
  });
});

describe('GET /users', () => {
  it('lists and filters by role and status', async () => {
    await t.createUser('ana@centro.org');
    await t.createUser('baja@centro.org', Role.THERAPIST, { active: false });

    expect((await as('get', '/users')).body).toMatchObject({ page: 1, limit: 20, total: 3, totalPages: 1 });
    const therapists = await as('get', '/users?role=THERAPIST&active=true');
    expect(therapists.body.items.map((u: { email: string }) => u.email)).toEqual(['ana@centro.org']);
  });

  it('paginates: never returns everything at once and validates page and limit', async () => {
    for (const name of ['b', 'c', 'd', 'e']) await t.createUser(`${name}@centro.org`);
    const second = await as('get', '/users?page=2&limit=2'); // b, c, d, e and jefe (admin), by name
    expect(second.body).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 });
    expect(second.body.items.map((u: { email: string }) => u.email)).toEqual(['d@centro.org', 'e@centro.org']);
    expect((await as('get', '/users?page=9&limit=2')).body.items).toEqual([]);

    for (const bad of ['limit=101', 'limit=0', 'page=0', 'page=uno']) expect((await as('get', `/users?${bad}`)).status).toBe(400);
  });
});

describe('PATCH /users/:id', () => {
  it('deactivating closes the sessions and the token stops working; reactivating restores access', async () => {
    const ana = await t.createUser('ana@centro.org');
    const session = await t.login('ana@centro.org');

    const res = await as('patch', `/users/${ana.id}`, { active: false });
    expect(res.body.active).toBe(false);
    expect((await t.http().post('/auth/refresh').set('Cookie', session.cookie)).status).toBe(401);
    expect((await t.http().post('/auth/change-password').auth(session.token, { type: 'bearer' }).send({})).status).toBe(401);

    await as('patch', `/users/${ana.id}`, { active: true });
    expect((await t.login('ana@centro.org')).res.status).toBe(200);
  });

  it('does not allow deactivating the only active administrator', async () => {
    const res = await as('patch', `/users/${admin.id}`, { active: false });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('LastActiveAdmin');
  });

  it('changing the email closes the sessions and does not accept a taken one', async () => {
    const ana = await t.createUser('ana@centro.org');
    await t.createUser('luis@centro.org');
    const session = await t.login('ana@centro.org');

    expect((await as('patch', `/users/${ana.id}`, { email: 'luis@centro.org' })).status).toBe(409);
    expect((await as('patch', `/users/${ana.id}`, { email: 'ana.p@centro.org', name: 'Ana P' })).body).toMatchObject({
      email: 'ana.p@centro.org',
      name: 'Ana P',
    });
    expect((await t.http().post('/auth/refresh').set('Cookie', session.cookie)).status).toBe(401);
  });

  it('404 if it does not exist and 400 if the id is not a UUID', async () => {
    expect((await as('patch', '/users/00000000-0000-4000-8000-000000000000', { name: 'X' })).status).toBe(404);
    expect((await as('patch', '/users/abc', { name: 'X' })).status).toBe(400);
  });
});

describe('POST /users/:id/temporary-password', () => {
  it('assigns a temporary password and closes the sessions', async () => {
    const ana = await t.createUser('ana@centro.org');
    const session = await t.login('ana@centro.org');

    expect((await as('post', `/users/${ana.id}/temporary-password`, { temporaryPassword: 'Temporal2026' })).status).toBe(204);
    expect((await t.http().post('/auth/refresh').set('Cookie', session.cookie)).status).toBe(401);
    expect((await t.login('ana@centro.org', 'Temporal2026')).res.body.user.mustChangePassword).toBe(true);
  });
});

describe('Pacientes asignados', () => {
  it('replaces the list, shows only code and avatar, and audits the changes', async () => {
    const ana = await t.createUser('ana@centro.org');
    const p1 = await t.createPatient('P-0001', admin.id);
    const p2 = await t.createPatient('P-0002', admin.id);

    await as('put', `/users/${ana.id}/patients`, { patientIds: [p1.id] });
    const res = await as('put', `/users/${ana.id}/patients`, { patientIds: [p2.id, p2.id] });
    expect(res.body).toEqual([{ id: p2.id, code: 'P-0002', avatarId: p2.avatarId }]);
    expect((await as('get', `/users/${ana.id}/patients`)).body).toEqual({ items: res.body, page: 1, limit: 20, total: 1, totalPages: 1 });
    // The admin lists the therapist's ones (with name) and the ones she does not have yet, to assign her more.
    const codes = async (query: string) => ((await as('get', `/patients?${query}`)).body.items as { code: string }[]).map((p) => p.code);
    expect(await codes(`assignedTo=${ana.id}`)).toEqual(['P-0002']);
    expect(await codes(`notAssignedTo=${ana.id}`)).toEqual(['P-0001']);

    const audit = await t.prisma.auditLog.findFirst({ where: { action: 'PATIENTS_ASSIGNED' }, orderBy: { id: 'desc' } });
    expect(audit?.summary).toEqual({ added: ['P-0002'], removed: ['P-0001'] });
  });

  it('only to therapists and only existing patients', async () => {
    const ana = await t.createUser('ana@centro.org');
    const missing = '00000000-0000-4000-8000-000000000000';

    expect((await as('put', `/users/${admin.id}/patients`, { patientIds: [] })).body.error).toBe('NotAssignable');
    expect((await as('put', `/users/${ana.id}/patients`, { patientIds: [missing] })).body.error).toBe('UnknownPatients');
  });
});
