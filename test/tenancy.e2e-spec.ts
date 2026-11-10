// Spec 113: isolation between institutions. Follows OWASP ASVS 5.0 V8.4.1 (cross-tenant controls), WSTG-ATHZ-02/04 and
// API1/API5 of the OWASP API Top 10 2023: two institutions with data in both; each account and tablet of A against each
// resource of B, in all methods, and B's data does not change.
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import WebSocket from 'ws';
import { Role } from '../src/auth/domain/entities/user.entity';
import { JobsWorker } from '../src/jobs/application/jobs.worker';
import { inInstitution } from '../src/tenancy/tenancy';
import { createTestApp, institutionA, password, png, TestApp } from './app';

let t: TestApp;
let a: Awaited<ReturnType<typeof seed>>;
let b: Awaited<ReturnType<typeof seed>>;
let institutionB: string;

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const as = (token: string) => ({
  get: (url: string) => t.http().get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body?: object) => t.http().post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) => t.http().patch(url).auth(token, { type: 'bearer' }).send(body),
  put: (url: string, body: object) => t.http().put(url).auth(token, { type: 'bearer' }).send(body),
  delete: (url: string) => t.http().delete(url).auth(token, { type: 'bearer' }),
});

// A complete institution, created through the API as the Center uses it. `tag` marks each text ('Alfa' or 'Bravo').
async function seed(tag: string, institutionId: string) {
  const mail = (who: string) => `${who}@${tag.toLowerCase()}.org`;
  const adminId = (await t.createUser(mail('jefe'), Role.ADMIN, { institutionId })).id;
  const therapistId = (await t.createUser(mail('terapeuta'), Role.THERAPIST, { institutionId })).id;
  const parentId = (await t.createUser(mail('familia'), Role.PARENT, { institutionId })).id;
  const admin = (await t.login(mail('jefe'))).token;
  const therapist = (await t.login(mail('terapeuta'))).token;
  const parent = (await t.login(mail('familia'))).token;

  const avatarId = (
    await t.http().post('/catalogs/avatars').auth(admin, { type: 'bearer' }).field('name', `Avatar ${tag}`).attach('image', svg, 'a.svg')
  ).body.id as string;
  const diagnosisId = (await as(therapist).post('/catalogs/diagnoses', { name: `Diagnóstico ${tag}` })).body.id as string;
  const pictogramId = (
    await t.http().post('/pictograms').auth(therapist, { type: 'bearer' }).field('label', `palabra ${tag}`).attach('image', png, 'p.png')
  ).body.id as string;
  const categoryId = (await as(therapist).post('/categories', { name: `Categoría ${tag}`, color: '#FFB74D' })).body.id as string;
  await as(therapist).post(`/categories/${categoryId}/pictograms`, { pictogramId });

  const patient = async (firstNames: string) => {
    let req = t.http().post('/patients').auth(admin, { type: 'bearer' });
    const fields = { firstNames, lastNames: tag, birthDate: '2018-05-20', guardianName: `Familia ${tag}`, guardianPhone: '0991234567' };
    for (const [key, value] of Object.entries({ ...fields, consentDate: '2026-10-20', avatarId, therapistIds: therapistId }))
      req = req.field(key, value);
    const res = await req.attach('consentImage', png, 'c.png');
    expect(res.status).toBe(201);
    return res.body as { id: string; code: string };
  };
  const first = await patient(`Niño ${tag}`);
  await as(admin).put(`/users/${parentId}/patients`, { patientIds: [first.id] });

  const tablet = await t.newDevice(admin);
  const sessionId = crypto.randomUUID();
  const synced = await tablet('/sync/batch', {
    sessions: [{ id: sessionId, patientCode: first.code, profileVersion: 1, startedAt: ago(60), endedAt: ago(30) }],
    events: [{ id: crypto.randomUUID(), sessionId, type: 'pictogram_tapped', payload: { pictogramId, word: tag }, occurredAt: ago(50) }],
    activityRuns: [],
    activityResults: [],
  });
  expect(synced.body).toMatchObject({ rejected: [] });

  const noteId = (await as(therapist).post(`/patients/${first.id}/notes`, { text: `Nota ${tag}`, sessionId })).body.id as string;
  const goalId = (await as(therapist).post(`/patients/${first.id}/goals`, { text: `Objetivo ${tag}` })).body.id as string;
  const homeworkId = (
    await as(therapist).post(`/patients/${first.id}/homework`, { instructions: `Deber ${tag}`, pictogramIds: [pictogramId] })
  ).body.id as string;
  const dataRequestId = (await as(therapist).post(`/patients/${first.id}/data-requests`, { type: 'ACCESS' })).body.id as string;
  const jobId = (await as(therapist).post(`/patients/${first.id}/reports/pdf-jobs`)).body.id as string;
  const profileCategoryId = (await t.prisma.profileCategory.findFirstOrThrow({ where: { profile: { patientId: first.id } } })).id;
  const auditId = String((await t.prisma.auditLog.findFirstOrThrow({ where: { institutionId }, orderBy: { id: 'desc' } })).id);

  return {
    ...{ adminId, therapistId, parentId, admin, therapist, parent, tablet, avatarId, diagnosisId, pictogramId, categoryId },
    ...{
      patient: first,
      sessionId,
      noteId,
      goalId,
      homeworkId,
      dataRequestId,
      jobId,
      profileCategoryId,
      auditId,
      deviceId: tablet.deviceId,
    },
  };
}

