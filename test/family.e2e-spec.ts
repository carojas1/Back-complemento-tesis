// Spec 112: guardians (read-only access to their children and practice at home), homework and shared observations.
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, password, png, TestApp } from './app';

let t: TestApp;
let admin: string;
let ana: string;
let parent: string;
let parentId: string;
let child: { id: string; code: string };
let other: { id: string; code: string };
let pictos: { water: string; eat: string; home: string };
let therapySession: string;

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const as = (token: string) => ({
  get: (url: string) => t.http().get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object = {}) => t.http().post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) => t.http().patch(url).auth(token, { type: 'bearer' }).send(body),
  put: (url: string, body: object) => t.http().put(url).auth(token, { type: 'bearer' }).send(body),
  delete: (url: string) => t.http().delete(url).auth(token, { type: 'bearer' }),
});

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  await t.createUser('jefe@centro.org', Role.ADMIN);
  const anaId = (await t.createUser('ana@centro.org')).id;
  admin = (await t.login('jefe@centro.org')).token;
  ana = (await t.login('ana@centro.org')).token;

  // Catalog with two categories: each new patient's profile is copied from it (spec 105).
  const picto = async (label: string) =>
    (await t.http().post('/pictograms').auth(ana, { type: 'bearer' }).field('label', label).attach('image', png, 'p.png')).body
      .id as string;
  pictos = { water: await picto('agua'), eat: await picto('comer'), home: await picto('casa') };
  const needs = (await as(ana).post('/categories', { name: 'Necesidades', color: '#FFB74D' })).body.id as string;
  for (const pictogramId of [pictos.water, pictos.eat]) await as(ana).post(`/categories/${needs}/pictograms`, { pictogramId });

  const avatarId = (
    await t.http().post('/catalogs/avatars').auth(admin, { type: 'bearer' }).field('name', 'zorro').attach('image', svg, 'z.svg')
  ).body.id;
  const newPatient = async (firstNames: string) => {
    let req = t.http().post('/patients').auth(admin, { type: 'bearer' });
    const fields = { firstNames, lastNames: 'Pérez', birthDate: '2018-05-20', guardianName: 'Lucía', guardianPhone: '0991234567' };
    for (const [key, value] of Object.entries({ ...fields, consentDate: '2026-10-20', avatarId, therapistIds: anaId }))
      req = req.field(key, value);
    return (await req.attach('consentImage', png, 'c.png')).body as { id: string; code: string };
  };
  child = await newPatient('Mateo');
  other = await newPatient('Sofía');

  // The administrator creates the guardian's account with a temporary password and links their child (FR-001, FR-002).
  const created = await as(admin).post('/users', {
    name: 'Lucía',
    email: 'lucia@casa.org',
    temporaryPassword: 'Temporal2026',
    role: 'PARENT',
  });
  expect(created.body).toMatchObject({ role: 'PARENT', mustChangePassword: true });
  parentId = created.body.id;
  expect((await as(admin).put(`/users/${parentId}/patients`, { patientIds: [child.id] })).status).toBe(200);
  const first = await t.login('lucia@casa.org', 'Temporal2026');
  await as(first.token).post('/auth/change-password', { currentPassword: 'Temporal2026', newPassword: password });
  parent = (await t.login('lucia@casa.org')).token;

  // A therapy session on the Center tablet.
  const tablet = await t.newDevice(admin);
  therapySession = crypto.randomUUID();
  await tablet('/sync/batch', {
    sessions: [{ id: therapySession, patientCode: child.code, profileVersion: 1, startedAt: ago(60), endedAt: ago(30) }],
    events: [],
    activityRuns: [],
    activityResults: [],
  });
});
afterAll(() => t.app.close());

