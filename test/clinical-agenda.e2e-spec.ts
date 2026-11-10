// Clinical agenda: rooms, opening hours, treatment plans, metrics, the annual plan and the guarantees behind them.
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, institutionA, TestApp } from './app';

let t: TestApp;
let admin: string;
let specialist: string;
let specialistId: string;
let patientId: string;
let superAdmin: string;

const as = (token: string) => ({
  get: (url: string) => t.http().get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body?: object) => t.http().post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body?: object) => t.http().patch(url).auth(token, { type: 'bearer' }).send(body),
  put: (url: string, body?: object) => t.http().put(url).auth(token, { type: 'bearer' }).send(body),
});
// 2030-01-10 is a Thursday. Hours are local to the center (UTC-5).
const at = (hour: number, day = 10) => new Date(Date.UTC(2030, 0, day, hour + 5)).toISOString();
const slot = (from: number, to: number, day = 10) => ({ startsAt: at(from, day), endsAt: at(to, day) });

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  await t.createUser('plataforma@necon.org', Role.SUPER_ADMIN);
  const owner = await t.createUser('jefe@centro.org', Role.ADMIN);
  const therapist = await t.createUser('ana@centro.org', Role.THERAPIST);
  specialistId = therapist.id;
  const patient = await t.createPatient('P-0001', owner.id);
  patientId = patient.id;
  await t.prisma.therapistPatient.create({ data: { therapistId: therapist.id, patientId, institutionId: institutionA } });
  superAdmin = (await t.login('plataforma@necon.org')).token;
  admin = (await t.login('jefe@centro.org')).token;
  specialist = (await t.login('ana@centro.org')).token;
});
afterAll(() => t.app.close());

describe('Rooms and hours', () => {
  it('the administrator configures them; the specialist only reads them', async () => {
    const room = await as(admin).post('/rooms', { name: 'Consultorio 1' });
    expect(room.status).toBe(201);
    expect((await as(admin).post('/rooms', { name: 'Consultorio 1' })).body.error).toBe('RoomNameTaken');
    expect((await as(specialist).post('/rooms', { name: 'Otro' })).status).toBe(403);
    expect((await as(specialist).get('/rooms')).body.total).toBe(1);
    expect((await as(admin).patch(`/rooms/${room.body.id}`, { active: false })).body.active).toBe(false);
    expect((await as(admin).get('/rooms?active=true')).body.total).toBe(0);

    const hours = [{ weekday: 4, opensAt: 8 * 60, closesAt: 17 * 60 }];
    expect((await as(admin).put('/center-hours', { hours })).body).toEqual(hours);
    expect((await as(specialist).put('/center-hours', { hours: [] })).status).toBe(403);
    expect((await as(admin).put('/center-hours', { hours: [{ weekday: 1, opensAt: 600, closesAt: 500 }] })).body.error).toBe(
      'InvalidCenterHours',
    );
  });

  it('nothing is booked with the center closed or in a busy or inactive room', async () => {
    const room = (await as(admin).post('/rooms', { name: 'Consultorio 1' })).body;
    await as(admin).put('/center-hours', { hours: [{ weekday: 4, opensAt: 8 * 60, closesAt: 17 * 60 }] });
    const book = (body: object) => as(specialist).post('/appointments', { patientId, roomId: room.id, ...body });

    expect((await book(slot(7, 8))).body.error).toBe('OutsideCenterHours');
    expect((await book(slot(9, 10, 11))).body.error).toBe('OutsideCenterHours'); // viernes: cerrado
    expect((await book(slot(9, 10))).status).toBe(201);

    const other = await t.createUser('luis@centro.org', Role.THERAPIST);
    const second = await t.createPatient('P-0002', specialistId);
    await t.prisma.therapistPatient.create({ data: { therapistId: other.id, patientId: second.id, institutionId: institutionA } });
    const clash = await as(admin).post('/appointments', { patientId: second.id, therapistId: other.id, roomId: room.id, ...slot(9, 10) });
    expect(clash.body.error).toBe('RoomUnavailable');

    await as(admin).patch(`/rooms/${room.id}`, { active: false });
    expect((await book(slot(11, 12))).body.error).toBe('RoomNotBookable');
  });
});