// Everything of B as it is in the database (as owner, no RLS): it must stay the same after each attack from A.
const tables = [
  'user',
  'patient',
  'device',
  'avatar',
  'diagnosis',
  'category',
  'pictogram',
  'session',
  'event',
  'note',
  'goal',
  'homework',
] as const;
const snapshotB = async () => {
  const rows: Record<string, unknown> = {};
  for (const table of tables) {
    const delegate = t.prisma[table] as unknown as { findMany(args: object): Promise<unknown[]> };
    rows[table] = await delegate.findMany({ where: { institutionId: institutionB }, orderBy: { id: 'asc' } });
  }
  rows.profile = await t.prisma.profilePictogram.findMany({ where: { institutionId: institutionB }, orderBy: { id: 'asc' } });
  rows.dataRequest = await t.prisma.dataRequest.findMany({ where: { institutionId: institutionB }, orderBy: { id: 'asc' } });
  rows.job = await t.prisma.job.findMany({
    where: { institutionId: institutionB },
    select: { id: true, status: true },
    orderBy: { id: 'asc' },
  });
  rows.settings = await t.prisma.centerSettings.findUnique({ where: { institutionId: institutionB } });
  return JSON.stringify(rows);
};
// Nothing of B in a response to A: neither its texts nor its ids.
const leaksB = (body: unknown) => {
  const text = JSON.stringify(body ?? '');
  return (
    /bravo/i.test(text) || [b.patient.id, b.therapistId, b.adminId, b.deviceId, b.sessionId, b.pictogramId].some((id) => text.includes(id))
  );
};

beforeAll(async () => {
  t = await createTestApp();
  await t.reset();
  institutionB = (await t.createInstitution('Institución Bravo')).id;
  a = await seed('Alfa', institutionA);
  b = await seed('Bravo', institutionB);
}, 180_000);
afterAll(() => t.app.close());

describe('own data of each institution (FR-004)', () => {
  it('both have their own P-0001, settings and sync version', async () => {
    expect([a.patient.code, b.patient.code]).toEqual(['P-0001', 'P-0001']);
    expect(await t.prisma.centerSettings.count({ where: { institutionId: { in: [institutionA, institutionB] } } })).toBe(2);
    expect(await t.prisma.globalSyncVersion.count({ where: { institutionId: { in: [institutionA, institutionB] } } })).toBe(2);
  });

  it('each new row stays in the institution of whoever created it', async () => {
    const own = async (id: string) => (await t.prisma.patient.findUniqueOrThrow({ where: { id } })).institutionId;
    expect([await own(a.patient.id), await own(b.patient.id)]).toEqual([institutionA, institutionB]);
    const events = await t.prisma.event.findMany({ where: { sessionId: b.sessionId }, select: { institutionId: true } });
    expect(events).toEqual([{ institutionId: institutionB }]);
  });

  it('the same catalog name can exist in both; repeated in the same one, 409', async () => {
    expect((await as(b.therapist).post('/catalogs/diagnoses', { name: 'Nombre compartido' })).status).toBe(201);
    expect((await as(a.therapist).post('/catalogs/diagnoses', { name: 'Nombre compartido' })).status).toBe(201);
    expect((await as(a.therapist).post('/catalogs/diagnoses', { name: 'Nombre compartido' })).status).toBe(409);
  });
});

