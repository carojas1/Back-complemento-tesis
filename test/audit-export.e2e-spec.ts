// Spec 109: the audit leaves as Excel or PDF with the same filter as the screen, only for the admin, and every export is itself audited.
import JSZip from 'jszip';
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, institutionA, TestApp } from './app';

let t: TestApp;
let admin: string;
let ana: string;

const binary = (
  res: { on: (event: string, listener: (chunk: Buffer) => void) => void },
  done: (error: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};
const download = (path: string, token = admin) =>
  t
    .http()
    .get(path)
    .auth(token, { type: 'bearer' })
    .buffer()
    .parse(binary as never);

beforeAll(async () => {
  t = await createTestApp();
  await t.reset();
  await t.createUser('jefe@centro.org', Role.ADMIN);
  const { id } = await t.createUser('ana@centro.org');
  admin = (await t.login('jefe@centro.org')).token;
  ana = (await t.login('ana@centro.org')).token;
  await t.prisma.auditLog.create({
    data: { institutionId: institutionA, actorType: 'USER', actorId: id, action: 'PATIENT_READ', entity: 'Patient', patientCode: 'P-0007' },
  });
});
afterAll(() => t.app.close());

describe('export the audit log', () => {
  it('Excel: a real .xlsx, with the filter and in Spanish', async () => {
    const res = await download('/audit/xlsx?patientCode=P-0007');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('auditoria.xlsx');
    const zip = await JSZip.loadAsync(res.body as Buffer);
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(sheet).toContain('Vio la ficha de un paciente');
    expect(sheet).toContain('P-0007');
    expect(sheet).not.toContain('Inició sesión');
  });

  it('a name shaped like a formula stays as text in Excel and in CSV', async () => {
    const { id } = await t.createUser('formula@centro.org');
    await t.prisma.user.update({ where: { id }, data: { name: '=HYPERLINK("http://x.test","<b>")' } });
    await t.prisma.auditLog.create({
      data: {
        institutionId: institutionA,
        actorType: 'USER',
        actorId: id,
        action: 'PATIENT_READ',
        entity: 'Patient',
        patientCode: 'P-0099',
      },
    });
    const xlsx = await JSZip.loadAsync((await download('/audit/xlsx?patientCode=P-0099')).body as Buffer);
    const sheet = await xlsx.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('=HYPERLINK(&quot;http://x.test&quot;,&quot;&lt;b&gt;&quot;)');

    const csv = await t.http().get('/audit/csv?patientCode=P-0099').auth(admin, { type: 'bearer' });
    expect(csv.text).toContain(`"'=HYPERLINK(`);
  });

  it('PDF: a real document', async () => {
    const res = await download('/audit/pdf?patientCode=P-0007');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('each export is audited with its format', async () => {
    await download('/audit/xlsx');
    const records = await t.prisma.auditLog.findMany({ where: { action: 'AUDIT_EXPORT' } });
    expect(records.map((r) => (r.summary as { format: string }).format)).toEqual(expect.arrayContaining(['xlsx', 'pdf']));
  });

  it('only the administrator exports', async () => {
    expect((await download('/audit/xlsx', ana)).status).toBe(403);
    expect((await download('/audit/pdf', ana)).status).toBe(403);
    expect((await t.http().get('/audit/xlsx')).status).toBe(401);
  });

  it('another center does not receive these records', async () => {
    const { id: other } = await t.createInstitution('Otro centro');
    await t.createUser('jefe@otro.org', Role.ADMIN, { institutionId: other });
    const token = (await t.login('jefe@otro.org')).token;
    const zip = await JSZip.loadAsync((await download('/audit/xlsx', token)).body as Buffer);
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(sheet).not.toContain('P-0007');
  });
});
