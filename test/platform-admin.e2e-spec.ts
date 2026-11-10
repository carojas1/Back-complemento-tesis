// Platform administration: review of requests within 24 hours, center management, limits, notifications,
// the shared agenda and the counts of the two home panels (never clinical data).
import { Role } from '../src/auth/domain/entities/user.entity';
import { privacyNoticeVersion } from '../src/institutions/domain/entities/institution-request.entity';
import { createTestApp, institutionA, TestApp } from './app';

let t: TestApp;
let superAdmin: string;
let admin: string;

const form = (overrides: object = {}) => ({
  institutionName: 'Fundación Sonrisas',
  ruc: '0190012345001',
  city: 'Cuenca',
  kind: 'Centro de terapia',
  contactName: 'María Pérez',
  contactEmail: 'direccion@sonrisas.org',
  contactPhone: '0991234567',
  approxPatients: 40,
  privacyVersion: privacyNoticeVersion,
  ...overrides,
});
const as = (token: string) => ({
  get: (url: string) => t.http().get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body?: object) => t.http().post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body?: object) => t.http().patch(url).auth(token, { type: 'bearer' }).send(body),
});
const requestFromWeb = (body: object) =>
  t.http().post('/institution-requests').set('Origin', 'http://localhost:5173').set('X-Forwarded-For', t.newIp()).send(body);

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

describe('Account request from the web', () => {
  it('accepts an allowed Origin, notifies the super administrator and rejects foreign clients', async () => {
    expect((await requestFromWeb(form())).status).toBe(201);
    const inbox = await as(superAdmin).get('/notifications');
    expect(inbox.body.items).toEqual([expect.objectContaining({ type: 'INSTITUTION_REQUEST_CREATED', readAt: null })]);
    expect((await as(superAdmin).get('/notifications/unread-count')).body).toEqual({ unread: 1 });
    // A center administrator never sees the platform notifications.
    expect((await as(admin).get('/notifications')).body.total).toBe(0);

    const foreign = await t
      .http()
      .post('/institution-requests')
      .set('Origin', 'https://ajeno.test')
      .send(form({ ruc: '0190099999001' }));
    expect(foreign.body.error).toBe('InvalidAppKey');
  });
});

