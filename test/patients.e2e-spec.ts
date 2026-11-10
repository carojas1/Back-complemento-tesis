// Spec 104: the admin registers with the consent photo; the assigned therapist views and edits; reversible discharge.
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, png, TestApp } from './app';

let t: TestApp;
let admin: string;
let ana: string;
let anaId: string;
let otra: string;
let avatarId: string;

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
const consent = Buffer.concat([png, Buffer.from('firma del representante')]);
const basics = {
  firstNames: 'Mateo',
  lastNames: 'Pérez',
  birthDate: '2018-05-20',
  guardianName: 'Lucía Pérez',
  guardianPhone: '0991234567',
  consentDate: '2026-10-20',
};

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  await t.createUser('jefe@centro.org', Role.ADMIN);
  anaId = (await t.createUser('ana@centro.org')).id;
  await t.createUser('otra@centro.org');
  admin = (await t.login('jefe@centro.org')).token;
  ana = (await t.login('ana@centro.org')).token;
  otra = (await t.login('otra@centro.org')).token;
  avatarId = (
    await t.http().post('/catalogs/avatars').auth(admin, { type: 'bearer' }).field('name', 'zorro').attach('image', svg, 'zorro.svg')
  ).body.id;
});
afterAll(async () => {
  await t.prisma.diagnosis.deleteMany({ where: { name: { startsWith: 'e2e-' } } });
  await t.app.close();
});

const as = (token: string) => ({
  get: (url: string) => t.http().get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body?: object) => t.http().post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) => t.http().patch(url).auth(token, { type: 'bearer' }).send(body),
});
const create = (fields: Record<string, string> = {}, image: Buffer | null = consent) => {
  let req = t.http().post('/patients').auth(admin, { type: 'bearer' });
  for (const [key, value] of Object.entries({ ...basics, avatarId, therapistIds: anaId, ...fields })) req = req.field(key, value);
  return image ? req.attach('consentImage', image, 'consentimiento.png') : req;
};
const actions = async () => (await t.prisma.auditLog.findMany({ orderBy: { id: 'asc' } })).map((a) => `${a.action}:${a.patientCode ?? ''}`);

describe('registro (admin)', () => {
  it('creates with a sequential code, assigns the therapist, creates the profile and encrypts the consent', async () => {
    const first = await create();
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      code: expect.stringMatching(/^P-\d{4}$/),
      status: 'ACTIVE',
      therapists: [{ id: anaId, name: 'ana' }],
    });
    expect(first.body).not.toHaveProperty('diagnosisId');
    const second = await create({ firstNames: 'Sofía' });
    expect(Number(second.body.code.slice(2))).toBe(Number(first.body.code.slice(2)) + 1);

    const row = await t.prisma.patient.findUniqueOrThrow({ where: { id: first.body.id }, include: { profile: true } });
    expect(row.profile).not.toBeNull();
    if (t.memoryStorage) expect(t.memoryStorage.files.get(row.consentFilePath)?.includes(Buffer.from('firma'))).toBe(false); // encrypted in the bucket

    const download = await as(admin).get(`/patients/${first.body.id}/consent`).buffer(true);
    expect(download.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(download.body as Buffer, consent)).toBe(0);
    expect(await actions()).toEqual(expect.arrayContaining([`PATIENT_CREATE:${first.body.code}`, `CONSENT_READ:${first.body.code}`]));
  });

  it('without consent, without a valid therapist or with a nonexistent avatar nothing is created; the therapist does not register', async () => {
    expect((await create({}, null)).body).toMatchObject({ statusCode: 400, error: 'ConsentRequired' });
    expect((await create({}, Buffer.from('no es imagen'))).body).toMatchObject({ error: 'ConsentRequired' });
    expect((await create({ therapistIds: crypto.randomUUID() })).body).toMatchObject({ error: 'UnknownTherapists' });
    expect((await create({ avatarId: crypto.randomUUID() })).body).toMatchObject({ error: 'UnknownCatalogValue' });
    expect((await t.http().post('/patients').auth(ana, { type: 'bearer' }).send(basics)).status).toBe(403);
  });
});