describe('Appointments: guarantees', () => {
  it('two simultaneous requests for the same time: only one is booked', async () => {
    const book = () => as(specialist).post('/appointments', { patientId, ...slot(9, 10) });
    const results = await Promise.all([book(), book(), book(), book()]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await t.prisma.appointment.count()).toBe(1);
  });

  it('a missing or null date is a 400, never a 500', async () => {
    expect((await as(specialist).post('/appointments', { patientId })).status).toBe(400);
    const booked = (await as(specialist).post('/appointments', { patientId, ...slot(9, 10) })).body;
    expect((await as(specialist).patch(`/appointments/${booked.id}`, { startsAt: null })).status).toBe(400);
    expect((await as(admin).patch(`/appointments/${booked.id}`, { therapistId: null })).status).toBe(400);
  });

  it('editing notes does not re-validate the assignment; moving does', async () => {
    const booked = (await as(specialist).post('/appointments', { patientId, ...slot(9, 10) })).body;
    await t.prisma.therapistPatient.deleteMany({ where: { patientId } });
    expect((await as(specialist).patch(`/appointments/${booked.id}`, { notes: 'Traer tarjeta' })).status).toBe(200);
    expect((await as(specialist).patch(`/appointments/${booked.id}`, slot(11, 12))).status).toBe(403);
  });

  it('discharging the patient cancels their future appointments', async () => {
    const start = new Date(Date.now() + 86_400_000);
    const body = { patientId, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 2_700_000).toISOString() };
    const booked = (await as(specialist).post('/appointments', body)).body;
    expect((await as(specialist).post(`/patients/${patientId}/discharge`)).status).toBe(200);
    expect((await as(specialist).get(`/appointments/${booked.id}`)).body.status).toBe('CANCELED');
  });

  it('deactivating the specialist cancels their future appointments', async () => {
    const start = new Date(Date.now() + 86_400_000);
    const body = { patientId, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 2_700_000).toISOString() };
    const booked = (await as(specialist).post('/appointments', body)).body;
    expect((await as(admin).patch(`/users/${specialistId}`, { active: false })).status).toBe(200);
    expect((await as(admin).get(`/appointments/${booked.id}`)).body.status).toBe('CANCELED');
  });
});

describe('Treatment plan and progress', () => {
  it('the admin reads how many sessions were prescribed, not what the specialist wrote', async () => {
    await as(specialist).put(`/patients/${patientId}/treatment-plan`, { prescribedSessions: 12, notes: 'Texto de la especialista' });
    expect((await as(specialist).get(`/patients/${patientId}/treatment-plan`)).body).toMatchObject({
      prescribedSessions: 12,
      notes: 'Texto de la especialista',
    });
    expect((await as(admin).get(`/patients/${patientId}/treatment-plan`)).body).toMatchObject({ prescribedSessions: 12, notes: null });
  });

  it('only their specialist prescribes; progress comes from the agenda', async () => {
    expect((await as(specialist).get(`/patients/${patientId}/treatment-plan`)).body).toEqual({});
    expect((await as(admin).put(`/patients/${patientId}/treatment-plan`, { prescribedSessions: 12 })).status).toBe(403);
    expect((await as(specialist).put(`/patients/${patientId}/treatment-plan`, { prescribedSessions: 0 })).status).toBe(400);
    expect((await as(specialist).put(`/patients/${patientId}/treatment-plan`, { prescribedSessions: 12 })).body.prescribedSessions).toBe(
      12,
    );

    const first = (await as(specialist).post('/appointments', { patientId, ...slot(9, 10) })).body;
    await as(specialist).post(`/appointments/${first.id}/status`, { status: 'COMPLETED' });
    const second = (await as(specialist).post('/appointments', { patientId, ...slot(10, 11) })).body;
    await as(specialist).post(`/appointments/${second.id}/status`, { status: 'NO_SHOW' });
    await as(specialist).post('/appointments', { patientId, ...slot(11, 12) });

    const own = (await as(specialist).get('/treatment-progress')).body;
    expect(own.items[0]).toMatchObject({
      code: 'P-0001',
      prescribedSessions: 12,
      completedSessions: 1,
      missedSessions: 1,
      scheduledSessions: 1,
    });
    expect(own.items[0].nextAppointment.therapistName).toBe('ana');
    expect(own.items[0].name).not.toBeNull();

    // The admin sees the same figures by code, never the name.
    const board = (await as(admin).get('/treatment-progress')).body;
    expect(board.items[0]).toMatchObject({ code: 'P-0001', name: null, completedSessions: 1 });
    expect((await as(admin).get('/treatment-progress?search=P-9999')).body.total).toBe(0);
  });

  it('another specialist does not see the plan or progress of others', async () => {
    await t.createUser('luis@centro.org', Role.THERAPIST);
    const luis = (await t.login('luis@centro.org')).token;
    expect((await as(luis).get(`/patients/${patientId}/treatment-plan`)).status).toBe(403);
    expect((await as(luis).get('/treatment-progress')).body.total).toBe(0);
    expect((await as(luis).get(`/treatment-progress?therapistId=${specialistId}`)).body.total).toBe(0); // always their own
  });
});

