// Spec 103 (API) and 001 (tablet contract): codes, registration, signature, revocation.
import { generateKeyPairSync, KeyObject, sign, pbkdf2Sync } from 'node:crypto';
import { Role } from '../src/auth/domain/entities/user.entity';
import { DevicesRepository } from '../src/devices/domain/ports/devices.repository';
import { inInstitution } from '../src/tenancy/tenancy';
import { createTestApp, TestApp } from './app';

let t: TestApp;
let adminToken: string;

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  await t.createUser('jefe@centro.org', Role.ADMIN);
  adminToken = (await t.login('jefe@centro.org')).token;
});
afterAll(() => t.app.close());

const appKey = () => process.env.APP_KEY!;
const asAdmin = (method: 'get' | 'post', url: string) => t.http()[method](url).auth(adminToken, { type: 'bearer' });
const createCode = (centerPin = '2580') => asAdmin('post', '/devices/registration-codes').send({ centerPin });
const setCenterPin = (pin: string, currentPin?: string) =>
  t.http().put('/settings/center-pin').auth(adminToken, { type: 'bearer' }).send({ currentPin, pin });

// Key pair like the tablet's Keystore one (ECDSA P-256).
function newKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { privateKey, publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
}

async function newCode() {
  await setCenterPin('2580', '2580');
  return (await createCode()).body.code as string;
}

async function register(code: string, keys = newKeys(), ip = t.newIp()) {
  const res = await t
    .http()
    .post('/devices/register')
    .set('X-App-Key', appKey())
    .set('X-Forwarded-For', ip)
    .send({ code, name: 'Tableta Sala 1', model: 'SM-T225', appVersion: '1.0.0', publicKey: keys.publicKey });
  return { res, keys, token: res.body.token as string };
}

// Request signed as the app does it: `METHOD\npath\ntimestamp`.
function signedGet(path: string, token: string, privateKey: KeyObject, timestamp = Date.now()) {
  const signature = sign('sha256', Buffer.from(`GET\n${path}\n${timestamp}`), privateKey).toString('base64');
  return t
    .http()
    .get(path)
    .set('X-App-Key', appKey())
    .set('Authorization', `Device ${token}`)
    .set('X-Device-Timestamp', String(timestamp))
    .set('X-Device-Signature', signature);
}

