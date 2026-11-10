// Spec 002: each therapist's tablet PIN. She creates it, the API stores it (hash) and the tablet verifies it online.
import { AuthRepository } from '../src/auth/domain/ports/auth.repository';
import { inInstitution } from '../src/tenancy/tenancy';
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, password, TestApp } from './app';

let t: TestApp;
let therapist: string;
let therapistId: string;
let admin: string;
let tablet: Awaited<ReturnType<TestApp['newDevice']>>;

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  therapistId = (await t.createUser('fono@centro.org')).id;
  await t.createUser('jefe@centro.org', Role.ADMIN);
  therapist = (await t.login('fono@centro.org')).token;
  admin = (await t.login('jefe@centro.org')).token;
  tablet = await t.newDevice(admin);
});
afterAll(() => t.app.close());

const as = (token: string, method: 'put' | 'delete', url: string, body?: object) =>
  t.http()[method](url).auth(token, { type: 'bearer' }).send(body);
const setPin = (pin: string, currentPassword = password) => as(therapist, 'put', '/auth/pin', { currentPassword, pin });
const check = (pin: string, id = therapistId) => tablet(`/therapists/${id}/pin-check`, { pin });
const actions = async () => (await t.prisma.auditLog.findMany({ orderBy: { id: 'asc' } })).map((a) => a.action);
const unlock = () => t.prisma.user.update({ where: { id: therapistId }, data: { pinLockedUntil: new Date(0) } });

describe('PUT /auth/pin (the therapist creates her PIN)', () => {
  it('asks for the password, rejects weak PINs and stores only the hash', async () => {
    expect((await setPin('4826', 'OtraClave999')).body).toMatchObject({ statusCode: 400, error: 'WrongPassword' });
    expect((await setPin('1234')).body).toMatchObject({ statusCode: 400, error: 'WeakPin' });
    expect((await setPin('4321')).body).toMatchObject({ statusCode: 400, error: 'WeakPin' });
    expect((await setPin('12a4')).body).toMatchObject({ statusCode: 400, error: 'ValidationError' });

    expect((await setPin('4826')).status).toBe(204);
    const { pinHash } = await t.prisma.user.findUniqueOrThrow({ where: { id: therapistId } });
    expect(pinHash).toMatch(/^\$argon2id\$/);
    expect((await t.login('fono@centro.org')).res.body.user).toMatchObject({ hasPin: true });
    expect(await actions()).toContain('PIN_SET');
  });

  it('the administrator has no tablet PIN', async () => {
    expect((await as(admin, 'put', '/auth/pin', { currentPassword: password, pin: '4826' })).status).toBe(403);
  });
});

describe('GET /therapists (the tablet picks a therapist)', () => {
  it('lists only active therapists with id, name and hasPin, and does not accept JWT', async () => {
    await t.createUser('baja@centro.org', Role.THERAPIST, { active: false });
    await setPin('4826');

    const res = await tablet('/therapists');
    expect(res.body).toMatchObject({ page: 1, total: 1 });
    expect(res.body.items).toEqual([{ id: therapistId, name: 'fono', hasPin: true }]);
    expect((await t.http().get('/therapists').auth(admin, { type: 'bearer' })).status).toBe(403);
  });
});

describe('POST /therapists/:id/pin-check (the tablet verifies the PIN)', () => {
  it('a PIN attempt in flight does not write back the password or the status it read before', async () => {
    const before = await t.prisma.user.findUniqueOrThrow({ where: { id: therapistId } });
    const repo = t.app.get(AuthRepository);
    const stale = (await inInstitution(before.institutionId, () => repo.findUserById(therapistId)))!;
    await t.prisma.user.update({ where: { id: therapistId }, data: { passwordHash: 'cambiada-entre-tanto', active: false } });

    await inInstitution(before.institutionId, () => repo.savePinState(stale));
    expect(await t.prisma.user.findUniqueOrThrow({ where: { id: therapistId } })).toMatchObject({
      passwordHash: 'cambiada-entre-tanto',
      active: false,
    });
  });

  it('with the correct PIN returns the therapist and audits it as a tablet action', async () => {
    await setPin('4826');
    expect((await check('4826')).body).toEqual({ therapistId, name: 'fono' });
    expect(await t.prisma.auditLog.findFirst({ where: { action: 'THERAPIST_PIN_OK' } })).toMatchObject({
      actorType: 'DEVICE',
      entityId: therapistId,
    });
  });

  it('5 consecutive failures lock for 60 s and the tenth voids the PIN', async () => {
    await setPin('4826');
    for (let i = 0; i < 4; i++) expect((await check('9999')).body).toMatchObject({ statusCode: 400, error: 'WrongPin' });
    expect((await check('9999')).body).toMatchObject({ statusCode: 429, error: 'PinLocked' });
    expect((await check('4826')).body).toMatchObject({ error: 'PinLocked' }); // not even the correct one passes during the lockout

    await unlock();
    // Another tablet: each one has its own limit of 10 attempts per minute (spec 106 FR-004); the PIN is voided per therapist.
    tablet = await t.newDevice(admin);
    for (let i = 0; i < 4; i++) expect((await check('9999')).body).toMatchObject({ error: 'WrongPin' });
    expect((await check('9999')).body).toMatchObject({ statusCode: 409, error: 'PinRevoked' }); // tenth failure

    expect((await check('4826')).body).toMatchObject({ statusCode: 409, error: 'PinNotSet' });
    expect(await actions()).toContain('THERAPIST_PIN_REVOKED');
  });

  it('a success resets the failure count', async () => {
    await setPin('4826');
    for (let i = 0; i < 4; i++) await check('9999');
    expect((await check('4826')).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await check('9999')).body).toMatchObject({ error: 'WrongPin' });
  });

  it('without PIN, deactivated or not a therapist', async () => {
    expect((await check('4826')).body).toMatchObject({ statusCode: 409, error: 'PinNotSet' });

    const adminId = (await t.prisma.user.findFirstOrThrow({ where: { email: 'jefe@centro.org' } })).id;
    expect((await check('4826', adminId)).body).toMatchObject({ statusCode: 404, error: 'TherapistNotFound' });

    await setPin('4826');
    await t.prisma.user.update({ where: { id: therapistId }, data: { active: false } });
    expect((await check('4826')).body).toMatchObject({ statusCode: 404, error: 'TherapistNotFound' });
  });
});

describe('DELETE /users/:id/pin (the administrator deletes the PIN)', () => {
  it('deletes it, audits it and the therapist must create another', async () => {
    await setPin('4826');
    expect((await as(therapist, 'delete', `/users/${therapistId}/pin`)).status).toBe(403);
    expect((await as(admin, 'delete', `/users/${therapistId}/pin`)).status).toBe(204);

    expect((await check('4826')).body).toMatchObject({ error: 'PinNotSet' });
    expect(await actions()).toContain('PIN_CLEARED');
  });
});