describe('every API route, from A against B (ASVS 8.4.1, API1, WSTG-ATHZ-04)', () => {
  const routes = () => {
    const doc = SwaggerModule.createDocument(t.app, new DocumentBuilder().build());
    return Object.entries(doc.paths).flatMap(([path, item]) =>
      (['get', 'post', 'put', 'patch', 'delete'] as const).filter((m) => item[m]).map((method) => ({ method, path })),
    );
  };
  // The B id that corresponds to each route parameter.
  const fill = (path: string) =>
    path.replace(/\{(\w+)\}/g, (_, param: string) => {
      if (param === 'patientId') return b.patient.id;
      if (param === 'kind') return 'diagnoses';
      if (param === 'pictogramId') return b.pictogramId;
      if (param === 'profileCategoryId') return b.profileCategoryId;
      const [, first, second] = path.split('/');
      const ids: Record<string, string> = {
        ...{ patients: b.patient.id, users: b.therapistId, devices: b.deviceId, sessions: b.sessionId, notes: b.noteId, goals: b.goalId },
        ...{ homework: b.homeworkId, jobs: b.jobId, 'data-requests': b.dataRequestId, audit: b.auditId, categories: b.categoryId },
        ...{ pictograms: b.pictogramId, catalogs: b.diagnosisId, therapists: b.therapistId, platform: crypto.randomUUID() },
      };
      return ids[first === 'family' ? second : first];
    });
  // Valid bodies for the routes that change something: so the request reaches the resource lookup.
  const bodies = (): Record<string, object> => ({
    '/patients/{id}': { firstNames: 'Cambiado' },
    '/users/{id}': { name: 'Cambiado' },
    '/users/{id}/temporary-password': { temporaryPassword: 'Temporal2026' },
    '/users/{id}/patients': { patientIds: [] },
    '/notes/{id}': { text: 'Cambiado' },
    '/notes/{id}/sharing': { sharedWithFamily: true },
    '/goals/{id}': { status: 'ACHIEVED' },
    '/homework/{id}': { instructions: 'Cambiado', pictogramIds: [b.pictogramId] },
    '/categories/{id}': { name: 'Cambiado' },
    '/categories/{id}/pictograms': { pictogramId: b.pictogramId },
    '/pictograms/{id}': { label: 'Cambiado' },
    '/catalogs/{kind}/{id}': { name: 'Cambiado' },
    '/data-requests/{id}/reject': { reason: 'Cambiado' },
    '/data-requests/{id}/complete': { notes: 'Cambiado' },
    '/patients/{patientId}/notes': { text: 'Intruso' },
    '/patients/{patientId}/goals': { text: 'Intruso' },
    '/patients/{patientId}/homework': { instructions: 'Intruso', pictogramIds: [b.pictogramId] },
    '/patients/{patientId}/data-requests': { type: 'ACCESS' },
    '/patients/{patientId}/profile': { gridSize: 4 },
  });
  const call = async (token: string, method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, body: object) => {
    for (let attempt = 0; ; attempt++) {
      const req = t.http()[method](url).auth(token, { type: 'bearer' });
      const res = method === 'get' || method === 'delete' ? await req : await req.send(body);
      if (res.status !== 429 || attempt === 3) return res;
      await new Promise((r) => setTimeout(r, 1100)); // the per-user limit is 10 per second
    }
  };

  it('no route with an id responds 2xx or leaks B data, with any A account, and B does not change', async () => {
    const before = await snapshotB();
    const failures: string[] = [];
    const withIds = routes().filter((r) => r.path.replace('{kind}', '').includes('{')); // {kind} only picks the catalog
    expect(withIds.length).toBeGreaterThan(50); // if a new route appears, it enters this test automatically
    for (const { method, path } of withIds) {
      for (const [who, token] of Object.entries({ admin: a.admin, therapist: a.therapist, parent: a.parent })) {
        const res = await call(token, method, fill(path), bodies()[path] ?? {});
        if ((res.status >= 200 && res.status < 300) || leaksB(res.body))
          failures.push(`${who} ${method.toUpperCase()} ${path} → ${res.status}`);
      }
    }
    expect(failures).toEqual([]);
    expect(await snapshotB()).toBe(before);
  }, 300_000);

  it('no listing or search of A brings anything from B', async () => {
    const failures: string[] = [];
    const lists = routes().filter(
      (r) => r.method === 'get' && !r.path.replace('{kind}', '').includes('{') && !r.path.startsWith('/platform'),
    );
    for (const path of lists.flatMap((r) =>
      r.path.includes('{kind}') ? ['avatars', 'diagnoses', 'conditions'].map((k) => r.path.replace('{kind}', k)) : [r.path],
    ))
      for (const [who, token] of Object.entries({ admin: a.admin, therapist: a.therapist, parent: a.parent })) {
        const res = await call(token, 'get', `${path}?limit=100&q=bravo&search=bravo`, {});
        // Binary answers (the audit in Excel and PDF) have no text here; audit-export.e2e-spec.ts opens them and checks their rows.
        if (leaksB(res.body) || res.text?.includes('Bravo')) failures.push(`${who} GET ${path}`);
      }
    expect(failures).toEqual([]);
    // And it does bring A's (the test does not pass by being empty).
    expect((await as(a.admin).get('/patients')).body).toMatchObject({ total: 1, items: [{ id: a.patient.id }] });
    expect((await as(a.therapist).get('/categories')).text).toContain('Categoría Alfa');
  }, 300_000);

  it('references to B inside a request from A are rejected (patient, pictogram, therapist)', async () => {
    const before = await snapshotB();
    expect((await as(a.admin).put(`/users/${a.therapistId}/patients`, { patientIds: [b.patient.id] })).status).toBe(400);
    expect((await as(a.therapist).post(`/categories/${a.categoryId}/pictograms`, { pictogramId: b.pictogramId })).status).toBe(404);
    const homework = await as(a.therapist).post(`/patients/${a.patient.id}/homework`, {
      instructions: 'Repasar',
      pictogramIds: [b.pictogramId],
    });
    expect(homework.status).toBe(400);
    let req = t.http().post('/patients').auth(a.admin, { type: 'bearer' });
    const fields = {
      firstNames: 'X',
      lastNames: 'Y',
      birthDate: '2018-05-20',
      guardianName: 'Z',
      guardianPhone: '0991234567',
      consentDate: '2026-10-20',
    };
    for (const [key, value] of Object.entries({ ...fields, avatarId: b.avatarId, therapistIds: a.therapistId }))
      req = req.field(key, value);
    expect((await req.attach('consentImage', png, 'c.png')).status).toBe(400);
    expect(await snapshotB()).toBe(before);
  });

  it('an institutionId in the body, the query or a header does not change the institution (ASVS 8.3.1, API3)', async () => {
    const created = await t
      .http()
      .post('/catalogs/conditions?institutionId=' + institutionB)
      .auth(a.therapist, { type: 'bearer' })
      .set('X-Institution-Id', institutionB)
      .send({ name: 'Condición inyectada', institutionId: institutionB });
    expect(created.status).toBe(201);
    expect((await t.prisma.condition.findUniqueOrThrow({ where: { id: created.body.id } })).institutionId).toBe(institutionA);
    const listed = await t
      .http()
      .get(`/patients?institutionId=${institutionB}`)
      .auth(a.admin, { type: 'bearer' })
      .set('X-Institution-Id', institutionB);
    expect(leaksB(listed.body)).toBe(false);
  });
});

