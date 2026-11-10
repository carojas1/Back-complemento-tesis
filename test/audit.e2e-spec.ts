// Spec 109: the administrator queries and exports the audit log; the table only accepts inserts.
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, institutionA, TestApp } from './app';

let t: TestApp;
let admin: string;
let ana: string;
let anaId: string;

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  await t.createUser('jefe@centro.org', Role.ADMIN);
  anaId = (await t.createUser('ana@centro.org')).id;
  admin = (await t.login('jefe@centro.org')).token;
  ana = (await t.login('ana@centro.org')).token;
  await t.prisma.auditLog.create({
    data: {
      institutionId: institutionA,
      actorType: 'USER',
      actorId: anaId,
      action: 'PATIENT_READ',
      entity: 'Patient',
      patientCode: 'P-0007',
    },
  });
});
afterAll(() => t.app.close());

const get = (url: string, token = admin) => t.http().get(url).auth(token, { type: 'bearer' });

describe('consulta (spec 109)', () => {
  it('filters by user, action, patient code and dates, paginated and with the actor name', async () => {
    const all = await get('/audit?page=1&limit=50');
    expect(all.body.items.map((r: { action: string }) => r.action)).toEqual(expect.arrayContaining(['LOGIN_SUCCESS', 'PATIENT_READ']));

    const byPatient = await get('/audit?patientCode=P-0007');
    expect(byPatient.body).toMatchObject({ total: 1, items: [{ action: 'PATIENT_READ', actorName: 'ana', patientCode: 'P-0007' }] });
    expect((await get(`/audit?actorId=${anaId}&action=LOGIN_SUCCESS`)).body.total).toBe(1);
    expect((await get('/audit?from=2000-01-01&to=2000-12-31')).body.total).toBe(0);

    expect((await get('/audit', ana)).status).toBe(403); // administrator only
  });

  it('shows the full detail of a record', async () => {
    const [record] = (await get('/audit?patientCode=P-0007')).body.items as { id: string }[];
    const detail = await get(`/audit/${record.id}`);
    expect(detail.body).toMatchObject({ id: record.id, action: 'PATIENT_READ', entity: 'Patient', actorName: 'ana', actorId: anaId });
    expect((await get('/audit/999999999')).body.error).toBe('AuditRecordNotFound');
    expect((await get('/audit/abc')).status).toBe(404);
    expect((await get(`/audit/${record.id}`, ana)).status).toBe(403);
  });

  it('exports the filter as CSV and the export is also audited', async () => {
    const csv = await get('/audit/csv?patientCode=P-0007');
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.replace('﻿', '').split('\n');
    expect(lines[0]).toBe('fecha,tipo,actor,nombre,acción,entidad,id,paciente,ip,resumen');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('PATIENT_READ');
    expect(await t.prisma.auditLog.count({ where: { action: 'AUDIT_EXPORT' } })).toBe(1);
  });

  it('a record cannot be modified or deleted (FR-003)', async () => {
    const row = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'PATIENT_READ' } });
    await expect(t.prisma.auditLog.update({ where: { id: row.id }, data: { action: 'OTRA' } })).rejects.toThrow(/solo inserción/);
    await expect(t.prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/solo inserción/);
  });
});
