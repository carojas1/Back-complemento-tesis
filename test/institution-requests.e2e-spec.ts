// Spec 113: «Solicitar cuenta» from the app and review by the super administrator. Validated and sanitized inputs
// (OWASP ASVS V2 and V8, API3: mass assignment), submission limit and function-level permissions (API5).
import { Role } from '../src/auth/domain/entities/user.entity';
import { privacyNoticeVersion } from '../src/institutions/domain/entities/institution-request.entity';
import { createTestApp, institutionA, password, TestApp } from './app';

let t: TestApp;
let superAdmin: string;
let admin: string;

const form = (overrides: object = {}) => ({
  institutionName: '  Fundación   Sonrisas ',
  ruc: '0190012345001',
  city: 'Cuenca',
  kind: 'Centro de terapia',
  contactName: 'María Pérez',
  contactEmail: ' Direccion@Sonrisas.org ',
  contactPhone: '0991234567',
  approxPatients: 40,
  privacyVersion: privacyNoticeVersion,
  ...overrides,
});
// Each submission from another IP, except in the limit test.
const send = (body: object, ip = t.newIp()) =>
  t.http().post('/institution-requests').set('X-App-Key', process.env.APP_KEY!).set('X-Forwarded-For', ip).send(body);
const as = (token: string) => ({
  get: (url: string) => t.http().get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body?: object) => t.http().post(url).auth(token, { type: 'bearer' }).send(body),
});

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  await t.createUser('plataforma@necon.org', Role.SUPER_ADMIN);
  await t.createUser('jefe@centro.org', Role.ADMIN);
  superAdmin = (await t.login('plataforma@necon.org')).token;
  admin = (await t.login('jefe@centro.org')).token;
  t.mails.length = 0;
});
afterAll(() => t.app.close());

describe('POST /institution-requests (public)', () => {
  it('saves the pending request, with clean texts and the privacy notice accepted', async () => {
    const res = await send(form());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), status: 'PENDING', createdAt: expect.any(String) });
    const saved = await t.prisma.institutionRequest.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(saved).toMatchObject({
      institutionName: 'Fundación Sonrisas',
      contactEmail: 'direccion@sonrisas.org',
      privacyVersion: privacyNoticeVersion,
      privacyAcceptedAt: expect.any(Date),
      institutionId: null,
    });
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'INSTITUTION_REQUEST_CREATE' } });
    expect(audit.institutionId).toBeNull(); // platform event: no center sees it
  });

  it('rejects invalid data and saves nothing', async () => {
    const invalid = [
      { institutionName: undefined },
      { ruc: '123' },
      { ruc: '9990012345001' }, // province 99 does not exist
      { ruc: '0190012345002' }, // does not end in 001
      { contactEmail: 'no-es-correo' },
      { contactPhone: 'llámeme' },
      { approxPatients: 0 },
      { approxPatients: 'muchos' },
      { privacyVersion: '2020-01-01' }, // old or unaccepted notice
      { privacyVersion: undefined },
      { institutionName: 'A' },
      { institutionName: 'x'.repeat(121) },
      { message: 'x'.repeat(1001) },
    ];
    for (const overrides of invalid)
      expect([JSON.stringify(overrides), (await send(form(overrides))).status]).toEqual([JSON.stringify(overrides), 400]);
    expect(await t.prisma.institutionRequest.count()).toBe(0);
  });

  it('sanitization: no HTML tags or control characters (ASVS 1.2, 1.3)', async () => {
    const attacks = [
      { institutionName: '<script>alert(1)</script>' },
      { institutionName: 'Centro <b>uno</b>' },
      { city: 'Cuenca\u0000' },
      { contactName: 'María<img src=x onerror=alert(1)>' },
      { contactName: 'Robert\'); DROP TABLE "User";--' },
      { kind: 'Centro\u001b[31m' },
      { message: 'Hola <a href="javascript:alert(1)">aquí</a>' },
    ];
    for (const overrides of attacks)
      expect([JSON.stringify(overrides), (await send(form(overrides))).status]).toEqual([JSON.stringify(overrides), 400]);
    expect(await t.prisma.institutionRequest.count()).toBe(0);
    expect(await t.prisma.user.count()).toBe(2); // the table is still there
    // The message does accept line breaks.
    expect((await send(form({ message: 'Somos 5 terapeutas.\nAtendemos niños con síndrome de Down.' }))).status).toBe(201);
  });

  it('ignores the fields that are not part of the form: the status and the institution cannot be sent (API3)', async () => {
    const res = await send(form({ status: 'APPROVED', institutionId: institutionA, reviewedBy: 'yo', id: crypto.randomUUID() }));
    expect(res.status).toBe(201);
    expect(await t.prisma.institutionRequest.findUniqueOrThrow({ where: { id: res.body.id } })).toMatchObject({
      status: 'PENDING',
      institutionId: null,
      reviewedBy: null,
    });
  });

  it('requires X-App-Key; one request per RUC under review; a RUC with an account cannot request another', async () => {
    expect((await t.http().post('/institution-requests').send(form())).body).toMatchObject({ error: 'InvalidAppKey' });
    expect((await send(form())).status).toBe(201);
    expect((await send(form())).body.error).toBe('RequestAlreadyPending');
    await t.prisma.institution.create({ data: { name: 'Otra', ruc: '0190099999001' } });
    expect((await send(form({ ruc: '0190099999001' }))).body.error).toBe('InstitutionExists');
  });

  it('5 per hour from the same IP', async () => {
    const ip = t.newIp();
    for (let i = 0; i < 5; i++) expect((await send(form({ ruc: `01900${String(i).padStart(5, '0')}001` }), ip)).status).toBe(201);
    expect((await send(form({ ruc: '0190088888001' }), ip)).status).toBe(429);
  });
});