describe('representante (spec 112)', () => {
  it('sees only their children, never other patients or the staff routes', async () => {
    const children = await as(parent).get('/family/patients?page=1&limit=10');
    expect(children.body).toMatchObject({
      total: 1,
      items: [{ id: child.id, code: child.code, firstNames: 'Mateo', avatarUrl: expect.any(String) }],
    });
    expect((await as(admin).get(`/users/${parentId}/patients?page=1&limit=10`)).body.items).toEqual([
      expect.objectContaining({ id: child.id }),
    ]);

    // The admin panel filters a guardian's children the same way as a therapist's patients.
    const linked = await as(admin).get(`/patients?page=1&limit=10&assignedTo=${parentId}`);
    expect(linked.body.items.map((p: { id: string }) => p.id)).toEqual([child.id]);
    const notLinked = await as(admin).get(`/patients?page=1&limit=10&notAssignedTo=${parentId}`);
    expect(notLinked.body.items.map((p: { id: string }) => p.id)).toEqual([other.id]);

    const info = await as(parent).get(`/family/patients/${child.id}`);
    expect(info.body).toMatchObject({ code: child.code, lastNames: 'Pérez', therapists: ['ana'], status: 'ACTIVE' });
    expect((await as(parent).get(`/family/patients/${other.id}`)).body.error).toBe('PatientNotLinked');
    expect((await as(parent).get(`/family/patients/${other.id}/profile`)).status).toBe(403);

    for (const url of ['/patients?page=1&limit=10', `/patients/${child.id}`, `/patients/${child.id}/sessions`, '/users?page=1&limit=10'])
      expect((await as(parent).get(url)).status).toBe(403);
    expect((await as(parent).patch(`/patients/${child.id}/profile`, { gridSize: 4 })).status).toBe(403);
    // An admin has no assigned patients.
    const adminId = (await t.prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } })).id;
    expect((await as(admin).put(`/users/${adminId}/patients`, { patientIds: [] })).body.error).toBe('NotAssignable');
  });

  it("sees their child's board and only the shared observations", async () => {
    const profile = await as(parent).get(`/family/patients/${child.id}/profile`);
    expect(profile.body.categories[0].pictograms.map((p: { label: string }) => p.label)).toEqual(['agua', 'comer']);

    const privateNote = (await as(ana).post(`/patients/${child.id}/notes`, { text: 'Solo para el equipo' })).body;
    expect(privateNote.sharedWithFamily).toBe(false);
    await as(ana).post(`/patients/${child.id}/notes`, { text: 'Hoy pidió agua solo', sharedWithFamily: true });
    let notes = await as(parent).get(`/family/patients/${child.id}/notes?page=1&limit=10`);
    expect(notes.body.items.map((n: { text: string }) => n.text)).toEqual(['Hoy pidió agua solo']);

    // Sharing has no 24 h rule and is recorded in the audit log (FR-004).
    expect((await as(ana).patch(`/notes/${privateNote.id}/sharing`, { sharedWithFamily: true })).body.sharedWithFamily).toBe(true);
    notes = await as(parent).get(`/family/patients/${child.id}/notes?page=1&limit=10`);
    expect(notes.body.total).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { action: 'NOTE_SHARE' } })).toBe(1);
  });
});

