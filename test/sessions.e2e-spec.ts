// Specs 107 (no PDF) and 108: the assigned therapist sees sessions, detail and indicators, and writes observations and goals.
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, png, TestApp } from './app';

let t: TestApp;
let ana: string;
let eva: string;
let otra: string;
let patient: { id: string; code: string };
let sessionId: string;

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  await t.createUser('jefe@centro.org', Role.ADMIN);
  const anaId = (await t.createUser('ana@centro.org')).id;
  const evaId = (await t.createUser('eva@centro.org')).id;
  await t.createUser('otra@centro.org');
  const admin = (await t.login('jefe@centro.org')).token;
  [ana, eva, otra] = [
    (await t.login('ana@centro.org')).token,
    (await t.login('eva@centro.org')).token,
    (await t.login('otra@centro.org')).token,
  ];

  const picto = async (label: string) =>
    (await t.http().post('/pictograms').auth(ana, { type: 'bearer' }).field('label', label).attach('image', png, 'p.png')).body
      .id as string;
  const [water, eat] = [await picto('agua'), await picto('comer')];
  const avatarId = (
    await t.http().post('/catalogs/avatars').auth(admin, { type: 'bearer' }).field('name', 'zorro').attach('image', svg, 'z.svg')
  ).body.id;
  let req = t.http().post('/patients').auth(admin, { type: 'bearer' });
  const fields = { firstNames: 'Mateo', lastNames: 'Pérez', birthDate: '2018-05-20', guardianName: 'Lucía', guardianPhone: '0991234567' };
  for (const [key, value] of Object.entries({ ...fields, consentDate: '2026-10-20', avatarId, therapistIds: `${anaId},${evaId}` }))
    req = req.field(key, value);
  patient = (await req.attach('consentImage', png, 'c.png')).body;

  // The tablet uploads a 30 min session: 3 taps, a 2-word phrase and an activity with 2 prompts (1 correct on the first attempt).
  const tablet = await t.newDevice(admin);
  sessionId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const event = (type: string, payload: object, minutes: number) => ({
    id: crypto.randomUUID(),
    sessionId,
    type,
    payload,
    occurredAt: ago(minutes),
  });
  const result = (target: string, chosen: string, firstAttempt: boolean) => ({
    id: crypto.randomUUID(),
    runId,
    targetPictogramId: target,
    chosenPictogramId: chosen,
    correct: target === chosen,
    firstAttempt,
    responseMs: 1500,
    answeredAt: ago(10),
  });
  const res = await tablet('/sync/batch', {
    sessions: [{ id: sessionId, patientCode: patient.code, profileVersion: 1, startedAt: ago(40), endedAt: ago(10) }],
    events: [
      event('pictogram_tapped', { pictogramId: water, word: 'agua' }, 35),
      event('pictogram_tapped', { pictogramId: water, word: 'agua' }, 34),
      event('pictogram_tapped', { pictogramId: eat, word: 'comer' }, 33),
      event('sentence_spoken', { words: ['agua', 'comer'], length: 2 }, 32),
    ],
    activityRuns: [{ id: runId, sessionId, type: 'identify', level: 1, startedAt: ago(15), endedAt: ago(10) }],
    activityResults: [result(water, water, true), result(eat, water, true), result(eat, eat, false)],
  });
  expect(res.body.rejected).toEqual([]);
});
afterAll(() => t.app.close());

const as = (token: string) => ({
  get: (url: string) => t.http().get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object) => t.http().post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) => t.http().patch(url).auth(token, { type: 'bearer' }).send(body),
});