describe('/platform (super administrador)', () => {
  const pending = async () => (await send(form())).body.id as string;

  it('only the super administrator gets in; no center role (API5)', async () => {
    const id = await pending();
    for (const role of [Role.ADMIN, Role.THERAPIST, Role.PARENT]) {
      await t.createUser(`${role.toLowerCase()}@centro.org`, role);
      const token = (await t.login(`${role.toLowerCase()}@centro.org`)).token;
      for (const url of ['/platform/requests', `/platform/requests/${id}`, '/platform/institutions'])
        expect([role, url, (await as(token).get(url)).status]).toEqual([role, url, 403]);
      expect((await as(token).post(`/platform/requests/${id}/approve`)).status).toBe(403);
    }
    expect((await t.http().get('/platform/requests')).status).toBe(401);
  });

  it("the super administrator does not see a center's data", async () => {
    const patient = await t.createPatient('P-0001', (await t.prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } })).id);
    for (const url of ['/patients', `/patients/${patient.id}`, '/users', '/devices', '/audit', '/sessions/' + crypto.randomUUID()])
      expect([url, (await as(superAdmin).get(url)).status]).toEqual([url, 403]);
    expect((await as(superAdmin).get('/catalogs/avatars')).status).toBe(403);
    // And even if a route let it through, RLS does not let it see rows from any center (tested in tenancy.e2e-spec.ts).
  });

  it('paginated list by status and the detail is recorded in the audit log', async () => {
    const id = await pending();
    await send(form({ ruc: '0190054321001' }));
    const list = await as(superAdmin).get('/platform/requests?status=PENDING&limit=1');
    expect(list.body).toMatchObject({ total: 2, totalPages: 2, items: [expect.objectContaining({ status: 'PENDING' })] });
    for (const field of ['ip', 'contactName', 'contactEmail', 'contactPhone', 'ruc']) expect(list.body.items[0]).not.toHaveProperty(field);
    expect((await as(superAdmin).get('/platform/requests?status=ACEPTADA')).status).toBe(400);
    expect((await as(superAdmin).get(`/platform/requests/${id}`)).body).toMatchObject({ id, contactName: 'María Pérez' });
    expect(await t.prisma.auditLog.count({ where: { action: 'INSTITUTION_REQUEST_READ', entityId: id } })).toBe(1);
    expect((await as(superAdmin).get(`/platform/requests/${crypto.randomUUID()}`)).body.error).toBe('RequestNotFound');
  });

  it('approving creates the ready-to-use institution, with copied catalogs and its first administrator', async () => {
    // Template catalog («Centro»): copied by each new institution.
    const therapist = await t.createUser('ana@centro.org');
    const ana = (await t.login('ana@centro.org')).token;
    await as(ana).post('/catalogs/diagnoses', { name: 'Trastorno del lenguaje' });
    await as(ana).post('/catalogs/conditions', { name: 'Síndrome de Down' });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
    await t.http().post('/catalogs/avatars').auth(admin, { type: 'bearer' }).field('name', 'Oso').attach('image', svg, 'o.svg');
    const arasaac = (await as(ana).post('/pictograms/arasaac', { arasaacId: 100, label: 'agua' })).body.id as string;
    const category = (await as(ana).post('/categories', { name: 'Necesidades', color: '#FFB74D' })).body.id as string;
    await as(ana).post(`/categories/${category}/pictograms`, { pictogramId: arasaac });
    await t.createPatient('P-0007', therapist.id);

    const id = await pending();
    const approved = await as(superAdmin).post(`/platform/requests/${id}/approve`);
    expect(approved.status).toBe(201);
    const institutionId = approved.body.institution.id as string;
    expect(approved.body).toMatchObject({
      institution: { name: 'Fundación Sonrisas', ruc: '0190012345001' },
      admin: { email: 'direccion@sonrisas.org', temporaryPassword: expect.stringMatching(/^[A-Za-z2-9]{12}$/) },
    });
    expect(JSON.stringify(approved.body)).not.toMatch(/passwordHash/);

    // The temporary password arrives once in the response (shown by the tablet app) and by email; only its hash is stored.
    // Al entrar obliga a cambiarla.
    const temporaryPassword = approved.body.admin.temporaryPassword as string;
    const mail = t.mails.find((m) => m.email === 'direccion@sonrisas.org')!;
    expect(mail).toMatchObject({ institution: 'Fundación Sonrisas', token: temporaryPassword });
    const stored = await t.prisma.user.findFirstOrThrow({ where: { institutionId, email: 'direccion@sonrisas.org' } });
    expect(stored.passwordHash).not.toContain(temporaryPassword);
    expect(JSON.stringify((await as(superAdmin).get(`/platform/institutions/${institutionId}`)).body)).not.toContain(temporaryPassword);
    const first = await t.login('direccion@sonrisas.org', mail.token);
    expect(first.res.body.user).toMatchObject({ role: 'ADMIN', mustChangePassword: true, institutionId });
    await as(first.token).post('/auth/change-password', { currentPassword: mail.token, newPassword: password });
    const newAdmin = (await t.login('direccion@sonrisas.org')).token;

    // Sees the copy of the catalogs and nothing clinical from «Centro».
    const names = async (url: string) => ((await as(newAdmin).get(url)).body as { items: { name: string }[] }).items.map((i) => i.name);
    expect(await names('/catalogs/diagnoses')).toEqual(['Trastorno del lenguaje']);
    expect(await names('/catalogs/conditions')).toEqual(['Síndrome de Down']);
    expect(await names('/catalogs/avatars')).toEqual(['Oso', 'sol']); // «sol» is the template patient's one
    expect((await as(newAdmin).get('/patients')).body).toMatchObject({ total: 0 });
    expect((await as(newAdmin).get('/settings')).body).toMatchObject({ centerName: 'Fundación Sonrisas' });
    const copied = await t.prisma.categoryPictogram.findMany({ where: { institutionId }, include: { pictogram: true, category: true } });
    expect(copied).toEqual([
      expect.objectContaining({
        category: expect.objectContaining({ name: 'Necesidades' }),
        pictogram: expect.objectContaining({ arasaacId: 100 }),
      }),
    ]);
    // The avatar has its own image: deleting it in one institution does not leave the other without an image.
    const avatars = await t.prisma.avatar.findMany({ where: { name: 'Oso' }, select: { imagePath: true } });
    expect(new Set(avatars.map((x) => x.imagePath)).size).toBe(2);

    // Already reviewed: it is neither approved nor rejected again.
    expect((await as(superAdmin).post(`/platform/requests/${id}/approve`)).body.error).toBe('RequestAlreadyReviewed');
    expect((await as(superAdmin).post(`/platform/requests/${id}/reject`, { reason: 'Tarde' })).body.error).toBe('RequestAlreadyReviewed');
    expect((await as(superAdmin).get('/platform/institutions')).body).toMatchObject({ total: 2 });
  });

  it('two approvals at once: only one creates the institution', async () => {
    const id = await pending();
    const results = await Promise.all([1, 2].map(() => as(superAdmin).post(`/platform/requests/${id}/approve`)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await t.prisma.institution.count({ where: { ruc: '0190012345001' } })).toBe(1);
  });

  it('rejecting saves the reason; afterwards it cannot be approved', async () => {
    const id = await pending();
    expect((await as(superAdmin).post(`/platform/requests/${id}/reject`, { reason: '<b>no</b>' })).status).toBe(400);
    expect((await as(superAdmin).post(`/platform/requests/${id}/reject`, { reason: 'No es un centro de salud' })).status).toBe(204);
    expect(await t.prisma.institutionRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'No es un centro de salud',
    });
    expect((await as(superAdmin).post(`/platform/requests/${id}/approve`)).body.error).toBe('RequestAlreadyReviewed');
    expect(await t.prisma.institution.count()).toBe(1);
  });
});