describe('Request review', () => {
  it('PENDING → IN_REVIEW → APPROVED creates the center and returns the temporary password only once', async () => {
    const { id } = (await requestFromWeb(form())).body;
    expect((await as(superAdmin).get(`/platform/requests/${id}`)).body).toMatchObject({
      contactOverdue: false,
      contactDueAt: expect.any(String),
    });

    const reviewed = await as(superAdmin).post(`/platform/requests/${id}/review`, { notes: 'Hablé con la directora.' });
    expect(reviewed.body).toMatchObject({ status: 'IN_REVIEW', reviewNotes: 'Hablé con la directora.', contactedAt: expect.any(String) });
    const again = await as(superAdmin).post(`/platform/requests/${id}/review`, { notes: 'Otra vez' });
    expect(again.body).toMatchObject({ error: 'RequestAlreadyReviewed', message: 'Esta solicitud ya fue revisada' });

    const approved = await as(superAdmin).post(`/platform/requests/${id}/approve`);
    expect(approved.status).toBe(201);
    const institutionId = approved.body.institution.id as string;
    // The tablet app shows the first administrator's temporary password once: it comes in this response and in the email.
    const { temporaryPassword } = approved.body.admin as { temporaryPassword: string };
    expect(approved.body.admin).toEqual({ id: expect.any(String), email: 'direccion@sonrisas.org', temporaryPassword });
    expect(t.mails).toEqual([expect.objectContaining({ email: 'direccion@sonrisas.org', token: temporaryPassword })]);
    expect(JSON.stringify(approved.body)).not.toMatch(/passwordHash/);
    expect((await t.login('direccion@sonrisas.org', temporaryPassword)).res.body.user).toMatchObject({ mustChangePassword: true });

    const detail = await as(superAdmin).get(`/platform/institutions/${institutionId}`);
    expect(detail.body).toMatchObject({
      email: 'direccion@sonrisas.org',
      admins: [expect.objectContaining({ email: 'direccion@sonrisas.org', mustChangePassword: true })],
      usage: { therapists: 0, activePatients: 0 },
    });
    expect(JSON.stringify(detail.body)).not.toContain(temporaryPassword);
    const welcome = await t.prisma.notification.findFirstOrThrow({ where: { institutionId } });
    expect(welcome).toMatchObject({ type: 'INSTITUTION_APPROVED', link: '/center/team' });
  });

  it('another center administrator receives the temporary password in the response and by email', async () => {
    const url = `/platform/institutions/${institutionA}/admins`;
    const res = await as(superAdmin).post(url, { name: 'Ana Torres', email: 'Ana@Centro.org' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'ana@centro.org', mustChangePassword: true, temporaryPassword: expect.any(String) });
    expect(res.body).not.toHaveProperty('passwordHash');
    const temporaryPassword = res.body.temporaryPassword as string;
    expect(t.mails).toEqual([expect.objectContaining({ email: 'ana@centro.org', token: temporaryPassword })]);
    expect((await t.login('ana@centro.org', temporaryPassword)).res.status).toBe(200);
    const stored = await t.prisma.user.findFirstOrThrow({ where: { email: 'ana@centro.org' } });
    expect(stored.passwordHash).not.toContain(temporaryPassword);
    expect((await as(superAdmin).post(url, { name: 'Ana Torres', email: 'ana@centro.org' })).body.error).toBe('EmailTaken');
  });

  it('only the super administrator gets into /platform', async () => {
    expect((await as(admin).get('/platform/dashboard')).status).toBe(403);
    expect((await as(superAdmin).get('/platform/dashboard')).body).toMatchObject({
      requests: { pending: 0 },
      institutions: { total: 1, active: 1 },
    });
  });
});

describe('Limits and suspension', () => {
  it('blocks a therapist over the limit set by the super administrator and shows it in /limits', async () => {
    expect((await as(admin).get('/limits')).body).toEqual({ maxTherapists: null, maxDevices: null, activeTherapists: 0, activeDevices: 0 });
    await as(superAdmin).patch(`/platform/institutions/${institutionA}`, { maxTherapists: 1 });
    const create = (email: string, role?: string) =>
      as(admin).post('/users', { name: 'Terapeuta', email, temporaryPassword: 'Temporal12345', role });
    expect((await create('una@centro.org')).status).toBe(201);
    expect((await create('dos@centro.org')).body).toEqual({
      statusCode: 409,
      error: 'LimitReached',
      message: 'Este centro llegó a su límite de terapeutas (1)',
      resource: 'therapists',
      limit: 1,
    });
    expect((await create('mama@casa.org', 'PARENT')).status).toBe(201); // guardians do not count
    expect((await as(admin).get('/limits')).body).toEqual({ maxTherapists: 1, maxDevices: null, activeTherapists: 1, activeDevices: 0 });
  });

  it('blocks a tablet code over the limit; /limits is for the center administrator only', async () => {
    await as(superAdmin).patch(`/platform/institutions/${institutionA}`, { maxDevices: 1 });
    await t.newDevice(admin);
    expect((await as(admin).post('/devices/registration-codes', { centerPin: '2580' })).body).toMatchObject({
      error: 'LimitReached',
      message: 'Este centro llegó a su límite de tabletas (1)',
      resource: 'devices',
      limit: 1,
    });
    expect((await as(admin).get('/limits')).body).toMatchObject({ maxDevices: 1, activeDevices: 1 });

    await t.createUser('ana@centro.org');
    expect((await as((await t.login('ana@centro.org')).token).get('/limits')).status).toBe(403);
    expect((await as(superAdmin).get('/limits')).status).toBe(403);
  });

  it('a suspended center cannot get in; once reactivated it can again', async () => {
    const other = await t.createInstitution('Otro');
    await t.createUser('jefa@otro.org', Role.ADMIN, { institutionId: other.id });
    const boss = (await t.login('jefa@otro.org')).token;
    expect((await as(boss).get('/users')).status).toBe(200);

    expect((await as(superAdmin).post(`/platform/institutions/${other.id}/status`, { active: false })).status).toBe(400); // the reason is missing
    await as(superAdmin).post(`/platform/institutions/${other.id}/status`, { active: false, reason: 'Centro cerrado' });
    expect((await as(boss).get('/users')).status).toBe(401);
    expect((await t.login('jefa@otro.org')).res.status).toBe(401);

    await as(superAdmin).post(`/platform/institutions/${other.id}/status`, { active: true });
    expect((await t.login('jefa@otro.org')).res.status).toBe(200);
  });

  it('the template center is never suspended', async () => {
    const res = await as(superAdmin).post(`/platform/institutions/${institutionA}/status`, { active: false, reason: 'Prueba' });
    expect(res.body).toMatchObject({ error: 'TemplateInstitutionLocked', message: 'La institución plantilla no se puede suspender' });
  });
});

