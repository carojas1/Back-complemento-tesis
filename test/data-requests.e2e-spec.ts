// Specs 107 T007 / 108 T005 (report PDF), document queue (PDF and ZIP in the background) and 110 (data rights).
import JSZip from 'jszip';
import { Role } from '../src/auth/domain/entities/user.entity';
import { JobsWorker } from '../src/jobs/application/jobs.worker';
import { createTestApp, institutionA, png, TestApp } from './app';

let t: TestApp;
let admin: string;
let ana: string;
let otra: string;
let anaId: string;
let patient: { id: string; code: string };
let second: { id: string; code: string };
let tablet: Awaited<ReturnType<TestApp['newDevice']>>;

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const day = 24 * 60 * 60_000;

const as = (token: string) => ({
  get: (url: string) => t.http().get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object = {}) => t.http().post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) => t.http().patch(url).auth(token, { type: 'bearer' }).send(body),
});

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  await t.createUser('jefe@centro.org', Role.ADMIN);
  anaId = (await t.createUser('ana@centro.org')).id;
  await t.createUser('otra@centro.org');
  admin = (await t.login('jefe@centro.org')).token;
  ana = (await t.login('ana@centro.org')).token;
  otra = (await t.login('otra@centro.org')).token;

  const picto = async (label: string) =>
    (await t.http().post('/pictograms').auth(ana, { type: 'bearer' }).field('label', label).attach('image', png, 'p.png')).body
      .id as string;
  const [water, eat] = [await picto('agua'), await picto('comer')];
  const avatarId = (
    await t.http().post('/catalogs/avatars').auth(admin, { type: 'bearer' }).field('name', 'zorro').attach('image', svg, 'z.svg')
  ).body.id;
  const register = async (firstNames: string) => {
    let req = t.http().post('/patients').auth(admin, { type: 'bearer' });
    const fields = { firstNames, lastNames: 'Pérez', birthDate: '2018-05-20', guardianName: 'Lucía', guardianPhone: '0991234567' };
    for (const [key, value] of Object.entries({ ...fields, consentDate: '2026-10-20', avatarId, therapistIds: anaId }))
      req = req.field(key, value);
    return (await req.attach('consentImage', png, 'c.png')).body as { id: string; code: string };
  };
  patient = await register('Mateo');
  second = await register('Sofía');

  // A session with taps, a phrase and an activity (as in sessions.e2e-spec.ts).
  tablet = await t.newDevice(admin);
  const sessionId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const event = (type: string, payload: object, minutes: number) => ({
    id: crypto.randomUUID(),
    sessionId,
    type,
    payload,
    occurredAt: ago(minutes),
  });
  const result = (target: string, chosen: string) => ({
    id: crypto.randomUUID(),
    runId,
    targetPictogramId: target,
    chosenPictogramId: chosen,
    correct: target === chosen,
    firstAttempt: true,
    responseMs: 1500,
    answeredAt: ago(10),
  });
  const res = await tablet('/sync/batch', {
    sessions: [{ id: sessionId, patientCode: patient.code, therapistId: anaId, profileVersion: 1, startedAt: ago(40), endedAt: ago(10) }],
    events: [
      event('pictogram_tapped', { pictogramId: water, word: 'agua' }, 35),
      event('pictogram_tapped', { pictogramId: eat, word: 'comer' }, 33),
      event('sentence_spoken', { words: ['agua', 'comer'], length: 2 }, 32),
    ],
    activityRuns: [{ id: runId, sessionId, type: 'identify', level: 1, startedAt: ago(15), endedAt: ago(10) }],
    activityResults: [result(water, water), result(eat, water)],
  });
  expect(res.body.rejected).toEqual([]);
  await as(ana).post(`/patients/${patient.id}/notes`, { text: 'Pidió agua con el tablero', sessionId });
  await as(ana).post(`/patients/${patient.id}/goals`, { text: 'Formar frases de dos palabras' });
});
afterAll(() => t.app.close());

// The queue in tests: the worker does not run by itself; each `work()` does one job, like the src/worker.ts process.
const work = (now?: Date) => t.app.get(JobsWorker).runOnce(now);
const job = (id: string, token = ana) => as(token).get(`/jobs/${id}`);
// The file the job left in the bucket (in memory in tests).
const resultOf = async (id: string) => {
  const { resultPath } = await t.prisma.job.findUniqueOrThrow({ where: { id } });
  return t.memoryStorage!.get(resultPath!);
};
const pdfJob = (query = '', id = patient.id, token = ana) => as(token).post(`/patients/${id}/reports/pdf-jobs${query}`);

