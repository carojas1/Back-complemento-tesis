// An SVG avatar is served as image/svg+xml, and a browser runs what it carries: only drawing elements pass, with nothing that loads or runs.
import { Role } from '../src/auth/domain/entities/user.entity';
import { createTestApp, TestApp } from './app';

let t: TestApp;
let admin: string;

const svg = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`);
const upload = (body: string) =>
  t
    .http()
    .post('/catalogs/avatars')
    .auth(admin, { type: 'bearer' })
    .set('X-Forwarded-For', `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`)
    .field('name', `a-${crypto.randomUUID()}`)
    .attach('image', svg(body), 'a.svg');

beforeAll(async () => {
  t = await createTestApp();
  await t.reset();
  await t.createUser('jefe@centro.org', Role.ADMIN);
  admin = (await t.login('jefe@centro.org')).token;
});
afterAll(() => t.app.close());

describe('SVG avatars', () => {
  it.each([
    '<a href="java&#115;cript:alert(1)"><rect/></a>',
    '<set attributeName="onload" to="alert(1)"/>',
    '<animate attributeName="href" to="javascript:alert(1)"/>',
    '<image href="https://evil.test/x.png"/>',
    '<use href="https://evil.test/x.svg#a"/>',
    '<rect fill="url(https://evil.test/x)"/>',
  ])('rechaza %s', async (body) => {
    expect((await upload(body)).status).toBe(400);
  });

  it('accepts what only draws, also with its own gradients', async () => {
    const drawing = '<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><rect fill="url(#g)"/><circle r="4"/>';
    expect((await upload(drawing)).status).toBe(201);
  });
});