describe('Metrics', () => {
  it('attendance, occupancy and patients seen, with filters and without mixing specialists', async () => {
    const room = (await as(admin).post('/rooms', { name: 'Consultorio 1' })).body;
    await as(admin).put('/center-hours', { hours: [{ weekday: 4, opensAt: 8 * 60, closesAt: 18 * 60 }] });
    await as(admin).patch(`/users/${specialistId}`, { specialty: 'Fonoaudiología' });
    const done = (await as(specialist).post('/appointments', { patientId, roomId: room.id, ...slot(9, 11) })).body;
    await as(specialist).post(`/appointments/${done.id}/status`, { status: 'COMPLETED' });
    const missed = (await as(specialist).post('/appointments', { patientId, ...slot(12, 13) })).body;
    await as(specialist).post(`/appointments/${missed.id}/status`, { status: 'NO_SHOW' });

    const range = `from=${at(0)}&to=${at(23)}`;
    const report = (await as(admin).get(`/dashboard/analytics?${range}`)).body;
    expect(report.attendance).toMatchObject({ completed: 1, noShow: 1, rate: 50 });
    expect(report.patientsAttended).toBe(1);
    expect(report.occupancy.rooms[0]).toMatchObject({ name: 'Consultorio 1', bookedMinutes: 120, openMinutes: 600, rate: 20 });
    expect(report.bySpecialty).toEqual([{ specialty: 'Fonoaudiología', completed: 1, noShow: 1, canceled: 0 }]);
    expect(report.byTherapist[0]).toMatchObject({ name: 'ana', patients: 1 });

    expect((await as(admin).get(`/dashboard/analytics?${range}&specialty=Psicología`)).body.attendance.completed).toBe(0);
    await t.createUser('luis@centro.org', Role.THERAPIST);
    const luis = (await t.login('luis@centro.org')).token;
    expect((await as(luis).get(`/dashboard/analytics?${range}&therapistId=${specialistId}`)).body.attendance.completed).toBe(0);
    expect((await as(superAdmin).get('/dashboard/analytics')).status).toBe(403);
  });
});