describe('Agenda', () => {
  const at = (h: number) => new Date(Date.UTC(2030, 0, 10, h)).toISOString();
  const slot = (from: number, to: number) => ({ startsAt: at(from), endsAt: at(to) });

  it('the administrator books for an assigned therapist without overlaps; the therapist views and closes her own', async () => {
    const therapist = await t.createUser('ana@centro.org', Role.THERAPIST);
    await t.createUser('luis@centro.org', Role.THERAPIST);
    const owner = await t.prisma.user.findFirstOrThrow({ where: { email: 'jefe@centro.org' } });
    const patient = await t.createPatient('P-0001', owner.id);
    const book = (therapistId: string, from: number, to: number) =>
      as(admin).post('/appointments', { patientId: patient.id, therapistId, ...slot(from, to) });

    expect((await book(therapist.id, 9, 10)).body.error).toBe('PatientNotAssignedToTherapist');
    await t.prisma.therapistPatient.create({ data: { therapistId: therapist.id, patientId: patient.id, institutionId: institutionA } });

    const booked = await book(therapist.id, 9, 10);
    expect(booked.status).toBe(201);
    expect(booked.body).toMatchObject({ status: 'SCHEDULED', patientCode: 'P-0001', therapistName: 'ana' });
    expect(JSON.stringify(booked.body)).not.toMatch(/firstNames|lastNames/); // the agenda shows only the code
    expect((await book(therapist.id, 9, 11)).body.error).toBe('TherapistUnavailable');
    expect((await book(therapist.id, 10, 11)).status).toBe(201); // back to back is fine

    const ana = (await t.login('ana@centro.org')).token;
    const luis = (await t.login('luis@centro.org')).token;
    expect((await as(ana).get('/appointments')).body.total).toBe(2);
    expect((await as(luis).get(`/appointments?therapistId=${therapist.id}`)).body.total).toBe(0); // always her own
    expect((await as(luis).post(`/appointments/${booked.body.id}/status`, { status: 'COMPLETED' })).status).toBe(403);
    expect((await as(ana).post(`/appointments/${booked.body.id}/status`, { status: 'COMPLETED' })).body.status).toBe('COMPLETED');
    expect((await as(admin).patch(`/appointments/${booked.body.id}`, { notes: 'Sala 3' })).body.error).toBe('AppointmentClosed');
  });

  it('the therapist books and moves only her appointments, with her assigned patients', async () => {
    const ana = await t.createUser('ana@centro.org', Role.THERAPIST);
    const luis = await t.createUser('luis@centro.org', Role.THERAPIST);
    const owner = await t.prisma.user.findFirstOrThrow({ where: { email: 'jefe@centro.org' } });
    const own = await t.createPatient('P-0001', owner.id);
    const notOwn = await t.createPatient('P-0002', owner.id);
    await t.prisma.therapistPatient.createMany({
      data: [
        { therapistId: ana.id, patientId: own.id, institutionId: institutionA },
        { therapistId: luis.id, patientId: notOwn.id, institutionId: institutionA },
      ],
    });
    const token = (await t.login('ana@centro.org')).token;

    // Without therapistId she books for herself; for another therapist or with a patient she is not assigned, 403.
    const booked = await as(token).post('/appointments', { patientId: own.id, ...slot(9, 10) });
    expect(booked.status).toBe(201);
    expect(booked.body).toMatchObject({ therapistId: ana.id, createdBy: ana.id, status: 'SCHEDULED' });
    const forOther = await as(token).post('/appointments', { patientId: notOwn.id, therapistId: luis.id, ...slot(11, 12) });
    expect(forOther.body).toMatchObject({ statusCode: 403, error: 'NotYourAppointment' });
    const unassigned = await as(token).post('/appointments', { patientId: notOwn.id, ...slot(11, 12) });
    expect(unassigned.body).toMatchObject({ statusCode: 403, error: 'PatientNotAssigned' });

    // Moves her own; does not hand it to another therapist, does not move another's and a closed one is not moved.
    const moved = await as(token).patch(`/appointments/${booked.body.id}`, slot(10, 11));
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ startsAt: at(10), endsAt: at(11) });
    expect((await as(token).patch(`/appointments/${booked.body.id}`, { therapistId: luis.id })).status).toBe(403);
    const luisAppointment = await as(admin).post('/appointments', { patientId: notOwn.id, therapistId: luis.id, ...slot(9, 10) });
    expect((await as(token).patch(`/appointments/${luisAppointment.body.id}`, slot(13, 14))).status).toBe(403);
    await as(token).post(`/appointments/${booked.body.id}/status`, { status: 'COMPLETED' });
    expect((await as(token).patch(`/appointments/${booked.body.id}`, slot(15, 16))).body).toMatchObject({
      statusCode: 409,
      error: 'AppointmentClosed',
    });
  });
});