describe('tabletas (FR-009)', () => {
  it('downloads only the patients, vocabulary and settings of its institution', async () => {
    for (const path of ['/sync/profiles', '/vocabulary', '/devices/settings', '/devices/me', '/therapists'])
      expect(leaksB((await a.tablet(path)).body)).toBe(false);
    expect((await a.tablet('/sync/profiles')).text).toContain('Categoría Alfa'); // the tablet only receives code and board
  });

  it('does not upload sessions of a B patient: a code that only exists in B is rejected', async () => {
    await t.prisma.patient.update({ where: { id: b.patient.id }, data: { code: 'P-0099' } });
    try {
      const s = crypto.randomUUID();
      const res = await a.tablet('/sync/batch', {
        sessions: [{ id: s, patientCode: 'P-0099', profileVersion: 1, startedAt: ago(10) }],
        events: [],
        activityRuns: [],
        activityResults: [],
      });
      expect(res.body.rejected).toEqual([expect.objectContaining({ id: s })]);
      expect(await t.prisma.session.count({ where: { id: s } })).toBe(0);
    } finally {
      await t.prisma.patient.update({ where: { id: b.patient.id }, data: { code: b.patient.code } });
    }
  });

  it("a B therapist's PIN is not verified from an A tablet", async () => {
    expect((await a.tablet(`/therapists/${b.therapistId}/pin-check`, { pin: '4826' })).status).toBe(404);
  });

  it('the registration code of A leaves the tablet in A', async () => {
    expect((await t.prisma.device.findUniqueOrThrow({ where: { id: a.deviceId } })).institutionId).toBe(institutionA);
    expect((await t.prisma.device.findUniqueOrThrow({ where: { id: b.deviceId } })).institutionId).toBe(institutionB);
  });
});