describe('document queue: report PDF (spec 107 T007, 108 T005)', () => {
  it('a specialist taken off the patient can no longer reach the file they asked for', async () => {
    const queued = await pdfJob();
    await work();
    expect((await job(queued.body.id)).body.downloadUrl).toEqual(expect.any(String));

    await t.prisma.therapistPatient.deleteMany({ where: { patientId: patient.id } });
    expect((await job(queued.body.id)).body).toMatchObject({ status: 'DONE', downloadUrl: null });
    const mine = await as(ana).get('/jobs');
    expect(mine.body.items.find((item: { id: string }) => item.id === queued.body.id).downloadUrl).toBeNull();
  });

  it('requesting the PDF responds 202 with the id; it is generated in the worker and gives a signed bucket URL for 24 h', async () => {
    const period = `?from=${ago(60 * 24)}&to=${ago(-60)}`;
    const queued = await pdfJob(period);
    expect(queued.status).toBe(202);
    expect(queued.body).toMatchObject({ type: 'REPORT_PDF', status: 'QUEUED', patientCode: patient.code, position: 0, downloadUrl: null });
    expect(queued.body).not.toHaveProperty('params.ip');
    // A double tap does not enqueue two: the same request in progress returns the same job.
    expect((await pdfJob(period)).body.id).toBe(queued.body.id);
    expect((await pdfJob('?from=2026-01-01')).body.id).not.toBe(queued.body.id); // another period is another job
    // Nothing is generated or audited until the worker runs.
    expect(await t.prisma.auditLog.count({ where: { action: 'REPORT_EXPORT' } })).toBe(0);

    expect(await work()).toBe(true);
    const done = (await job(queued.body.id)).body;
    expect(done).toMatchObject({ status: 'DONE', attempts: 1, error: null, position: null });
    expect(done.fileName).toMatch(new RegExp(`^reporte-${patient.code}-.*\\.pdf$`));
    expect(done.downloadUrl).toBe(`https://bucket.test/jobs/${queued.body.id}/${done.fileName}?firma=1`);
    expect(new Date(done.expiresAt).getTime() - new Date(done.finishedAt).getTime()).toBe(24 * 60 * 60_000);
    expect((await resultOf(queued.body.id)).subarray(0, 4).toString()).toBe('%PDF');
    expect(await t.prisma.auditLog.count({ where: { action: 'REPORT_EXPORT', patientCode: patient.code, actorId: anaId } })).toBe(1);
    expect(await work()).toBe(true); // the one for the other period
    expect(await work()).toBe(false); // empty queue

    // Empty period: it also generates the PDF (with the notice to widen the range).
    const empty = (await pdfJob('?from=2000-01-01&to=2000-02-01')).body.id as string;
    await work();
    expect((await job(empty)).body.status).toBe('DONE');
  });

  it('one document at a time and in order: the position says how many are ahead; cancel only while queued', async () => {
    const first = (await pdfJob('?from=2026-01-01')).body;
    const second_ = (await pdfJob('', second.id)).body;
    const zip = (await as(ana).post(`/patients/${patient.id}/export-jobs`)).body;
    expect([first.position, second_.position, zip.position]).toEqual([0, 1, 2]);

    const canceled = await t.http().delete(`/jobs/${second_.id}`).auth(ana, { type: 'bearer' });
    expect(canceled.body).toMatchObject({ status: 'CANCELED' });
    expect((await t.http().delete(`/jobs/${second_.id}`).auth(ana, { type: 'bearer' })).body.error).toBe('JobNotCancelable');
    expect((await job(zip.id)).body.position).toBe(1);

    await work();
    expect((await job(first.id)).body.status).toBe('DONE');
    expect((await t.http().delete(`/jobs/${first.id}`).auth(ana, { type: 'bearer' })).status).toBe(409);
    await work();
    expect((await job(zip.id)).body.status).toBe('DONE'); // the canceled one was skipped
    expect(await work()).toBe(false);

    const mine = (await as(ana).get('/jobs')).body;
    expect(mine.items.map((j: { id: string }) => j.id)).toEqual([zip.id, second_.id, first.id]);
  });

  it('only the assigned therapist enqueues; everyone sees only their jobs; the admin and no token cannot get in', async () => {
    expect((await pdfJob('', patient.id, otra)).status).toBe(403);
    expect((await as(otra).post(`/patients/${patient.id}/export-jobs`)).status).toBe(403);
    expect((await pdfJob('', crypto.randomUUID())).body.error).toBe('PatientNotFound');
    expect((await pdfJob('?from=no-es-fecha')).status).toBe(400);

    const id = (await pdfJob()).body.id as string;
    expect((await job(id, otra)).body.error).toBe('JobNotFound');
    expect((await t.http().delete(`/jobs/${id}`).auth(otra, { type: 'bearer' })).status).toBe(404);
    expect((await as(otra).get('/jobs')).body.total).toBe(0);
    expect((await job(id, admin)).status).toBe(403);
    expect((await t.http().get(`/jobs/${id}`)).status).toBe(401);
  });

  it('it is checked again when running: unassigned patient or deactivated account fail without retrying', async () => {
    const unassigned = (await pdfJob()).body.id as string;
    await t.prisma.therapistPatient.deleteMany({ where: { patientId: patient.id } });
    await work();
    expect((await job(unassigned)).body).toMatchObject({ status: 'FAILED', attempts: 1, error: 'No tiene asignado a este paciente' });

    await t.prisma.therapistPatient.create({ data: { institutionId: institutionA, patientId: patient.id, therapistId: anaId } });
    const inactive = (await pdfJob('?from=2026-01-01')).body.id as string;
    await t.prisma.user.update({ where: { id: anaId }, data: { active: false } });
    await work();
    const row = await t.prisma.job.findUniqueOrThrow({ where: { id: inactive } });
    expect(row).toMatchObject({ status: 'FAILED', error: 'La cuenta que pidió el archivo ya no está activa', resultPath: null });
  });

  it('transient error: retried with a wait; a dead worker leaves the job to another; after 3 attempts it fails', async () => {
    const storage = t.memoryStorage!;
    const put = jest.spyOn(storage, 'put').mockRejectedValueOnce(new Error('bucket caído'));
    const id = (await pdfJob()).body.id as string;
    await work();
    const waiting = await t.prisma.job.findUniqueOrThrow({ where: { id } });
    expect(waiting).toMatchObject({ status: 'QUEUED', attempts: 1, error: 'No se pudo generar el archivo. Intente de nuevo más tarde.' });
    expect(waiting.runAfter.getTime()).toBeGreaterThan(Date.now() + 20_000); // espera 30 s antes de reintentar
    expect(await work()).toBe(false);
    expect(await work(new Date(Date.now() + 31_000))).toBe(true);
    expect((await job(id)).body).toMatchObject({ status: 'DONE', attempts: 2, error: null });
    put.mockRestore();

    // Worker died midway: the job stayed RUNNING with the lease expired; another one takes it over.
    const crashed = (await pdfJob('?from=2026-01-01')).body.id as string;
    await t.prisma.job.update({
      where: { id: crashed },
      data: { status: 'RUNNING', attempts: 1, lockedUntil: new Date(Date.now() - 1000) },
    });
    await work();
    expect((await job(crashed)).body).toMatchObject({ status: 'DONE', attempts: 2 });

    // It failed on every attempt: it is not retried forever.
    const stuck = (await pdfJob('?from=2026-02-01')).body.id as string;
    await t.prisma.job.update({ where: { id: stuck }, data: { status: 'RUNNING', attempts: 3, lockedUntil: new Date(Date.now() - 1000) } });
    await work();
    expect((await job(stuck)).body.status).toBe('FAILED');
  });

  it('the file expires after 24 h: the cleanup deletes it from the bucket and the job is left without a download', async () => {
    const id = (await pdfJob()).body.id as string;
    await work();
    const { resultPath } = await t.prisma.job.findUniqueOrThrow({ where: { id } });
    expect(t.memoryStorage!.files.has(resultPath!)).toBe(true);
    await t.app.get(JobsWorker).cleanup(new Date(Date.now() + 23 * 60 * 60_000));
    expect(t.memoryStorage!.files.has(resultPath!)).toBe(true);
    await t.app.get(JobsWorker).cleanup(new Date(Date.now() + 25 * 60 * 60_000));
    expect(t.memoryStorage!.files.has(resultPath!)).toBe(false);
    expect((await job(id)).body).toMatchObject({ status: 'DONE', downloadUrl: null });
  });
});