describe('Registration codes', () => {
  it('8 characters without 0, O, 1 or I, valid 15 minutes; requires the current Center PIN; admin only', async () => {
    expect((await createCode()).body.error).toBe('CenterPinNotSet'); // first it is created in the settings
    await setCenterPin('2580');
    expect((await createCode('9999')).body.error).toBe('WrongCenterPin');
    const res = await createCode();
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const minutes = (new Date(res.body.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);

    await t.createUser('fono@centro.org');
    const { token } = await t.login('fono@centro.org');
    expect((await t.http().post('/devices/registration-codes').auth(token, { type: 'bearer' })).status).toBe(403);
  });
});

describe('POST /devices/register', () => {
  it('redeems the code (lowercase too) for a token and appears in the list', async () => {
    const code = await newCode();
    const { res } = await register(code.toLowerCase());
    expect(res.status).toBe(201);
    expect(res.body.token).toHaveLength(43);

    const list = await asAdmin('get', '/devices');
    expect(list.body.items).toEqual([
      expect.objectContaining({
        id: res.body.deviceId,
        name: 'Tableta Sala 1',
        model: 'SM-T225',
        revokedAt: null,
        stale: false,
        authorizedBy: 'jefe',
      }),
    ]);
    expect(list.body.items[0].publicKey).toBeUndefined();
    expect(await t.prisma.auditLog.count({ where: { action: 'DEVICE_REGISTERED', entity: 'Device' } })).toBe(1);
  });

  it('the code is single-use, and a nonexistent or expired one gives the same error', async () => {
    const code = await newCode();
    await register(code);
    const reused = await register(code);
    expect(reused.res.status).toBe(400);
    expect(reused.res.body).toEqual({ statusCode: 400, error: 'InvalidCode', message: 'Código no válido o vencido' });

    expect((await register('ZZZZZZZZ')).res.body.error).toBe('InvalidCode');

    const expired = await newCode();
    await t.prisma.deviceRegistrationCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await register(expired)).res.body.error).toBe('InvalidCode');
  });

  it('requires X-App-Key and a P-256 public key', async () => {
    const code = await newCode();
    const noKey = await t.http().post('/devices/register').send({ code, name: 'X', publicKey: newKeys().publicKey });
    expect(noKey.status).toBe(403);
    expect(noKey.body.error).toBe('InvalidAppKey');

    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    expect((await register(code, { ...newKeys(), publicKey: rsa })).res.body.error).toBe('InvalidPublicKey');
  });

  it('limits to 10 attempts per IP every 15 minutes', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await register('ZZZZZZZZ', newKeys(), '10.8.8.8')).res.status);
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('Tablet requests (GET /devices/me)', () => {
  it('accepts a valid token + signature and records the last connection', async () => {
    const { keys, token, res } = await register(await newCode());
    const me = await signedGet('/devices/me', token, keys.privateKey);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ deviceId: res.body.deviceId, name: 'Tableta Sala 1' });
    expect((await asAdmin('get', '/devices')).body.items[0].lastSeenAt).not.toBeNull();
  });

  it('rejects a signature from another key, an old date, no signature, no X-App-Key and a foreign token', async () => {
    const { keys, token } = await register(await newCode());
    const reject = async (req: ReturnType<typeof signedGet>, error = 'DeviceUnauthorized') => {
      const res = await req;
      expect(res.body.error).toBe(error);
    };

    await reject(signedGet('/devices/me', token, newKeys().privateKey));
    await reject(signedGet('/devices/me', token, keys.privateKey, Date.now() - 10 * 60_000));
    await reject(signedGet('/devices/me', 'token-inventado', keys.privateKey));
    await reject(t.http().get('/devices/me').set('X-App-Key', appKey()).set('Authorization', `Device ${token}`));
    await reject(signedGet('/devices/me', token, keys.privateKey).set('X-App-Key', 'otra'), 'InvalidAppKey');
    // A user JWT is useless on tablet routes.
    await reject(t.http().get('/devices/me').set('X-App-Key', appKey()).auth(adminToken, { type: 'bearer' }));
  });

  it('a request in flight when the tablet is revoked does not undo the revocation', async () => {
    const { res } = await register(await newCode());
    const id = res.body.deviceId as string;
    const { institutionId } = await t.prisma.device.findUniqueOrThrow({ where: { id } });
    const repo = t.app.get(DevicesRepository);
    // What the request read before the admin revoked it.
    const stale = (await inInstitution(institutionId, () => repo.findDeviceById(id)))!;
    expect((await asAdmin('post', `/devices/${id}/revoke`)).status).toBe(204);

    stale.touch(new Date());
    await inInstitution(institutionId, () => repo.saveLastSeen(stale));
    expect((await t.prisma.device.findUniqueOrThrow({ where: { id } })).revokedAt).not.toBeNull();
  });

  it('revoking cuts access instantly and the tablet is kept', async () => {
    const { keys, token, res } = await register(await newCode());

    expect((await asAdmin('post', `/devices/${res.body.deviceId}/revoke`)).status).toBe(204);
    const me = await signedGet('/devices/me', token, keys.privateKey);
    expect(me.status).toBe(401);

    const [device] = (await asAdmin('get', '/devices')).body.items;
    expect(device.revokedAt).not.toBeNull();
    expect(await t.prisma.auditLog.count({ where: { action: 'DEVICE_REVOKED' } })).toBe(1);

    // A revoked tablet comes back with a new code, as a new tablet.
    expect((await register(await newCode())).res.status).toBe(201);
    expect((await asAdmin('get', '/devices?limit=1')).body).toMatchObject({ total: 2, totalPages: 2, items: [expect.anything()] });
  });

  it('404 when revoking a nonexistent tablet', async () => {
    expect((await asAdmin('post', '/devices/00000000-0000-4000-8000-000000000000/revoke')).status).toBe(404);
  });
});

describe('Center settings (spec 103 FR-008)', () => {
  it('the admin creates and changes the Center PIN (with the current one) and adjusts the settings; the tablet downloads them', async () => {
    expect((await asAdmin('get', '/settings')).body).toMatchObject({
      centerName: 'Centro',
      hasCenterPin: false,
      therapistTimeoutMinutes: 5,
    });
    expect((await setCenterPin('1234')).body.error).toBe('WeakPin');
    expect((await setCenterPin('2580')).body.hasCenterPin).toBe(true);
    expect((await setCenterPin('3691', '1111')).body.error).toBe('WrongCenterPin'); // changing it requires the current one
    expect((await setCenterPin('3691', '2580')).status).toBe(200);
    const updated = await t
      .http()
      .patch('/settings')
      .auth(adminToken, { type: 'bearer' })
      .send({ centerName: 'Centro Cuenca', therapistTimeoutMinutes: 10 });
    expect(updated.body).toMatchObject({ centerName: 'Centro Cuenca', therapistTimeoutMinutes: 10 });
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['CENTER_PIN_SET', 'SETTINGS_UPDATE'] } } })).toBe(3);

    // The registered tablet downloads the name, the inactivity and the Center PIN encrypted in the format it verifies.
    const { res, keys } = await register((await createCode('3691')).body.code as string);
    const settings = await signedGet('/devices/settings', res.body.token as string, keys.privateKey);
    expect(settings.body).toMatchObject({ centerName: 'Centro Cuenca', therapistTimeoutMinutes: 10 });
    const { salt, hash, iterations } = settings.body.centerPin as { salt: string; hash: string; iterations: number };
    expect(pbkdf2Sync('3691', Buffer.from(salt, 'base64'), iterations, 32, 'sha256').toString('base64')).toBe(hash);

    await t.createUser('fono@centro.org');
    const { token } = await t.login('fono@centro.org');
    expect((await t.http().get('/settings').auth(token, { type: 'bearer' })).status).toBe(403); // administrator only
  });
});