describe('live panel and worker (FR-010)', () => {
  const open = (headers: Record<string, string>, query = '') =>
    new Promise<{ ws: WebSocket; inbox: Record<string, unknown>[] }>((resolve, reject) => {
      const ws = new WebSocket(t.wsUrl + query, { headers });
      const inbox: Record<string, unknown>[] = [];
      ws.on('message', (raw) => {
        const message = JSON.parse((raw as Buffer).toString()) as Record<string, unknown>;
        if (message.type === 'ready') resolve({ ws, inbox });
        else inbox.push(message);
      });
      ws.on('error', reject);
    });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('the admin of A does not receive the presence or status changes of B', async () => {
    const panel = await open({}, `?token=${a.admin}`);
    panel.ws.send(JSON.stringify({ type: 'presence' }));
    await wait(1500);
    const tablet = await open(b.tablet.wsHeaders());
    const s = crypto.randomUUID();
    const batch = {
      sessions: [{ id: s, patientCode: b.patient.code, profileVersion: 1, startedAt: ago(1) }],
      events: [],
      activityRuns: [],
      activityResults: [],
    };
    tablet.ws.send(JSON.stringify({ type: 'batch', id: 'lote-b', ...batch }));
    await wait(3000);
    expect(tablet.inbox).toContainEqual(expect.objectContaining({ type: 'ack', id: 'lote-b' }));
    expect(panel.inbox).toContainEqual(expect.objectContaining({ type: 'presence' }));
    expect(leaksB(panel.inbox)).toBe(false);
    panel.ws.close();
    tablet.ws.close();
  }, 30_000);

  it('a therapist of A cannot watch a patient of B live', async () => {
    const panel = await open({}, `?token=${a.therapist}`);
    panel.ws.send(JSON.stringify({ type: 'watch', patientId: b.patient.id }));
    await wait(1500);
    expect(panel.inbox).toEqual([expect.objectContaining({ type: 'error', error: 'PatientNotAssigned' })]);
    panel.ws.close();
  });

  it("the worker does each job within its institution; A neither sees nor downloads B's", async () => {
    while (await t.app.get(JobsWorker).runOnce());
    expect((await t.prisma.job.findUniqueOrThrow({ where: { id: b.jobId } })).status).toBe('DONE');
    expect((await as(b.therapist).get(`/jobs/${b.jobId}`)).body).toMatchObject({ status: 'DONE', downloadUrl: expect.any(String) });
    expect((await as(a.therapist).get(`/jobs/${b.jobId}`)).status).toBe(404);
    expect(leaksB((await as(a.therapist).get('/jobs')).body)).toBe(false);
  });
});