describe('data rights (spec 110)', () => {
  const create = (type: string, extra: object = {}, id = patient.id) => as(ana).post(`/patients/${id}/data-requests`, { type, ...extra });

  it('the assigned therapist registers the request with a 15-day deadline; the listing respects the role and flags the deadlines', async () => {
    const created = await create('ACCESS', { notes: 'El representante pide una copia' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      patientCode: patient.code,
      patientId: patient.id,
      type: 'ACCESS',
      status: 'OPEN',
      deadline: 'ON_TIME',
    });
    expect(new Date(created.body.dueAt).getTime() - new Date(created.body.requestedAt).getTime()).toBe(15 * day);
    expect(created.body.statisticalUseAllowed).toBeNull();
    expect((await create('DELETION')).body.statisticalUseAllowed).toBe(false);
    expect((await create('BORRAR')).status).toBe(400);
    expect((await as(otra).post(`/patients/${patient.id}/data-requests`, { type: 'ACCESS' })).status).toBe(403);
    expect((await as(admin).post(`/patients/${patient.id}/data-requests`, { type: 'ACCESS' })).status).toBe(403);

    // Deadlines: 13 days after the request it is due soon; at 20, overdue.
    const soon = (await create('RECTIFICATION', {}, second.id)).body.id as string;
    await t.prisma.dataRequest.update({ where: { id: soon }, data: { requestedAt: new Date(Date.now() - 13 * day) } });
    await t.prisma.dataRequest.update({ where: { id: created.body.id }, data: { requestedAt: new Date(Date.now() - 20 * day) } });

    const all = await as(admin).get('/data-requests?status=OPEN&page=1&limit=10');
    expect(all.body).toMatchObject({ total: 3, page: 1, limit: 10, totalPages: 1 });
    const items = all.body.items as { id: string; deadline: string }[];
    const deadline = (id: string) => items.find((r) => r.id === id)?.deadline;
    expect([deadline(created.body.id), deadline(soon)]).toEqual(['OVERDUE', 'DUE_SOON']);
    expect(JSON.stringify(all.body)).not.toContain('Mateo'); // only the patient code
    expect((await as(ana).get('/data-requests')).body.total).toBe(3);
    expect((await as(otra).get('/data-requests')).body.total).toBe(0);
    expect((await as(admin).get('/data-requests?type=DELETION')).body.total).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'DATA_REQUEST_CREATE' } })).toBe(3);
  });

  it('exporting (through the queue) delivers the ZIP with record, report, observations, goals and events, and handles the access request', async () => {
    const request = (await create('ACCESS')).body.id as string;
    const queued = await as(ana).post(`/patients/${patient.id}/export-jobs`);
    expect(queued.status).toBe(202);
    expect(queued.body).toMatchObject({ type: 'EXPORT_ZIP', status: 'QUEUED' });
    expect((await t.prisma.dataRequest.findUniqueOrThrow({ where: { id: request } })).status).toBe('OPEN');
    await work();
    expect((await job(queued.body.id)).body).toMatchObject({ status: 'DONE', fileName: `datos-${patient.code}.zip` });

    const zip = await JSZip.loadAsync(await resultOf(queued.body.id));
    expect(Object.keys(zip.files).sort()).toEqual(
      [
        'actividades.csv',
        'deberes.csv',
        'eventos.csv',
        'ficha.pdf',
        'objetivos.csv',
        'observaciones.csv',
        'reporte.pdf',
        'sesiones.csv',
      ].sort(),
    );
    expect((await zip.file('ficha.pdf')!.async('nodebuffer')).subarray(0, 4).toString()).toBe('%PDF');
    expect((await zip.file('reporte.pdf')!.async('nodebuffer')).subarray(0, 4).toString()).toBe('%PDF');
    const events = await zip.file('eventos.csv')!.async('string');
    expect(events.split('\n')).toHaveLength(4); // encabezado + 3 eventos
    expect(events).toContain('pictogram_tapped,agua');
    expect(await zip.file('observaciones.csv')!.async('string')).toContain('Pidió agua con el tablero');
    expect(await zip.file('objetivos.csv')!.async('string')).toContain('Formar frases de dos palabras');
    expect(await zip.file('actividades.csv')!.async('string')).toContain('agua,agua,sí,sí');

    expect(await t.prisma.dataRequest.findUniqueOrThrow({ where: { id: request } })).toMatchObject({
      status: 'DONE',
      handledBy: anaId,
      respondedAt: expect.any(Date),
    });
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'DATA_EXPORT' } });
    expect(audit).toMatchObject({ actorId: anaId, patientCode: patient.code, summary: { requestIds: [request] } });
    expect((await as(otra).post(`/patients/${patient.id}/export-jobs`)).status).toBe(403);
  });

  it("rectification: the record is corrected and closed with the reason; rejecting is the admin's", async () => {
    const rect = (await create('RECTIFICATION', { notes: 'Teléfono del representante mal escrito' })).body.id as string;
    await as(ana).patch(`/patients/${patient.id}`, { guardianPhone: '0987654321' });
    const done = await as(ana).post(`/data-requests/${rect}/complete`, { notes: 'Se corrigió el teléfono' });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'DONE', handledBy: anaId, handledByName: 'ana', deadline: null });
    expect(done.body.notes).toBe('Teléfono del representante mal escrito\nRespuesta: Se corrigió el teléfono');
    expect((await as(ana).post(`/data-requests/${rect}/complete`, { notes: 'otra vez' })).body.error).toBe('DataRequestClosed');
    expect(await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'DATA_REQUEST_RECTIFY' } })).toMatchObject({
      entity: 'DataRequest',
      entityId: rect,
      patientCode: patient.code,
      summary: { reason: 'Se corrigió el teléfono' },
    });

    const access = (await create('ACCESS')).body.id as string;
    expect((await as(ana).post(`/data-requests/${access}/complete`, { notes: 'x' })).body.error).toBe('DataRequestWrongType');
    expect((await as(ana).post(`/data-requests/${access}/reject`, { notes: 'no' })).status).toBe(403);
    expect((await as(admin).post(`/data-requests/${access}/reject`, {})).status).toBe(400);
    const rejected = await as(admin).post(`/data-requests/${access}/reject`, { notes: 'El solicitante no es el representante' });
    expect(rejected.body).toMatchObject({ status: 'REJECTED', handledByName: 'jefe' });
    expect((await as(admin).post(`/data-requests/${access}/reject`, { notes: 'otra' })).status).toBe(409);
    expect(await t.prisma.auditLog.count({ where: { action: 'DATA_REQUEST_REJECT', entityId: access } })).toBe(1);
    expect((await as(admin).post(`/data-requests/${crypto.randomUUID()}/reject`, { notes: 'x' })).body.error).toBe('DataRequestNotFound');
  });

  it('deletion without statistical use: a wrong code deletes nothing; the right one deletes everything and the tablet removes the profile', async () => {
    const { version } = (await tablet('/sync/profiles?since=0')).body as { version: number };
    const consentPath = (await t.prisma.patient.findUniqueOrThrow({ where: { id: patient.id } })).consentFilePath;
    expect(t.memoryStorage?.files.has(consentPath) ?? true).toBe(true);
    const request = (await create('DELETION', { notes: 'Pedido por escrito' })).body.id as string;
    // An already generated PDF and another queued one of the patient: they are their data too.
    const generated = (await pdfJob()).body.id as string;
    await work();
    const pdfPath = (await t.prisma.job.findUniqueOrThrow({ where: { id: generated } })).resultPath!;
    await pdfJob('?from=2026-01-01');

    expect((await as(ana).post(`/data-requests/${request}/execute-deletion`, { confirmCode: patient.code })).status).toBe(403);
    const wrong = await as(admin).post(`/data-requests/${request}/execute-deletion`, { confirmCode: second.code });
    expect(wrong.body.error).toBe('ConfirmCodeMismatch');
    expect(await t.prisma.patient.count({ where: { id: patient.id } })).toBe(1);

    const done = await as(admin).post(`/data-requests/${request}/execute-deletion`, { confirmCode: patient.code.toLowerCase() });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'DONE', patientId: null, patientCode: patient.code, statisticalUseAllowed: false });

    expect(await t.prisma.patient.count({ where: { id: patient.id } })).toBe(0);
    expect(await t.prisma.session.count()).toBe(0);
    expect(await t.prisma.event.count()).toBe(0);
    expect(await t.prisma.activityResult.count()).toBe(0);
    expect(await t.prisma.note.count()).toBe(0);
    expect(await t.prisma.goal.count()).toBe(0);
    expect(await t.prisma.profile.count({ where: { patientId: patient.id } })).toBe(0);
    expect(await t.prisma.therapistPatient.count({ where: { patientId: patient.id } })).toBe(0);
    if (t.memoryStorage) expect(t.memoryStorage.files.has(consentPath)).toBe(false);
    expect(await t.prisma.job.count({ where: { patientCode: patient.code } })).toBe(0);
    expect(t.memoryStorage!.files.has(pdfPath)).toBe(false);
    expect(await work()).toBe(false); // the one that was queued no longer exists
    expect(await t.prisma.patient.count({ where: { code: 'ANONIMO' } })).toBe(0);

    // The tablet: the code arrives in retiredPatientCodes (and in dischargedPatientCodes) and its profile is gone.
    const sync = (await tablet(`/sync/profiles?since=${version}`)).body;
    expect(sync).toMatchObject({ retiredPatientCodes: [patient.code], dischargedPatientCodes: [patient.code] });
    expect(sync.version).toBeGreaterThan(version);
    const full = (await tablet('/sync/profiles?since=0')).body;
    expect(full.items.map((p: { patientCode: string }) => p.patientCode)).toEqual([second.code]);
    // A pending session of the deleted patient is rejected.
    const late = await tablet('/sync/batch', {
      sessions: [{ id: crypto.randomUUID(), patientCode: patient.code, profileVersion: 1, startedAt: ago(5) }],
      events: [],
      activityRuns: [],
      activityResults: [],
    });
    expect(late.body.rejected).toHaveLength(1);

    // FR-001: the request and the audit log are kept with the code.
    expect(await t.prisma.dataRequest.findUniqueOrThrow({ where: { id: request } })).toMatchObject({
      status: 'DONE',
      patientCode: patient.code,
    });
    expect(await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'DATA_DELETION' } })).toMatchObject({
      patientCode: patient.code,
      summary: { requestId: request, anonymized: false, sessions: 1 },
    });
    expect(await t.prisma.auditLog.count({ where: { patientCode: patient.code, action: 'PATIENT_CREATE' } })).toBe(1);
    const listed = await as(admin).get('/data-requests');
    expect(listed.body.items).toEqual([expect.objectContaining({ id: request, patientId: null, handledByName: 'jefe' })]);
    expect((await as(admin).post(`/data-requests/${request}/execute-deletion`, { confirmCode: patient.code })).status).toBe(409);
  });

  it('deletion with statistical use: sessions and events stay on the anonymous technical patient, without therapist', async () => {
    const request = (await create('DELETION', { statisticalUseAllowed: true })).body.id as string;
    const done = await as(admin).post(`/data-requests/${request}/execute-deletion`, { confirmCode: patient.code });
    expect(done.body).toMatchObject({ status: 'DONE', statisticalUseAllowed: true });

    expect(await t.prisma.patient.count({ where: { id: patient.id } })).toBe(0);
    const anonymous = await t.prisma.patient.findFirstOrThrow({ where: { code: 'ANONIMO' }, include: { therapists: true } });
    expect(anonymous).toMatchObject({ status: 'DISCHARGED', firstNames: 'Anónimo', consentFilePath: '', therapists: [] });
    const sessions = await t.prisma.session.findMany({ include: { _count: { select: { events: true } } } });
    expect(sessions).toEqual([expect.objectContaining({ patientId: anonymous.id, therapistId: null, therapistVerified: false })]);
    expect(sessions[0]._count.events).toBe(3);
    expect(await t.prisma.activityResult.count()).toBe(2);
    expect(await t.prisma.note.count()).toBe(0);

    // The technical patient does not appear in the list nor accept requests; the tablet does not receive it.
    const patients = (await as(admin).get('/patients')).body.items.map((p: { code: string }) => p.code);
    expect(patients).toEqual([second.code]);
    expect((await tablet('/sync/profiles?since=0')).body.items).toHaveLength(1);
    expect(await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'DATA_DELETION' } })).toMatchObject({
      summary: { anonymized: true },
    });

    // A second deleted patient reuses the same technical patient.
    const next = (await create('DELETION', { statisticalUseAllowed: true }, second.id)).body.id as string;
    expect((await as(admin).post(`/data-requests/${next}/execute-deletion`, { confirmCode: second.code })).status).toBe(200);
    expect(await t.prisma.patient.count()).toBe(1);
  });
});
