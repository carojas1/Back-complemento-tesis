// Logo of each center: only images by their bytes, bounded in weight and size, and invisible to other centers.
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, png, TestApp } from './app';

let t: TestApp;
let admin: string;
let therapist: string;

const pngOf = (side: number) => {
  const head = Buffer.from(png);
  head.writeUInt32BE(side, 16);
  head.writeUInt32BE(side, 20);
  return head;
};
const upload = (image: Buffer, name = 'logo.png', token = admin) =>
  t.http().put('/settings/logo').auth(token, { type: 'bearer' }).attach('logo', image, name);

beforeAll(async () => {
  t = await createTestApp();
  await t.reset();
  await t.createUser('jefe@centro.org', Role.ADMIN);
  await t.createUser('ana@centro.org');
  admin = (await t.login('jefe@centro.org')).token;
  therapist = (await t.login('ana@centro.org')).token;
});
afterAll(() => t.app.close());

describe('center logo', () => {
  it('the administrator uploads it, the staff sees it and it is audited', async () => {
    const saved = await upload(png);
    expect(saved.status).toBe(200);
    expect(saved.body.logoUrl).toEqual(expect.any(String));

    const branding = await t.http().get('/settings/branding').auth(therapist, { type: 'bearer' });
    expect(branding.status).toBe(200);
    expect(branding.body.logoUrl).toEqual(expect.any(String));
    expect(await t.prisma.auditLog.count({ where: { action: 'CENTER_LOGO_SET' } })).toBe(1);
  });

  it('the file name sent by the client does not reach the path', async () => {
    await upload(png, '../../../evil.html');
    const row = await t.prisma.centerSettings.findFirstOrThrow({ where: { logoPath: { not: null } } });
    expect(row.logoPath).toMatch(/^logos\/[0-9a-f-]+\/[0-9a-f-]+\.png$/);
  });

  it('rejects what is not PNG or JPG even if it claims to be', async () => {
    const script = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await upload(script, 'logo.svg')).status).toBe(400);
    expect((await upload(script, 'logo.png')).status).toBe(400);
    expect((await upload(Buffer.from('<html></html>'), 'logo.jpg')).status).toBe(400);
  });

  it('rejects by weight and by size', async () => {
    expect((await upload(Buffer.concat([png, Buffer.alloc(512_001)]))).status).toBe(413);
    expect((await upload(pngOf(2049))).status).toBe(400);
    expect((await upload(pngOf(2048))).status).toBe(200);
  });

  it('without a file responds 400', async () => {
    const response = await t.http().put('/settings/logo').auth(admin, { type: 'bearer' });
    expect(response.status).toBe(400);
  });

  it('only the administrator changes it', async () => {
    expect((await upload(png, 'logo.png', therapist)).status).toBe(403);
    expect((await t.http().delete('/settings/logo').auth(therapist, { type: 'bearer' })).status).toBe(403);
    expect((await t.http().put('/settings/logo').attach('logo', png, 'logo.png')).status).toBe(401);
    expect((await t.http().get('/settings/branding')).status).toBe(401);
  });

  it('does not appear in what the tablet downloads', async () => {
    const tablet = await t.newDevice(admin);
    const settings = await tablet('/devices/settings');
    expect(settings.status).toBe(200);
    expect(settings.body).not.toHaveProperty('logoUrl');
    expect(settings.body).not.toHaveProperty('logoPath');
  });

  it('another center neither sees nor replaces the logo', async () => {
    await upload(png);
    const before = await t.prisma.centerSettings.findFirstOrThrow({ where: { logoPath: { not: null } } });
    const { id: otherCenter } = await t.prisma.institution.create({ data: { name: 'Otro centro' } });
    await t.createUser('jefe@otro.org', Role.ADMIN, { institutionId: otherCenter });
    const other = (await t.login('jefe@otro.org')).token;

    expect((await t.http().get('/settings/branding').auth(other, { type: 'bearer' })).body).not.toHaveProperty('logoUrl');
    expect((await upload(png, 'logo.png', other)).status).toBe(200);
    const after = await t.prisma.centerSettings.findUniqueOrThrow({ where: { institutionId: before.institutionId } });
    expect(after.logoPath).toBe(before.logoPath);
  });

  it('once removed it is no longer shown', async () => {
    const removed = await t.http().delete('/settings/logo').auth(admin, { type: 'bearer' });
    expect(removed.status).toBe(200);
    expect(removed.body).not.toHaveProperty('logoUrl');
    const branding = await t.http().get('/settings/branding').auth(therapist, { type: 'bearer' });
    expect(branding.body).not.toHaveProperty('logoUrl');
  });
});