describe('PostgreSQL RLS, the second lock (FR-003)', () => {
  const asApp = <T>(institutionId: string | null, query: () => Promise<T>) => inInstitution(institutionId, query);

  it('every table with institutionId has RLS and its policy; the API role neither bypasses it nor is the owner', async () => {
    const unprotected = await t.prisma.$queryRaw<{ table: string }[]>`
      SELECT c.table_name AS table FROM information_schema.columns c JOIN pg_class p ON p.relname = c.table_name
      WHERE c.table_schema = 'public' AND c.column_name = 'institutionId' AND c.table_name <> 'InstitutionRequest'
        AND (NOT p.relrowsecurity OR NOT EXISTS (SELECT 1 FROM pg_policies x WHERE x.tablename = c.table_name AND 'necon_app' = ANY(x.roles)))`;
    expect(unprotected).toEqual([]);
    const [role] = await t.prisma.$queryRaw<{ bypass: boolean; owns: number }[]>`
      SELECT rolbypassrls AS bypass, (SELECT count(*)::int FROM pg_tables WHERE tableowner = 'necon_app') AS owns FROM pg_roles WHERE rolname = 'necon_app'`;
    expect(role).toEqual({ bypass: false, owns: 0 });
  });

  it("a query without a filter (like a forgotten direct SQL) sees only the connection's institution", async () => {
    const count = (id: string | null) => asApp(id, () => t.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Patient"`);
    expect(await count(institutionA)).toEqual([{ n: 1 }]);
    expect(await count(institutionB)).toEqual([{ n: 1 }]);
    expect(await count(null)).toEqual([{ n: 0 }]); // without an institution it sees nothing
    const events = await asApp(institutionA, () => t.prisma.event.findMany({ select: { institutionId: true } }));
    expect(events.every((e) => e.institutionId === institutionA)).toBe(true);
  });

  it("does not allow writing rows of another institution or changing B's", async () => {
    await expect(
      asApp(institutionA, () => t.prisma.diagnosis.create({ data: { name: 'Intruso', institutionId: institutionB } })),
    ).rejects.toThrow(/row-level security|violates/i);
    const changed = await asApp(institutionA, () =>
      t.prisma.patient.updateMany({ where: { id: b.patient.id }, data: { firstNames: 'X' } }),
    );
    expect(changed.count).toBe(0);
    const removed = await asApp(institutionA, () => t.prisma.note.deleteMany({ where: { id: b.noteId } }));
    expect(removed.count).toBe(0);
  });

  it('a SQL injection in a search does not cross institutions', async () => {
    const res = await as(a.therapist).get(`/pictograms?q=${encodeURIComponent("x' OR '1'='1")}`);
    expect(res.status).toBe(200);
    expect(leaksB(res.body)).toBe(false);
  });
});

describe('login with accounts in two institutions (FR-008)', () => {
  it('the same password in A and B asks to choose; with institutionId it enters that one and sees only that one', async () => {
    await t.createUser('doble@correo.org', Role.ADMIN, { institutionId: institutionA });
    await t.createUser('doble@correo.org', Role.ADMIN, { institutionId: institutionB });
    const choose = await t.login('doble@correo.org');
    expect(choose.res.status).toBe(409);
    expect(choose.res.body).toMatchObject({ error: 'ChooseInstitution' });
    expect(choose.res.body.institutions).toEqual(
      expect.arrayContaining([
        { id: institutionA, name: 'Centro' },
        { id: institutionB, name: 'Institución Bravo' },
      ]),
    );

    const inB = await t
      .http()
      .post('/auth/login')
      .set('X-Forwarded-For', t.newIp())
      .send({ email: 'doble@correo.org', password, institutionId: institutionB });
    expect(inB.body.user).toMatchObject({ institutionId: institutionB });
    const patients = await as(inB.body.accessToken as string).get('/patients');
    expect(patients.body.items.map((p: { id: string }) => p.id)).toEqual([b.patient.id]);
  });

  it('a deactivated institution cannot get in: neither its accounts nor its tablets', async () => {
    await t.prisma.institution.update({ where: { id: institutionB }, data: { active: false } });
    await t.cache.clear(); // deactivated in the database: without this it would get in until the cache expires (60 s, spec 114)
    try {
      expect((await t.login('jefe@bravo.org')).res.status).toBe(401);
      expect((await as(b.admin).get('/patients')).status).toBe(401);
      expect((await b.tablet('/sync/profiles')).status).toBe(403); // 401 would make the tablet wipe its token
    } finally {
      await t.prisma.institution.update({ where: { id: institutionB }, data: { active: true } });
      await t.cache.clear(); // nor the stored rejection
    }
  });
});
