// Usage per patient and of the app: the admin reads every patient of the center in counts only, a specialist only their assigned ones.
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, institutionA, TestApp } from './app';

let t: TestApp;
let admin: string;
let ana: string;
let followedId: string;
let aloneId: string;

const get = (path: string, token = admin) => t.http().get(path).auth(token, { type: 'bearer' });
const hours = (count: number) => new Date(Date.now() - count * 60 * 60_000);

beforeAll(async () => {
  t = await createTestApp();
  await t.reset();
  const owner = await t.createUser('jefe@centro.org', Role.ADMIN);
  const therapist = await t.createUser('ana@centro.org');
  admin = (await t.login('jefe@centro.org')).token;
  ana = (await t.login('ana@centro.org')).token;

  const followed = await t.createPatient('P-0001', owner.id);
  const alone = await t.createPatient('P-0002', owner.id);
  followedId = followed.id;
  aloneId = alone.id;
  await t.prisma.therapistPatient.create({ data: { institutionId: institutionA, therapistId: therapist.id, patientId: followed.id } });

  const base = { institutionId: institutionA, patientId: followed.id, profileVersion: 1 };
  const session = await t.prisma.session.create({ data: { ...base, id: crypto.randomUUID(), startedAt: hours(5), endedAt: hours(4.5) } });
  await t.prisma.session.create({ data: { ...base, id: crypto.randomUUID(), kind: 'HOME', startedAt: hours(3), endedAt: hours(2.75) } });
  await t.prisma.event.create({
    data: {
      id: crypto.randomUUID(),
      institutionId: institutionA,
      sessionId: session.id,
      type: 'pictogram_tapped',
      payload: { word: 'agua' },
      occurredAt: hours(5),
    },
  });
  const run = await t.prisma.activityRun.create({
    data: { id: crypto.randomUUID(), institutionId: institutionA, sessionId: session.id, type: 'match', level: 1, startedAt: hours(5) },
  });
  await t.prisma.activityResult.create({
    data: {
      id: crypto.randomUUID(),
      institutionId: institutionA,
      runId: run.id,
      targetPictogramId: 'a',
      chosenPictogramId: 'a',
      correct: true,
      firstAttempt: true,
      responseMs: 900,
      answeredAt: hours(5),
    },
  });
  await t.prisma.appointment.create({
    data: {
      institutionId: institutionA,
      patientId: alone.id,
      therapistId: therapist.id,
      startsAt: hours(30),
      endsAt: hours(29),
      status: 'NO_SHOW',
      createdBy: owner.id,
    },
  });
});
afterAll(() => t.app.close());

describe('usage per patient', () => {
  it('the admin sees everyone, in counts and without clinical data', async () => {
    const res = await get('/dashboard/patients');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.counts).toEqual({ all: 2, noPractice: 1, noShows: 1 });
    const row = res.body.items.find((item: { patientId: string }) => item.patientId === followedId);
    expect(row.code).toBe('P-0001');
    expect(row.avatarUrl).toBeTruthy();
    expect(row.sessions).toEqual({ therapy: 1, home: 1 });
    expect(row.minutes).toEqual({ therapy: 30, home: 15 });
    expect(row.practiceByWeek.length).toBeGreaterThan(0);
    for (const hidden of ['correctRate', 'avatarPath', 'diagnosisId', 'guardianPhone', 'birthDate']) expect(row).not.toHaveProperty(hidden);
  });

  it('the specialist sees only their assigned ones, and with correct answers', async () => {
    const res = await get('/dashboard/patients', ana);
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { patientId: string }) => item.patientId)).toEqual([followedId]);
    expect(res.body.items[0].correctRate).toBe(100);
  });

  it('the specialist cannot request those of another person', async () => {
    const other = await t.createUser('luis@centro.org');
    const res = await get(`/dashboard/patients?therapistId=${other.id}`, ana);
    expect(res.body.items.map((item: { patientId: string }) => item.patientId)).toEqual([followedId]);
  });

  it('filters, sorts and searches', async () => {
    const noShows = await get('/dashboard/patients?flag=NO_SHOWS');
    expect(noShows.body.items.map((item: { patientId: string }) => item.patientId)).toEqual([aloneId]);
    expect(noShows.body.total).toBe(1);
    const sorted = await get('/dashboard/patients?sort=MINUTES');
    expect(sorted.body.items[0].patientId).toBe(followedId);
    const found = await get('/dashboard/patients?search=P-0002');
    expect(found.body.total).toBe(1);
    const wildcard = await get('/dashboard/patients?search=%25');
    expect(wildcard.body.total).toBe(0);
  });

  it('rejects a made-up sort order and more than 100 per page', async () => {
    expect((await get('/dashboard/patients?sort=password')).status).toBe(400);
    expect((await get('/dashboard/patients?limit=101')).status).toBe(400);
  });

  it('a guardian does not get in', async () => {
    await t.createUser('papa@centro.org', Role.PARENT);
    const token = (await t.login('papa@centro.org')).token;
    expect((await get('/dashboard/patients', token)).status).toBe(403);
    expect((await get('/dashboard/usage', token)).status).toBe(403);
  });
});

describe('app usage', () => {
  it('the admin sees sessions, time, schedules and tablets', async () => {
    const res = await get('/dashboard/usage');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toBe(2);
    expect(res.body.minutes).toBe(45);
    expect(res.body.therapy).toEqual({ sessions: 1, minutes: 30 });
    expect(res.body.home).toEqual({ sessions: 1, minutes: 15 });
    expect(res.body.activePatients).toBe(2);
    expect(res.body.practicingPatients).toBe(1);
    expect(res.body.communication).toEqual({ pictogramsTapped: 1, phrasesSpoken: 0 });
    expect(res.body.activityRuns).toBe(1);
    expect(res.body.previous).toEqual({ sessions: 0, minutes: 0, practicingPatients: 0 });
    expect(res.body.byHour.reduce((sum: number, cell: { sessions: number }) => sum + cell.sessions, 0)).toBe(2);
    expect(res.body.byDay.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.devices)).toBe(true);
  });

  it('the specialist counts only their patients and does not see the tablets', async () => {
    const res = await get('/dashboard/usage', ana);
    expect(res.status).toBe(200);
    expect(res.body.activePatients).toBe(1);
    expect(res.body).not.toHaveProperty('devices');
  });
});
