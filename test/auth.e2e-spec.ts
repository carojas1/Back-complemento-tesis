// Spec 101: login, refresh, recovery, temporary password and roles, against the real API.
import { AuthMailer } from '../src/auth/domain/ports/auth-notifications.ports';
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, password, TestApp } from './app';

let t: TestApp;
beforeAll(async () => (t = await createTestApp()));
beforeEach(() => t.reset());
afterAll(() => t.app.close());

describe('POST /auth/login', () => {
  it('logs in with an email regardless of case and sets the refresh cookie httpOnly', async () => {
    await t.createUser('fono@centro.org');
    const { res } = await t.login(' FONO@centro.org ');

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'fono', role: 'THERAPIST', mustChangePassword: false });
    expect(res.headers['set-cookie'][0]).toMatch(/refresh=.+HttpOnly.+SameSite=Strict/i);
    expect(await t.prisma.auditLog.count({ where: { action: 'LOGIN_SUCCESS' } })).toBe(1);
  });

  it('same 401 for wrong password, nonexistent email and deactivated user', async () => {
    await t.createUser('fono@centro.org');
    await t.createUser('baja@centro.org', Role.THERAPIST, { active: false });

    for (const [email, pass] of [
      ['fono@centro.org', 'Mala1234567'],
      ['nadie@centro.org', password],
      ['baja@centro.org', password],
    ]) {
      const { res } = await t.login(email, pass);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ statusCode: 401, error: 'InvalidCredentials', message: 'Correo o contraseña incorrectos' });
    }
  });

  it('locks the e-mail from that address after 5 failures, and other addresses can still sign in', async () => {
    await t.createUser('fono@centro.org');
    const attempt = (pass: string, ip: string) =>
      t.http().post('/auth/login').set('X-Forwarded-For', ip).send({ email: 'fono@centro.org', password: pass });
    for (let i = 0; i < 5; i++) {
      expect((await attempt('Mala1234567', '198.51.100.7')).status).toBe(401);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    const locked = await attempt(password, '198.51.100.7');
    expect(locked.status).toBe(429);
    expect(locked.body.error).toBe('AccountLocked');
    expect((await attempt(password, '198.51.100.8')).status).toBe(200);
  });

  it('a made-up device token does not escape the limit on public routes', async () => {
    const send = (i: number) =>
      t
        .http()
        .post('/auth/login')
        .set('X-Forwarded-For', '10.9.9.10')
        .set('Authorization', `Device inventado-${i}`)
        .send({ email: 'x@centro.org', password: 'Mala1234567' });
    const statuses = (await Promise.all(Array.from({ length: 11 }, (_, i) => send(i)))).map((res) => res.status);
    expect(statuses).toContain(429);
  });

  it('the rate limit cuts off bursts from the same IP (10 logins per minute)', async () => {
    const send = () => t.http().post('/auth/login').set('X-Forwarded-For', '10.9.9.9').send({ email: 'x@centro.org', password });
    const statuses = (await Promise.all(Array.from({ length: 11 }, send))).map((res) => res.status);
    expect(statuses).toContain(429);
  });

  it('validates the body', async () => {
    const res = await t.http().post('/auth/login').send({ email: 'no-es-correo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });
});

describe('Refresh and logout', () => {
  it('rotates the cookie; reusing an old one closes all sessions, except a race within 30 s', async () => {
    await t.createUser('fono@centro.org');
    const { cookie: first } = await t.login('fono@centro.org');

    const second = await t.http().post('/auth/refresh').set('Cookie', first);
    expect(second.status).toBe(200);
    const secondCookie = second.headers['set-cookie'][0].split(';')[0];

    // Within 30 s it is a race from the same browser (two tabs): only that request fails.
    expect((await t.http().post('/auth/refresh').set('Cookie', first)).status).toBe(401);
    const third = await t.http().post('/auth/refresh').set('Cookie', secondCookie);
    expect(third.status).toBe(200);
    const thirdCookie = third.headers['set-cookie'][0].split(';')[0];

    // After that it is a stolen token: all sessions are closed.
    await t.prisma.refreshToken.updateMany({ where: { revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    expect((await t.http().post('/auth/refresh').set('Cookie', first)).status).toBe(401);
    expect((await t.http().post('/auth/refresh').set('Cookie', thirdCookie)).status).toBe(401);
  });

  it('logout revokes the cookie', async () => {
    await t.createUser('fono@centro.org');
    const { cookie } = await t.login('fono@centro.org');

    expect((await t.http().post('/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await t.http().post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('the app (X-App-Key) receives the refresh in the body, rotates it and revokes it; without the key the body is useless', async () => {
    await t.createUser('fono@centro.org');
    const app = (path: string, body: object) => t.http().post(path).set('X-App-Key', process.env.APP_KEY!).send(body);
    const login = await app('/auth/login', { email: 'fono@centro.org', password });
    expect(login.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });

    expect((await t.http().post('/auth/refresh').send({ refreshToken: login.body.refreshToken })).status).toBe(401);
    const renewed = await app('/auth/refresh', { refreshToken: login.body.refreshToken });
    expect(renewed.status).toBe(200);
    expect(renewed.body.refreshToken).not.toBe(login.body.refreshToken);

    expect((await app('/auth/logout', { refreshToken: renewed.body.refreshToken })).status).toBe(204);
    expect((await app('/auth/refresh', { refreshToken: renewed.body.refreshToken })).status).toBe(401);
  });

  it('the web does not receive the refresh in the body', async () => {
    await t.createUser('fono@centro.org');
    const res = await t.http().post('/auth/login').send({ email: 'fono@centro.org', password });
    expect(res.body.refreshToken).toBeUndefined();
  });
});

describe('Password recovery', () => {
  it('responds 204 even if the email does not exist, without sending anything', async () => {
    const res = await t.http().post('/auth/forgot-password').send({ email: 'nadie@centro.org' });
    expect(res.status).toBe(204);
    expect(t.mails).toHaveLength(0);
  });

  it('the link is single-use, closes the sessions and removes the temporary password', async () => {
    await t.createUser('fono@centro.org', Role.THERAPIST, { mustChangePassword: true });
    const { cookie } = await t.login('fono@centro.org');
    await t.http().post('/auth/forgot-password').send({ email: 'fono@centro.org' });
    const { token } = t.mails.at(-1)!;

    const reset = () => t.http().post('/auth/reset-password').send({ token, newPassword: 'NuevaClave2026' });
    expect((await reset()).status).toBe(204);
    expect((await reset()).body.error).toBe('InvalidToken');
    expect((await t.http().post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);

    const { res } = await t.login('fono@centro.org', 'NuevaClave2026');
    expect(res.body.user.mustChangePassword).toBe(false);
  });

  it('a new password ends every older link sent to that person', async () => {
    await t.createUser('fono@centro.org');
    await t.http().post('/auth/forgot-password').set('X-Forwarded-For', '10.7.7.1').send({ email: 'fono@centro.org' });
    const older = t.mails.at(-1)!.token;
    await t.http().post('/auth/forgot-password').set('X-Forwarded-For', '10.7.7.2').send({ email: 'fono@centro.org' });
    const newer = t.mails.at(-1)!.token;
    expect(newer).not.toBe(older);

    expect((await t.http().post('/auth/reset-password').send({ token: newer, newPassword: 'NuevaClave2026' })).status).toBe(204);
    expect((await t.http().post('/auth/reset-password').send({ token: older, newPassword: 'OtraClave2026' })).body.error).toBe(
      'InvalidToken',
    );
  });

  it('a failed mail server does not change the answer', async () => {
    await t.createUser('fono@centro.org');
    const mailer = t.app.get(AuthMailer);
    const original = mailer.sendPasswordReset.bind(mailer);
    mailer.sendPasswordReset = () => Promise.reject(new Error('smtp down'));
    const res = await t.http().post('/auth/forgot-password').set('X-Forwarded-For', '10.7.7.3').send({ email: 'fono@centro.org' });
    mailer.sendPasswordReset = original;
    expect(res.status).toBe(204);
  });

  it('rejects weak passwords', async () => {
    const res = await t.http().post('/auth/reset-password').send({ token: 'x', newPassword: 'solotexto' });
    expect(res.status).toBe(400);
  });
});

describe('Clave temporal (POST /auth/change-password)', () => {
  it('blocks everything until it is changed and then lets through', async () => {
    await t.createUser('jefe@centro.org', Role.ADMIN, { mustChangePassword: true });
    const { res, token } = await t.login('jefe@centro.org');
    expect(res.body.user.mustChangePassword).toBe(true);

    const blocked = await t.http().get('/users').auth(token, { type: 'bearer' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('PasswordChangeRequired');

    const change = (body: object) => t.http().post('/auth/change-password').auth(token, { type: 'bearer' }).send(body);
    expect((await change({ currentPassword: 'Otra1234567', newPassword: 'MiClave2026' })).body.error).toBe('WrongPassword');
    expect((await change({ currentPassword: password, newPassword: password })).body.error).toBe('PasswordUnchanged');

    const ok = await change({ currentPassword: password, newPassword: 'MiClave2026' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.mustChangePassword).toBe(false);
    expect((await t.http().get('/users').auth(token, { type: 'bearer' })).status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'PASSWORD_CHANGED' } })).toBe(1);
  });
});

describe('Roles', () => {
  it('no token 401; therapist on an admin route 403', async () => {
    await t.createUser('fono@centro.org');
    const { token } = await t.login('fono@centro.org');

    expect((await t.http().get('/users')).status).toBe(401);
    const res = await t.http().get('/users').auth(token, { type: 'bearer' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('No tiene permiso');
  });
});