describe('ficha (terapeuta asignada)', () => {
  it('the list shows only the assigned ones; the record is audited and another therapist gets 403', async () => {
    const { body: patient } = await create();
    await create({ therapistIds: (await t.prisma.user.findFirstOrThrow({ where: { email: 'otra@centro.org' } })).id });

    expect((await as(admin).get('/patients')).body.total).toBe(2);
    const mine = await as(ana).get('/patients?search=mateo');
    expect(mine.body).toMatchObject({ total: 1, items: [{ id: patient.id }] });

    const detail = await as(ana).get(`/patients/${patient.id}`);
    expect(detail.body).toMatchObject({ birthDate: '2018-05-20', guardianName: 'Lucía Pérez', diagnosisId: null, conditionIds: [] });
    expect(await actions()).toContain(`PATIENT_READ:${patient.code}`);
    expect((await as(otra).get(`/patients/${patient.id}`)).body).toMatchObject({ statusCode: 403, error: 'PatientNotAssigned' });
    expect((await as(admin).get(`/patients/${patient.id}`)).status).toBe(403); // the admin does not see clinical data
  });

  it('the admin reads what was registered and the tablets used, never anything clinical; the read is audited', async () => {
    const { body: patient } = await create();
    const { deviceId } = await t.newDevice(admin);
    const { institutionId } = await t.prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
    const startedAt = new Date('2026-10-20T15:00:00Z');
    await t.prisma.session.create({
      data: {
        institutionId,
        id: crypto.randomUUID(),
        patientId: patient.id,
        deviceId,
        profileVersion: 1,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 30 * 60_000),
      },
    });

    const read = await as(admin).get(`/patients/${patient.id}/administrative`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      birthDate: basics.birthDate,
      guardianName: basics.guardianName,
      guardianPhone: basics.guardianPhone,
      consentDate: basics.consentDate,
      dischargedAt: null,
      devices: [{ deviceId, name: 'Tableta', sessions: 1, minutes: 30 }],
    });
    for (const clinical of ['diagnosisId', 'conditionIds', 'consentFilePath', 'firstNames']) expect(read.body).not.toHaveProperty(clinical);
    expect(await t.prisma.auditLog.count({ where: { action: 'PATIENT_READ', entityId: patient.id, actorId: { not: null } } })).toBe(1);

    expect((await as(ana).get(`/patients/${patient.id}/administrative`)).status).toBe(403);
    expect((await t.http().get(`/patients/${patient.id}/administrative`)).status).toBe(401);
    expect((await as(admin).get(`/patients/${crypto.randomUUID()}/administrative`)).status).toBe(404);
  });

  it('edits with values from the active catalogs; discharge and reactivation', async () => {
    const { body: patient } = await create();
    const diagnosis = await as(ana).post('/catalogs/diagnoses', { name: `e2e-lenguaje-${crypto.randomUUID().slice(0, 6)}` });
    const edited = await as(ana).patch(`/patients/${patient.id}`, { diagnosisId: diagnosis.body.id, lastNames: 'Pérez Ruiz' });
    expect(edited.body).toMatchObject({ diagnosisId: diagnosis.body.id, lastNames: 'Pérez Ruiz' });

    await as(ana).patch(`/catalogs/diagnoses/${diagnosis.body.id}`, { active: false });
    expect((await as(ana).patch(`/patients/${patient.id}`, { diagnosisId: diagnosis.body.id, firstNames: 'Otro' })).body).toMatchObject({
      diagnosisId: diagnosis.body.id,
    });

    expect((await as(ana).post(`/patients/${patient.id}/discharge`)).body).toMatchObject({
      status: 'DISCHARGED',
      dischargedAt: expect.any(String),
    });
    expect((await as(ana).get('/patients?status=ACTIVE')).body.total).toBe(0);
    expect((await as(ana).post(`/patients/${patient.id}/reactivate`)).body).toMatchObject({ status: 'ACTIVE', dischargedAt: null });
  });
});

describe('communication profile (spec 105)', () => {
  it('is born from the catalog and the therapist changes settings and hides pictograms; each change bumps the version', async () => {
    const category = (await as(ana).post('/categories', { name: 'Necesidades', color: '#FFB74D' })).body.id as string;
    const water = (await as(ana).post('/pictograms/arasaac', { arasaacId: 100 })).body.id as string;
    await as(ana).post(`/categories/${category}/pictograms`, { pictogramId: water });

    const { body: patient } = await create();
    const profile = await as(ana).get(`/patients/${patient.id}/profile`);
    expect(profile.body).toMatchObject({
      patientCode: patient.code,
      gridSize: 6,
      profileVersion: 1,
      categories: [{ name: 'Necesidades', pictograms: [{ label: 'agua', hidden: false, imageUrl: expect.any(String) }] }],
    });
    expect(JSON.stringify(profile.body)).not.toContain('Mateo');

    const updated = await as(ana).patch(`/patients/${patient.id}/profile`, { gridSize: 9, speechRate: 1.2 });
    expect(updated.body).toMatchObject({ gridSize: 9, speechRate: 1.2, profileVersion: 2 });
    expect((await as(ana).patch(`/patients/${patient.id}/profile`, { gridSize: 7 })).status).toBe(400);

    const boardId = updated.body.categories[0].pictograms[0].id as string;
    const hidden = await as(ana).patch(`/patients/${patient.id}/profile/pictograms/${boardId}`, { hidden: true });
    expect(hidden.body).toMatchObject({ profileVersion: 3, categories: [{ pictograms: [{ hidden: true }] }] });
    expect((await as(otra).get(`/patients/${patient.id}/profile`)).status).toBe(403);
  });
});
