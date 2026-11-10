// Spec 106: profiles for the tablet, idempotent batches and live WebSocket with ack after PostgreSQL.
import WebSocket from 'ws';
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, password, png, TestApp } from './app';

let t: TestApp;
let admin: string;
let ana: string;
let anaId: string;
let tablet: Awaited<ReturnType<TestApp['newDevice']>>;
let patient: { id: string; code: string };

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const session = (overrides: object = {}) => ({
  id: crypto.randomUUID(),
  patientCode: patient.code,
  profileVersion: 1,
  startedAt: minutesAgo(5),
  ...overrides,
});
const tap = (sessionId: string) => ({
  id: crypto.randomUUID(),
  sessionId,
  type: 'pictogram_tapped',
  payload: { pictogramId: crypto.randomUUID(), word: 'agua' },
  occurredAt: minutesAgo(4),
});
const batch = (parts: object) => ({ sessions: [], events: [], activityRuns: [], activityResults: [], ...parts });

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  await t.createUser('jefe@centro.org', Role.ADMIN);
  anaId = (await t.createUser('ana@centro.org')).id;
  admin = (await t.login('jefe@centro.org')).token;
  ana = (await t.login('ana@centro.org')).token;
  tablet = await t.newDevice(admin);
  avatarId = (await t.http().post('/catalogs/avatars').auth(admin, { type: 'bearer' }).field('name', 'zorro').attach('image', svg, 'z.svg'))
    .body.id;
  patient = await registerPatient();
});
afterAll(() => t.app.close());

let avatarId: string;
async function registerPatient() {
  let req = t.http().post('/patients').auth(admin, { type: 'bearer' });
  const fields = {
    firstNames: 'Mateo',
    lastNames: 'Pérez',
    birthDate: '2018-05-20',
    guardianName: 'Lucía',
    guardianPhone: '0991234567',
    consentDate: '2026-10-20',
    avatarId,
    therapistIds: anaId,
  };
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  return (await req.attach('consentImage', png, 'c.png')).body as { id: string; code: string };
}

describe('GET /sync/profiles', () => {
  it('delivers only code, avatar and board from the requested version; discharged ones appear separately', async () => {
    const all = await tablet('/sync/profiles?since=0');
    expect(all.body).toMatchObject({
      total: 1,
      items: [{ patientCode: patient.code, avatarUrl: expect.any(String), gridSize: 6 }],
      dischargedPatientCodes: [],
    });
    expect(JSON.stringify(all.body)).not.toMatch(/Mateo|Pérez|Lucía|2018/);

    const version = all.body.version as number;
    expect((await tablet(`/sync/profiles?since=${version}`)).body.total).toBe(0);
    await t.http().patch(`/patients/${patient.id}/profile`).auth(ana, { type: 'bearer' }).send({ gridSize: 4 });
    expect((await tablet(`/sync/profiles?since=${version}`)).body.items).toEqual([
      expect.objectContaining({ gridSize: 4, profileVersion: 2 }),
    ]);

    await t.http().post(`/patients/${patient.id}/discharge`).auth(ana, { type: 'bearer' });
    expect((await tablet(`/sync/profiles?since=${version}`)).body).toMatchObject({ total: 0, dischargedPatientCodes: [patient.code] });
    expect((await t.http().get('/sync/profiles').auth(admin, { type: 'bearer' })).status).toBe(403); // ruta de tableta
  });
});

describe('no personal data (spec 106 FR-001, T007)', () => {
  it('no /sync or /live response carries personal keys of the patient', async () => {
    const forbidden = [
      'firstNames',
      'lastNames',
      'birthDate',
      'guardianName',
      'guardianPhone',
      'diagnosisId',
      'conditionIds',
      'consentPath',
    ];
    const keys = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.flatMap(keys)
        : value && typeof value === 'object'
          ? Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)])
          : [];
    const responses = [
      (await tablet('/sync/profiles?since=0')).body as unknown,
      (await t.http().get('/live/patients').auth(admin, { type: 'bearer' })).body as unknown,
      (await t.http().get('/live/patients').auth(ana, { type: 'bearer' })).body as unknown,
    ];
    for (const body of responses) expect(keys(body).filter((k) => forbidden.includes(k))).toEqual([]);
  });
});