describe('sesiones (spec 107)', () => {
  it('list with totals computed from the events, detail with timeline and audited queries', async () => {
    const list = await as(ana).get(`/patients/${patient.id}/sessions?page=1&limit=10`);
    expect(list.body).toMatchObject({
      total: 1,
      items: [
        { id: sessionId, durationMin: 30, taps: 3, sentences: 1, activity: { correct: 1, total: 2 }, deviceName: expect.any(String) },
      ],
    });

    const detail = await as(ana).get(`/sessions/${sessionId}`);
    expect(detail.body.events.map((e: { type: string }) => e.type)).toEqual([
      'pictogram_tapped',
      'pictogram_tapped',
      'pictogram_tapped',
      'sentence_spoken',
    ]);
    expect(detail.body.results[0]).toMatchObject({ target: 'agua', chosen: 'agua', correct: true });
    expect(JSON.stringify(detail.body)).not.toContain('Mateo');

    expect((await as(otra).get(`/sessions/${sessionId}`)).status).toBe(403);
    expect(await t.prisma.auditLog.count({ where: { action: 'SESSION_READ', patientCode: patient.code } })).toBe(2);
  });

  it('period indicators: distinct words, top, average phrase and correct answers per week', async () => {
    const report = await as(ana).get(`/patients/${patient.id}/reports`);
    expect(report.body).toMatchObject({
      sessions: 1,
      minutes: 30,
      distinctWords: 2,
      topWords: [
        { word: 'agua', count: 2 },
        { word: 'comer', count: 1 },
      ],
    });
    expect(report.body.weeks.at(-1)).toMatchObject({ meanSentenceLength: 2, accuracy: 50 });
    expect((await as(ana).get(`/patients/${patient.id}/reports?from=2000-01-01&to=2000-02-01`)).body.sessions).toBe(0);
  });
});

describe('observations and goals (spec 108)', () => {
  it('the author edits for 24 h; another assigned therapist cannot; afterwards it is read-only and the previous version goes to the audit log', async () => {
    const note = await as(ana).post(`/patients/${patient.id}/notes`, { text: 'Usó agua sin ayuda', sessionId });
    expect(note.status).toBe(201);
    expect(note.body).toMatchObject({ text: 'Usó agua sin ayuda', sessionId, editable: true });

    expect((await as(ana).patch(`/notes/${note.body.id}`, { text: 'Usó agua y comer sin ayuda' })).body.text).toBe(
      'Usó agua y comer sin ayuda',
    );
    expect((await as(eva).patch(`/notes/${note.body.id}`, { text: 'otra' })).body.error).toBe('NoteLocked');
    expect((await as(otra).get(`/patients/${patient.id}/notes`)).status).toBe(403);

    // After 24 h it becomes read-only.
    await t.prisma.note.update({ where: { id: note.body.id }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60_000) } });
    expect((await as(ana).patch(`/notes/${note.body.id}`, { text: 'tarde' })).status).toBe(403);
    const list = await as(eva).get(`/patients/${patient.id}/notes`);
    expect(list.body.items).toEqual([expect.objectContaining({ authorName: 'ana', editable: false })]);

    const edit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'NOTE_UPDATE' } });
    expect(edit).toMatchObject({ patientCode: patient.code, summary: { previous: 'Usó agua sin ayuda' } });
    // The log keeps it, and the administrators who read the log never get it.
    const admin = (await t.login('jefe@centro.org')).token;
    const readable = await as(admin).get(`/audit/${edit.id.toString()}`);
    expect(readable.status).toBe(200);
    expect(JSON.stringify(readable.body)).not.toContain('Usó agua sin ayuda');
    expect((await as(admin).get('/audit/csv?action=NOTE_UPDATE')).text).not.toContain('Usó agua sin ayuda');
    expect((await as(ana).post(`/patients/${patient.id}/notes`, { text: '' })).status).toBe(400);
  });

  it('objetivo nace "En curso" y cualquier asignada lo marca Logrado o Suspendido', async () => {
    const goal = await as(ana).post(`/patients/${patient.id}/goals`, { text: 'Pedir agua con el tablero', targetDate: '2026-12-15' });
    expect(goal.body).toMatchObject({ status: 'IN_PROGRESS', authorName: 'ana', targetDate: '2026-12-15T00:00:00.000Z' });
    expect((await as(eva).patch(`/goals/${goal.body.id}`, { status: 'ACHIEVED' })).body.status).toBe('ACHIEVED');
    expect((await as(eva).patch(`/goals/${goal.body.id}`, { status: 'DONE' })).status).toBe(400);
    expect((await as(ana).get(`/patients/${patient.id}/goals`)).body.total).toBe(1);
  });
});