describe('homework and practice at home (spec 112)', () => {
  it('the therapist assigns homework, the guardian practices it at home and marks it done', async () => {
    // Only pictograms from the patient's board (casa is not there) and from 1 to 12.
    const bad = await as(ana).post(`/patients/${child.id}/homework`, { instructions: 'Repasar', pictogramIds: [pictos.home] });
    expect(bad.body.error).toBe('InvalidHomeworkPictograms');
    expect((await as(ana).post(`/patients/${child.id}/homework`, { instructions: 'Repasar', pictogramIds: [] })).status).toBe(400);

    const homework = await as(ana).post(`/patients/${child.id}/homework`, {
      instructions: 'Repasen agua y comer antes de cenar',
      pictogramIds: [pictos.eat, pictos.water],
      dueDate: '2026-11-02',
      withActivity: true,
    });
    expect(homework.status).toBe(201);
    expect(homework.body).toMatchObject({ withActivity: true, author: { name: 'ana' }, completedAt: null, practice: { sessions: 0 } });
    expect(homework.body.pictograms.map((p: { label: string }) => p.label)).toEqual(['comer', 'agua']);
    const id = homework.body.id as string;

    const pending = await as(parent).get(`/family/patients/${child.id}/homework?status=pending&page=1&limit=10`);
    expect(pending.body.items).toEqual([
      expect.objectContaining({ id, pictograms: [expect.objectContaining({ imageUrl: expect.any(String) }), expect.anything()] }),
    ]);

    // Practice at home with the homework activity: 2 prompts, 1 correct on the first attempt (FR-006).
    const sessionId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const result = (target: string, chosen: string) => ({
      id: crypto.randomUUID(),
      runId,
      targetPictogramId: target,
      chosenPictogramId: chosen,
      correct: target === chosen,
      firstAttempt: true,
      responseMs: 1200,
      answeredAt: ago(5),
    });
    const practice = await as(parent).post('/family/practice', {
      sessions: [{ id: sessionId, patientCode: child.code, profileVersion: 1, startedAt: ago(10), endedAt: ago(2), homeworkId: id }],
      events: [
        {
          id: crypto.randomUUID(),
          sessionId,
          type: 'pictogram_tapped',
          payload: { pictogramId: pictos.water, word: 'agua' },
          occurredAt: ago(8),
        },
      ],
      activityRuns: [{ id: runId, sessionId, type: 'identify', level: 1, startedAt: ago(6), endedAt: ago(3) }],
      activityResults: [result(pictos.water, pictos.water), result(pictos.eat, pictos.water)],
    });
    expect(practice.body.rejected).toEqual([]);
    expect(practice.body.accepted.sessions).toEqual([sessionId]);

    // The therapist sees it apart from therapy, with who did it; and in the homework, what was practiced.
    const sessions = await as(ana).get(`/patients/${child.id}/sessions?page=1&limit=10`);
    expect(sessions.body.items).toEqual([
      expect.objectContaining({
        id: sessionId,
        kind: 'HOME',
        guardianName: 'Lucía',
        homeworkId: id,
        therapistName: null,
        deviceName: null,
      }),
      expect.objectContaining({ id: therapySession, kind: 'THERAPY', guardianName: null }),
    ]);
    const report = await as(ana).get(`/patients/${child.id}/reports?from=2026-01-01&to=2999-01-01`);
    expect(report.body.sessions).toBe(1); // the indicators are therapy-only
    expect((await as(parent).get(`/family/patients/${child.id}/sessions?page=1&limit=10`)).body.total).toBe(2);

    // Marking done is idempotent; afterwards the therapist can no longer change or delete it.
    const done = await as(parent).post(`/family/homework/${id}/complete`);
    expect(done.body).toMatchObject({
      completedAt: expect.any(String),
      completedBy: { name: 'Lucía' },
      practice: { sessions: 1, correct: 1, total: 2 },
    });
    expect((await as(parent).post(`/family/homework/${id}/complete`)).body.completedAt).toBe(done.body.completedAt);
    expect((await as(ana).patch(`/homework/${id}`, { instructions: 'Otra' })).body.error).toBe('HomeworkDone');
    expect((await as(ana).delete(`/homework/${id}`)).body.error).toBe('HomeworkDone');
    expect((await as(ana).get(`/patients/${child.id}/homework?status=done&page=1&limit=10`)).body.total).toBe(1);
  });

  it('the guardian does not upload practice of another patient nor add to a therapy session', async () => {
    const foreign = crypto.randomUUID();
    const res = await as(parent).post('/family/practice', {
      sessions: [{ id: foreign, patientCode: other.code, profileVersion: 1, startedAt: ago(10) }],
      events: [
        {
          id: crypto.randomUUID(),
          sessionId: therapySession,
          type: 'pictogram_tapped',
          payload: { pictogramId: pictos.water, word: 'agua' },
          occurredAt: ago(8),
        },
      ],
      activityRuns: [],
      activityResults: [],
    });
    expect(res.body.accepted.sessions).toEqual([]);
    expect(res.body.rejected).toEqual([
      { id: foreign, reason: 'UnknownPatientCode' },
      { id: expect.any(String), reason: 'UnknownSession' },
    ]);
    // A homework of another patient is ignored.
    const homework = (await as(ana).post(`/patients/${other.id}/homework`, { instructions: 'Repasar', pictogramIds: [pictos.water] })).body
      .id;
    const own = crypto.randomUUID();
    await as(parent).post('/family/practice', {
      sessions: [{ id: own, patientCode: child.code, profileVersion: 1, startedAt: ago(10), homeworkId: homework }],
      events: [],
      activityRuns: [],
      activityResults: [],
    });
    expect((await t.prisma.session.findUniqueOrThrow({ where: { id: own } })).homeworkId).toBeNull();
    expect((await as(parent).post(`/family/homework/${homework}/complete`)).body.error).toBe('PatientNotLinked');
  });
});