describe('POST /sync/batch', () => {
  it('saves the new, accepts the repeated without duplicating and rejects what does not apply', async () => {
    const s = session();
    const events = [tap(s.id), tap(s.id)];
    const first = await tablet('/sync/batch', batch({ sessions: [s], events }));
    expect(first.body).toEqual({
      accepted: { sessions: [s.id], events: events.map((e) => e.id), activityRuns: [], activityResults: [] },
      rejected: [],
    });
    expect((await tablet('/sync/batch', batch({ sessions: [s], events }))).body.accepted.events).toHaveLength(2);
    expect(await t.prisma.event.count()).toBe(2);

    const orphan = tap(crypto.randomUUID());
    const stranger = session({ patientCode: 'P-0000' });
    expect((await tablet('/sync/batch', batch({ sessions: [stranger], events: [orphan] }))).body.rejected).toEqual([
      { id: stranger.id, reason: 'UnknownPatientCode' },
      { id: orphan.id, reason: 'UnknownSession' },
    ]);

    // A later event of an already uploaded session, and the session close.
    const late = tap(s.id);
    await tablet('/sync/batch', batch({ sessions: [{ ...s, endedAt: minutesAgo(1) }], events: [late] }));
    expect(await t.prisma.session.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({
      endedAt: expect.any(Date),
      therapistVerified: false,
    });
    expect((await t.prisma.device.findUniqueOrThrow({ where: { id: tablet.deviceId } })).lastSyncAt).not.toBeNull();
  });

  it('"Más usados": counts taps and days of each pictogram in the profile; a repeated batch does not add twice', async () => {
    const as = (path: string) => t.http().post(path).auth(ana, { type: 'bearer' });
    const category = (await as('/categories').send({ name: 'Necesidades', color: '#FFB74D' })).body.id as string;
    const [water, eat] = await Promise.all(
      ['agua', 'comer'].map(
        async (label) => (await as('/pictograms').field('label', label).attach('image', png, 'p.png')).body.id as string,
      ),
    );
    for (const pictogramId of [water, eat]) await as(`/categories/${category}/pictograms`).send({ pictogramId });
    patient = await registerPatient(); // its profile is born with this category

    const today = session();
    const yesterday = session({ startedAt: minutesAgo(26 * 60) });
    const tapOn = (s: { id: string }, pictogramId: string, minutes: number) => ({
      ...tap(s.id),
      payload: { pictogramId, word: 'x' },
      occurredAt: minutesAgo(minutes),
    });
    const sent = batch({
      sessions: [today, yesterday],
      events: [tapOn(today, water, 4), tapOn(today, water, 3), tapOn(yesterday, water, 25 * 60), tapOn(today, eat, 2)],
    });
    const before = (await tablet('/sync/profiles?since=0')).body.version as number;
    expect((await tablet('/sync/batch', sent)).status).toBe(200);
    expect((await tablet('/sync/batch', sent)).status).toBe(200); // repetido

    const profile = await t.http().get(`/patients/${patient.id}/profile`).auth(ana, { type: 'bearer' });
    const usage = Object.fromEntries(
      profile.body.categories[0].pictograms.map((p: { label: string; useCount: number; daysUsed: number }) => [
        p.label,
        [p.useCount, p.daysUsed],
      ]),
    );
    expect(usage).toEqual({ agua: [3, 2], comer: [1, 1] });
    // The tablet downloads the profile with the new usage.
    expect((await tablet(`/sync/profiles?since=${before}`)).body.items).toEqual([expect.objectContaining({ patientCode: patient.code })]);
  });

  it('rejects unknown event types and invalid contents without losing the rest of the batch (spec 008 FR-004)', async () => {
    const s = session();
    const good = tap(s.id);
    const unknown = { ...tap(s.id), type: 'dance' };
    const invalid = { ...tap(s.id), payload: { word: 'agua' } }; // no pictogramId
    const res = await tablet('/sync/batch', batch({ sessions: [s], events: [good, unknown, invalid] }));
    expect(res.body.accepted.events).toEqual([good.id]);
    expect(res.body.rejected).toEqual(
      expect.arrayContaining([
        { id: unknown.id, reason: 'UnknownEventType' },
        { id: invalid.id, reason: 'InvalidEventPayload' },
      ]),
    );
  });

  it('a revoked tablet gets 401 on /sync (spec 106)', async () => {
    await t.http().post(`/devices/${tablet.deviceId}/revoke`).auth(admin, { type: 'bearer' });
    expect((await tablet('/sync/profiles?since=0')).status).toBe(401);
    expect((await tablet('/sync/batch', batch({}))).status).toBe(401);
  });

  it('more than 100 records: 413', async () => {
    const s = session();
    const res = await tablet('/sync/batch', batch({ sessions: [s], events: Array.from({ length: 100 }, () => tap(s.id)) }));
    expect(res.body).toMatchObject({ statusCode: 413, error: 'BatchTooLarge' });
  });

  it('"verified" only if the API saw that therapist\'s personal PIN on that tablet', async () => {
    await t.http().put('/auth/pin').auth(ana, { type: 'bearer' }).send({ currentPassword: password, pin: '4826' });
    const claimed = session({ therapistId: anaId, therapistVerified: true });
    await tablet('/sync/batch', batch({ sessions: [claimed] }));
    expect((await t.prisma.session.findUniqueOrThrow({ where: { id: claimed.id } })).therapistVerified).toBe(false);

    expect((await tablet(`/therapists/${anaId}/pin-check`, { pin: '4826' })).status).toBe(200);
    const real = session({ therapistId: anaId, therapistVerified: true, startedAt: new Date().toISOString() });
    await tablet('/sync/batch', batch({ sessions: [real] }));
    expect(await t.prisma.session.findUniqueOrThrow({ where: { id: real.id } })).toMatchObject({
      therapistId: anaId,
      therapistVerified: true,
    });
  });

  it('for a discharged patient, sessions that started before the discharge are accepted', async () => {
    const before = session({ startedAt: minutesAgo(30) });
    await t.http().post(`/patients/${patient.id}/discharge`).auth(ana, { type: 'bearer' });
    const after = session({ startedAt: new Date(Date.now() + 1000).toISOString() });
    const res = await tablet('/sync/batch', batch({ sessions: [before, after] }));
    expect(res.body).toMatchObject({ accepted: { sessions: [before.id] }, rejected: [{ id: after.id, reason: 'UnknownPatientCode' }] });
  });
});

describe('WebSocket /ws', () => {
  const open = (headers: Record<string, string>, query = '') =>
    new Promise<{ ws: WebSocket; next: () => Promise<Record<string, unknown>> }>((resolve, reject) => {
      const ws = new WebSocket(t.wsUrl + query, { headers });
      const inbox: Record<string, unknown>[] = [];
      const waiters: ((m: Record<string, unknown>) => void)[] = [];
      ws.on('message', (raw) => {
        const message = JSON.parse((raw as Buffer).toString()) as Record<string, unknown>;
        const waiter = waiters.shift();
        if (waiter) waiter(message);
        else inbox.push(message);
      });
      const next = () => new Promise<Record<string, unknown>>((r) => (inbox.length ? r(inbox.shift()!) : waiters.push(r)));
      ws.on('error', reject);
      ws.on('close', (code) => reject(new Error(`cerrado ${code}`)));
      void next().then(() => resolve({ ws, next })); // espera { type: 'ready' }
    });

  // Reads messages until the first of the requested type (the others, e.g. status changes, are skipped).
  const until = async (next: () => Promise<Record<string, unknown>>, type: string) => {
    for (;;) {
      const message = await next();
      if (message.type === type) return message;
    }
  };

  it('a tablet disabled while connected stops at its next batch', async () => {
    const device = await open(tablet.wsHeaders());
    const closed = new Promise<number>((resolve) => device.ws.once('close', resolve));
    device.ws.on('error', () => undefined);
    expect((await t.http().post(`/devices/${tablet.deviceId}/revoke`).auth(admin, { type: 'bearer' })).status).toBe(204);

    device.ws.send(JSON.stringify({ type: 'batch', id: 'b1', sessions: [session()] }));
    expect(await closed).toBe(4401);
  });

  it('whoever must still change their password gets no live view', async () => {
    await t.createUser('nueva@centro.org', Role.THERAPIST, { mustChangePassword: true });
    const { token } = await t.login('nueva@centro.org');
    await expect(open({}, `?token=${token}`)).rejects.toThrow('cerrado 4401');
  });

  it('the tablet sends a batch and receives the ack; the assigned therapist sees it live', async () => {
    const watcher = await open({}, `?token=${ana}`);
    watcher.ws.send(JSON.stringify({ type: 'watch', patientId: patient.id }));
    expect(await watcher.next()).toMatchObject({ type: 'watching', patientId: patient.id, status: 'OFFLINE', session: null, events: [] });

    const device = await open(tablet.wsHeaders());
    const s = session();
    const event = tap(s.id);
    device.ws.send(JSON.stringify({ type: 'batch', id: 'lote-1', ...batch({ sessions: [s], events: [event] }) }));
    expect(await device.next()).toMatchObject({ type: 'ack', id: 'lote-1', accepted: { sessions: [s.id], events: [event.id] } });
    expect(await t.prisma.event.count({ where: { id: event.id } })).toBe(1); // the ack was sent after writing

    expect(await watcher.next()).toMatchObject({
      type: 'events',
      patientId: patient.id,
      events: [{ id: event.id, type: 'pictogram_tapped' }],
    });
    expect(await until(watcher.next, 'status')).toMatchObject({ patientId: patient.id, status: 'ONLINE', session: { id: s.id } });
    device.ws.close();
    watcher.ws.close();
  });

  it('live presence: online, away and out of session; the web sees what already happened and each answer (spec 106 FR-005/006)', async () => {
    // The admin watches everyone's presence: the patient is out of session.
    const panel = await open({}, `?token=${admin}`);
    panel.ws.send(JSON.stringify({ type: 'presence' }));
    expect(await panel.next()).toMatchObject({
      type: 'presence',
      patients: [{ patientId: patient.id, code: patient.code, status: 'OFFLINE' }],
    });

    // The tablet opens the session: online.
    const device = await open(tablet.wsHeaders());
    const s = session({ startedAt: minutesAgo(1) });
    const runId = crypto.randomUUID();
    const event = { ...tap(s.id), occurredAt: minutesAgo(0.5) };
    device.ws.send(JSON.stringify({ type: 'batch', id: 'lote-2', ...batch({ sessions: [s], events: [event] }) }));
    await until(device.next, 'ack');
    expect(await until(panel.next, 'status')).toMatchObject({
      patientId: patient.id,
      status: 'ONLINE',
      session: { id: s.id, therapistName: null },
    });
    expect((await t.http().get('/live/patients').auth(admin, { type: 'bearer' })).text).toContain('"status":"ONLINE"');
    expect((await t.http().get('/live/patients').auth(ana, { type: 'bearer' })).body.items).toEqual([
      expect.objectContaining({ code: patient.code, status: 'ONLINE', avatarUrl: expect.any(String) }),
    ]);

    // The therapist opens the patient: receives what already happened and then each activity answer.
    const watcher = await open({}, `?token=${ana}`);
    watcher.ws.send(JSON.stringify({ type: 'watch', patientId: patient.id }));
    expect(await watcher.next()).toMatchObject({ type: 'watching', status: 'ONLINE', events: [{ id: event.id }], results: [] });
    const run = { id: runId, sessionId: s.id, type: 'identify', level: 1, startedAt: minutesAgo(0.4) };
    const answer = {
      id: crypto.randomUUID(),
      runId,
      targetPictogramId: crypto.randomUUID(),
      chosenPictogramId: crypto.randomUUID(),
      correct: false,
      firstAttempt: true,
      responseMs: 900,
      answeredAt: minutesAgo(0.3),
    };
    device.ws.send(JSON.stringify({ type: 'batch', id: 'lote-3', ...batch({ activityRuns: [run], activityResults: [answer] }) }));
    expect(await until(watcher.next, 'results')).toMatchObject({ patientId: patient.id, results: [{ id: answer.id, correct: false }] });

    // The tablet drops: away. The close arrives by batch: out of session.
    device.ws.close();
    expect(await until(panel.next, 'status')).toMatchObject({ status: 'AWAY' });
    await tablet('/sync/batch', batch({ sessions: [{ ...s, endedAt: minutesAgo(0) }] }));
    expect(await until(panel.next, 'status')).toMatchObject({ status: 'OFFLINE', session: null });
    expect(await t.prisma.auditLog.count({ where: { action: 'LIVE_WATCH' } })).toBe(1);
    panel.ws.close();
    watcher.ws.close();
  });

  it("rejects connections without a signature or with an invalid token; the admin does not watch a patient's session", async () => {
    await expect(open({ 'X-App-Key': process.env.APP_KEY! })).rejects.toThrow('4401');
    await expect(open({}, '?token=basura')).rejects.toThrow('4401');
    const panel = await open({}, `?token=${admin}`);
    panel.ws.send(JSON.stringify({ type: 'watch', patientId: patient.id }));
    expect(await panel.next()).toEqual({ type: 'error', error: 'UnknownMessage' });
    panel.ws.close();
  });
});