describe('Home panels (counts only, from what the tablets sync)', () => {
  const day = 86_400_000;
  const ago = (days: number) => new Date(Date.now() - days * day);
  // Monday of the week in Ecuador time (UTC-5), as the API labels it.
  const mondayOf = (date: Date) => {
    const local = new Date(date.getTime() - 5 * 3_600_000);
    local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
    return local.toISOString().slice(0, 10);
  };
  const session = (patientId: string, startedAt: Date, extra: { therapistId?: string; kind?: 'HOME'; institutionId?: string } = {}) =>
    t.prisma.session.create({
      data: { id: crypto.randomUUID(), institutionId: institutionA, patientId, profileVersion: 1, startedAt, ...extra },
    });

  it("GET /dashboard sums attendance, each therapist's load, follow-up and sessions per week", async () => {
    const owner = await t.prisma.user.findFirstOrThrow({ where: { email: 'jefe@centro.org' } });
    const ana = await t.createUser('ana@centro.org');
    await t.createUser('luis@centro.org');
    await t.createUser('zoe@centro.org', Role.THERAPIST, { active: false });
    const followed = await t.createPatient('P-0001', owner.id);
    const alone = await t.createPatient('P-0002', owner.id);
    const discharged = await t.createPatient('P-0003', owner.id);
    await t.prisma.patient.update({ where: { id: discharged.id }, data: { status: 'DISCHARGED', dischargedAt: new Date() } });
    await t.prisma.therapistPatient.createMany({
      data: [followed, discharged].map((p) => ({ therapistId: ana.id, patientId: p.id, institutionId: institutionA })),
    });
    await session(followed.id, ago(2), { therapistId: ana.id });
    await session(followed.id, ago(40), { therapistId: ana.id }); // more than 30 days ago, within the 8 weeks
    await session(alone.id, ago(1), { kind: 'HOME' }); // practice at home is not a therapy session
    const appointment = (startsAt: Date, status: 'SCHEDULED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW') =>
      t.prisma.appointment.create({
        data: {
          institutionId: institutionA,
          patientId: followed.id,
          therapistId: ana.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3_600_000),
          status,
          createdBy: owner.id,
        },
      });
    await appointment(ago(3), 'COMPLETED');
    await appointment(ago(4), 'NO_SHOW');
    await appointment(ago(5), 'CANCELED');
    await appointment(ago(45), 'COMPLETED'); // outside the 30 days
    await appointment(ago(-3), 'SCHEDULED');

    const res = await as(admin).get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      patients: { active: 2, discharged: 1 },
      sessionsLast30Days: 1,
      appointmentsNext7Days: 1,
      attendance: { completed: 1, noShow: 1, canceled: 1 },
      therapistLoad: [
        { therapistId: ana.id, name: 'ana', activePatients: 1, sessionsLast30Days: 1, appointmentsNext7Days: 1 },
        { therapistId: expect.any(String), name: 'luis', activePatients: 0, sessionsLast30Days: 0, appointmentsNext7Days: 0 },
      ],
      followUp: { patientsWithoutTherapist: 1, patientsWithoutSessionIn30Days: 1 },
    });

    const weeks = res.body.sessionsByWeek as { weekStart: string; sessions: number }[];
    expect(weeks).toHaveLength(8);
    expect(weeks[7].weekStart).toBe(mondayOf(new Date()));
    for (const [i, week] of weeks.entries()) {
      expect(new Date(`${week.weekStart}T00:00:00Z`).getUTCDay()).toBe(1); // lunes
      if (i > 0) expect(Date.parse(week.weekStart) - Date.parse(weeks[i - 1].weekStart)).toBe(7 * day); // from the oldest to the current
    }
    const sessionsIn = (date: Date) => weeks.find((w) => w.weekStart === mondayOf(date))?.sessions;
    expect(sessionsIn(ago(2))).toBe(1);
    expect(sessionsIn(ago(40))).toBe(1);
    expect(weeks.reduce((n, w) => n + w.sessions, 0)).toBe(2); // with the zero weeks and without practice at home

    // Counts and therapist names: never patient names or clinical data.
    expect(JSON.stringify(res.body)).not.toMatch(/firstNames|lastNames|P-000|Prueba/);
    expect((await as(superAdmin).get('/dashboard')).status).toBe(403);
  });

  it("GET /platform/dashboard shows each center's activity", async () => {
    const owner = await t.prisma.user.findFirstOrThrow({ where: { email: 'jefe@centro.org' } });
    const other = await t.prisma.institution.create({ data: { name: 'Otro', city: 'Loja' } });
    const eva = await t.createUser('eva@otro.org', Role.THERAPIST, { institutionId: other.id });
    const otherPatient = await t.createPatient('P-0001', eva.id, other.id);
    const latest = ago(1);
    await session(otherPatient.id, ago(3), { institutionId: other.id, therapistId: eva.id });
    await session(otherPatient.id, latest, { institutionId: other.id, therapistId: eva.id });
    const ours = await t.createPatient('P-0001', owner.id);
    await session(ours.id, ago(60)); // A: no session in the last 30 days

    const res = await as(superAdmin).get('/platform/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      requests: { pending: 0, inReview: 0, contactOverdue: 0 },
      institutions: { total: 2, active: 2, suspended: 0 },
      totals: { therapists: 1, activePatients: 2, activeDevices: 0 },
      oldestOpenRequests: [],
    });
    expect(res.body.centers).toEqual([
      {
        id: other.id,
        name: 'Otro',
        city: 'Loja',
        active: true,
        therapists: 1,
        activePatients: 1,
        sessionsLast30Days: 2,
        lastSessionAt: latest.toISOString(),
        planStatus: null,
      },
      {
        id: institutionA,
        name: 'Centro',
        city: null,
        active: true,
        therapists: 0,
        activePatients: 1,
        sessionsLast30Days: 0,
        lastSessionAt: expect.any(String),
        planStatus: null,
      },
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/firstNames|lastNames|P-0001/);
  });
});