describe('Plan anual', () => {
  const center = () =>
    t.prisma.subscription.create({ data: { institutionId: institutionA, graceEndsAt: new Date(Date.now() + 86_400_000) } });

  it('the super administrator records the 2 USD payment and the center only reads it', async () => {
    await center();
    const url = `/platform/institutions/${institutionA}`;
    expect((await as(superAdmin).get(`${url}/subscription`)).body).toMatchObject({ priceCents: 200, effectiveStatus: 'PENDING_PAYMENT' });
    expect((await as(superAdmin).post(`${url}/payments`, { amountCents: 100, method: 'CASH' })).body.error).toBe('InvalidPaymentAmount');
    const paid = await as(superAdmin).post(`${url}/payments`, { amountCents: 200, method: 'BANK_TRANSFER', reference: 'TRX-1' });
    expect(paid.body.subscription.effectiveStatus).toBe('ACTIVE');

    // Paying early stacks the year after the current one.
    const again = await as(superAdmin).post(`${url}/payments`, { amountCents: 200, method: 'CASH' });
    expect(new Date(again.body.payment.periodStart).getTime()).toBe(new Date(paid.body.payment.periodEnd).getTime());

    expect((await as(admin).get('/subscription')).body.effectiveStatus).toBe('ACTIVE');
    expect((await as(admin).get('/subscription/payments')).body.total).toBe(2);
    expect((await as(admin).post(`${url}/payments`, { amountCents: 200, method: 'CASH' })).status).toBe(403);
    expect((await as(superAdmin).get('/platform/payments')).body.items[0].institutionName).toBeDefined();

    expect((await as(superAdmin).patch(`${url}/subscription`, { priceCents: 300 })).body.priceCents).toBe(300);
    expect((await as(superAdmin).post(`${url}/subscription/cancel`)).body.effectiveStatus).toBe('CANCELED');
    expect((await as(superAdmin).post(`${url}/payments`, { amountCents: 300, method: 'CASH' })).body.error).toBe('SubscriptionCanceled');
    expect((await as(superAdmin).get('/platform/dashboard')).body.plans.canceled).toBe(1);
    expect((await as(superAdmin).post(`${url}/subscription/reactivate`)).body.effectiveStatus).toBe('ACTIVE');
    expect((await as(superAdmin).patch(`${url}/subscription`, { priceCents: 0 })).status).toBe(400);
  });

  it("a center does not read another center's plan", async () => {
    const other = await t.prisma.institution.create({ data: { name: 'Otro centro' } });
    await t.prisma.subscription.create({ data: { institutionId: other.id } });
    expect((await as(admin).get('/subscription')).body.error).toBe('SubscriptionNotFound');
  });
});

describe('Aislamiento entre centros', () => {
  it("a center neither sees nor touches another center's rooms, appointments, plans or metrics", async () => {
    // Everything of center A, as its own staff creates it.
    const room = (await as(admin).post('/rooms', { name: 'Consultorio A' })).body;
    await as(admin).put('/center-hours', { hours: [{ weekday: 4, opensAt: 8 * 60, closesAt: 18 * 60 }] });
    await as(specialist).put(`/patients/${patientId}/treatment-plan`, { prescribedSessions: 12 });
    const appointment = (await as(specialist).post('/appointments', { patientId, roomId: room.id, ...slot(9, 10) })).body;
    await as(specialist).post(`/appointments/${appointment.id}/status`, { status: 'COMPLETED' });

    // Center B: its own admin and specialist.
    const other = await t.prisma.institution.create({ data: { name: 'Centro B' } });
    await t.prisma.globalSyncVersion.create({ data: { institutionId: other.id } });
    await t.prisma.centerSettings.create({ data: { institutionId: other.id, centerName: 'Centro B' } });
    await t.createUser('jefe@b.org', Role.ADMIN, { institutionId: other.id });
    const therapistB = await t.createUser('eva@b.org', Role.THERAPIST, { institutionId: other.id });
    const adminB = (await t.login('jefe@b.org')).token;
    const specialistB = (await t.login('eva@b.org')).token;
    const range = `from=${at(0)}&to=${at(23)}`;

    for (const token of [adminB, specialistB]) {
      expect((await as(token).get('/rooms')).body.total).toBe(0);
      expect((await as(token).get('/center-hours')).body).toEqual([]);
      expect((await as(token).get(`/appointments?${range}`)).body.total).toBe(0);
      expect((await as(token).get(`/appointments/${appointment.id}`)).status).toBe(404);
      expect((await as(token).get('/treatment-progress')).body.total).toBe(0);
      expect((await as(token).get(`/patients/${patientId}/treatment-plan`)).status).toBe(404);
      expect((await as(token).get(`/dashboard/analytics?${range}`)).body).toMatchObject({
        patientsAttended: 0,
        attendance: { completed: 0 },
      });
    }
    // A filter or an id pointing at center A changes nothing.
    expect((await as(adminB).get(`/appointments?therapistId=${specialistId}`)).body.total).toBe(0);
    expect((await as(adminB).get(`/treatment-progress?therapistId=${specialistId}`)).body.total).toBe(0);
    expect((await as(adminB).get(`/dashboard/analytics?${range}&therapistId=${specialistId}`)).body.attendance.completed).toBe(0);
    expect((await as(adminB).patch(`/rooms/${room.id}`, { name: 'Robado' })).status).toBe(404);
    expect((await as(specialistB).put(`/patients/${patientId}/treatment-plan`, { prescribedSessions: 1 })).status).toBe(404);
    expect((await as(adminB).patch(`/appointments/${appointment.id}`, { notes: 'x' })).status).toBe(404);
    expect((await as(adminB).post(`/appointments/${appointment.id}/status`, { status: 'CANCELED' })).status).toBe(404);
    const foreign = await as(adminB).post('/appointments', { patientId, therapistId: therapistB.id, ...slot(9, 10) });
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    // Center A keeps exactly what it had.
    expect((await as(admin).get('/rooms')).body.items[0].name).toBe('Consultorio A');
    expect((await as(admin).get(`/appointments/${appointment.id}`)).body.status).toBe('COMPLETED');
    expect((await as(specialist).get(`/patients/${patientId}/treatment-plan`)).body.prescribedSessions).toBe(12);
  });
});

describe('Review fixes', () => {
  it("losing a refresh race does not delete the browser's new cookie", async () => {
    const { cookie } = await t.login('ana@centro.org');
    expect((await t.http().post('/auth/refresh').set('Cookie', cookie)).status).toBe(200);
    const lost = await t.http().post('/auth/refresh').set('Cookie', cookie);
    expect(lost.status).toBe(401);
    expect(lost.headers['set-cookie']).toBeUndefined();
  });

  it('a tablet of a suspended center gets 403, never the 401 that deletes its token', async () => {
    const device = await t.newDevice(admin);
    expect((await device('/devices/settings')).status).toBe(200);
    // The template center cannot be suspended through the API: this exercises the device lookup directly.
    await t.prisma.institution.update({ where: { id: institutionA }, data: { active: false } });
    await t.cache.clear();
    try {
      const denied = await device('/devices/settings');
      expect(denied.status).toBe(403);
      expect(denied.body.error).toBe('InstitutionSuspended');
    } finally {
      await t.prisma.institution.update({ where: { id: institutionA }, data: { active: true } });
      await t.cache.clear();
    }
    expect((await device('/devices/settings')).status).toBe(200);
  });

  it('a code issued under the limit does not allow exceeding the limit when redeemed', async () => {
    await as(superAdmin).patch(`/platform/institutions/${institutionA}`, { maxDevices: 1 });
    const pin = { centerPin: '2580' };
    await as(admin).put('/settings/center-pin', { currentPin: '2580', pin: '2580' });
    const first = (await as(admin).post('/devices/registration-codes', pin)).body.code;
    const second = (await as(admin).post('/devices/registration-codes', pin)).body.code;
    const register = (code: string) => t.registerDevice(code);
    expect((await register(first)).status).toBe(201);
    expect((await register(second)).body.error).toBe('LimitReached');
  });

  it('reactivating a therapist respects the limit', async () => {
    await as(superAdmin).patch(`/platform/institutions/${institutionA}`, { maxTherapists: 1 });
    await as(admin).patch(`/users/${specialistId}`, { active: false });
    await as(admin).post('/users', { name: 'Luis', email: 'luis@centro.org', temporaryPassword: 'Temporal12345' });
    expect((await as(admin).patch(`/users/${specialistId}`, { active: true })).body.error).toBe('LimitReached');
  });

  it('renaming the center from the platform changes its name in the panels', async () => {
    await t.prisma.centerSettings.upsert({ where: { institutionId: institutionA }, create: { institutionId: institutionA }, update: {} });
    await as(superAdmin).patch(`/platform/institutions/${institutionA}`, { name: 'Centro Nuevo' });
    expect((await as(admin).get('/dashboard')).body.centerName).toBe('Centro Nuevo');
    expect((await as(superAdmin).patch(`/platform/institutions/${institutionA}`, { name: null })).status).toBe(400);
  });
});
