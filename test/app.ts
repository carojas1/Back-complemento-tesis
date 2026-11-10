// Builds the real app (same modules, guards and pipes as main.ts) against the test database.
import 'dotenv/config';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync, sign } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { Role } from '../src/auth/domain/entities/user.entity';
import { AuthMailer } from '../src/auth/domain/ports/auth-notifications.ports';
import { Argon2PasswordHasher } from '../src/auth/infrastructure/security/argon2-password.hasher';
import { FileStorage } from '../src/common/storage/file-storage';
import { PrismaService } from '../src/prisma/prisma.service';
import { baseInstitutionId } from '../src/tenancy/tenancy';
import { ArasaacUnavailable } from '../src/pictograms/domain/exceptions/pictograms.exceptions';
import { ArasaacClient, ArasaacPictogram } from '../src/pictograms/domain/ports/pictograms.repository';
import { VoiceSynthesizer } from '../src/voices/domain/ports/voices.repository';

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
process.env.JWT_SECRET ??= 'secreto-de-pruebas';
process.env.WEB_URL ??= 'http://localhost:5173';
process.env.APP_KEY ??= 'clave-app-pruebas';
process.env.CONSENT_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64'); // fixed test key

export const password = 'Clave123456';
// Real 1 × 1 px PNG (the API reads the width and height from the header, spec 113 FR-011).
export const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
// Institution of the pre-spec-113 data: the one used by all tests that do not test isolation.
export const institutionA = baseInstitutionId;
let ipCounter = 0;

// Test ARASAAC: fixed responses and a switch to simulate it not responding.
export class FakeArasaac extends ArasaacClient {
  down = false;
  catalog: ArasaacPictogram[] = [
    { arasaacId: 100, label: 'agua', wordType: 'THING', previewUrl: 'https://static.test/100.png' },
    { arasaacId: 200, label: 'casa', wordType: 'THING', previewUrl: 'https://static.test/200.png' },
    { arasaacId: 201, label: 'casa de campo', wordType: 'THING', previewUrl: 'https://static.test/201.png' },
  ];

  private check() {
    if (this.down) throw new ArasaacUnavailable();
  }
  search(query: string) {
    this.check();
    return Promise.resolve(this.catalog.filter((p) => p.label.includes(query)));
  }
  find(arasaacId: number) {
    this.check();
    return Promise.resolve(this.catalog.find((p) => p.arasaacId === arasaacId) ?? null);
  }
  downloadImage() {
    this.check();
    return Promise.resolve(png);
  }
}

// Fake cloning service: each word is an mp3 with its text (spec 010). `down` simulates the service being down.
export class FakeSynthesizer extends VoiceSynthesizer {
  down = false;
  spoken: string[] = [];
  register() {
    return this.down ? Promise.reject(new Error('servicio caído')) : Promise.resolve('voz-de-prueba');
  }
  synthesize(_voice: string, text: string) {
    if (this.down) return Promise.reject(new Error('servicio caído'));
    this.spoken.push(text);
    return Promise.resolve(Buffer.concat([Buffer.from('ID3'), Buffer.from(text)]));
  }
}

// In-memory bucket, only if there are no Neon credentials in the environment (with credentials the real bucket is used).
export class MemoryStorage extends FileStorage {
  files = new Map<string, Buffer>();
  put(path: string, body: Buffer) {
    return Promise.resolve(void this.files.set(path, body));
  }
  signedUrl(path: string) {
    return Promise.resolve(`https://bucket.test/${path}?firma=1`);
  }
  get(path: string) {
    return Promise.resolve(this.files.get(path) ?? Buffer.alloc(0));
  }
  remove(path: string) {
    return Promise.resolve(void this.files.delete(path));
  }
}

export async function createTestApp() {
  // Emails are stored here instead of being sent (`token`: recovery link or temporary welcome password).
  const mails: { email: string; token: string; institution?: string }[] = [];
  const arasaac = new FakeArasaac();
  const synthesizer = new FakeSynthesizer();
  const memoryStorage = process.env.AWS_ENDPOINT_URL_S3 ? null : new MemoryStorage();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthMailer)
    .useValue({
      sendPasswordReset: (to: { email: string }, token: string) => Promise.resolve(void mails.push({ email: to.email, token })),
      sendInstitutionWelcome: (to: { email: string }, institution: string, token: string) =>
        Promise.resolve(void mails.push({ email: to.email, token, institution })),
      sendRequestReceived: () => Promise.resolve(),
      sendNewRequestAlert: () => Promise.resolve(),
    })
    .overrideProvider(ArasaacClient)
    .useValue(arasaac)
    .overrideProvider(VoiceSynthesizer)
    .useValue(synthesizer);
  if (memoryStorage) builder = builder.overrideProvider(FileStorage).useValue(memoryStorage);
  const module = await builder.compile();

  const app = setupApp(module.createNestApplication<NestExpressApplication>());
  await app.listen(0); // free port: the /ws WebSocket needs a listening server
  const wsUrl = `ws://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}/ws`;
  const prisma = app.get(PrismaService);
  const cache = app.get<Cache>(CACHE_MANAGER); // accounts, tablets and settings (spec 114): changes made in the database do not clear it
  const hasher = new Argon2PasswordHasher();
  const http = () => request(app.getHttpServer());
  // Each login uses another IP (behind the proxy) to avoid hitting the /auth rate limit.
  const newIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

  return {
    app,
    prisma,
    mails,
    http,
    newIp,
    wsUrl,
    arasaac,
    synthesizer,
    memoryStorage,
    cache,

    // Leaves only institution A, empty, and an empty cache. Tests use `prisma` as table owner (no RLS): the institution is explicit.
    async reset() {
      await prisma.$executeRawUnsafe(
        'TRUNCATE "Institution", "InstitutionRequest", "User", "Patient", "Device", "Category", "Pictogram", "LoginAttempt", "AuditLog", "Avatar", "Diagnosis", "Condition", "CenterSettings", "GlobalSyncVersion", "DataRequest", "RetiredPatientCode", "Job", "Notification", "Room", "CenterHours", "Subscription", "SubscriptionPayment" CASCADE',
      );
      await prisma.institution.create({ data: { id: institutionA, name: 'Centro' } });
      await cache.clear();
    },

    // Another institution, for the isolation tests (spec 113).
    createInstitution: (name: string) => prisma.institution.create({ data: { name } }),

    async createUser(
      email: string,
      role = Role.THERAPIST,
      extra: { active?: boolean; mustChangePassword?: boolean; institutionId?: string | null } = {},
    ) {
      const passwordHash = await hasher.hash(password);
      const institutionId = role === Role.SUPER_ADMIN ? null : (extra.institutionId ?? institutionA);
      return prisma.user.create({ data: { name: email.split('@')[0], email, passwordHash, role, ...extra, institutionId } });
    },

    async createPatient(code: string, createdBy: string, institutionId = institutionA) {
      const where = { institutionId_name: { institutionId, name: 'sol' } };
      return prisma.patient.create({
        data: {
          code,
          institutionId,
          avatar: { connectOrCreate: { where, create: { institutionId, name: 'sol', imagePath: 'avatars/sol.svg' } } },
          firstNames: 'Ana',
          lastNames: 'Prueba',
          birthDate: new Date('2018-01-01'),
          guardianName: 'Representante',
          guardianPhone: '0999999999',
          consentDate: new Date('2026-01-01'),
          consentFilePath: '/files/consent/test.pdf',
          creator: { connect: { id: createdBy } },
        },
      });
    },

    // Redeems a registration code with a fresh key pair, as a tablet does.
    registerDevice(code: string) {
      const spki = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
        .publicKey.export({ type: 'spki', format: 'der' })
        .toString('base64');
      return http()
        .post('/devices/register')
        .set('X-App-Key', process.env.APP_KEY!)
        .set('X-Forwarded-For', newIp())
        .send({ code, name: 'Tableta', publicKey: spki });
    },

    // Registers a tablet with an admin code and returns a signed GET like the app's.
    async newDevice(adminToken: string) {
      const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const appKey = process.env.APP_KEY!;
      // The Center PIN (one for all tablets) is created in the settings and required when generating the code.
      await http().put('/settings/center-pin').auth(adminToken, { type: 'bearer' }).send({ currentPin: '2580', pin: '2580' });
      const { code } = (await http().post('/devices/registration-codes').auth(adminToken, { type: 'bearer' }).send({ centerPin: '2580' }))
        .body as { code: string };
      const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
      const { token, deviceId } = (
        await http()
          .post('/devices/register')
          .set('X-App-Key', appKey)
          .set('X-Forwarded-For', newIp())
          .send({ code, name: 'Tableta', publicKey: spki })
      ).body as { token: string; deviceId: string };
      const signed = (method: string, path: string) => {
        const timestamp = String(Date.now());
        const signature = sign('sha256', Buffer.from(`${method}\n${path}\n${timestamp}`), privateKey).toString('base64');
        return { 'X-App-Key': appKey, Authorization: `Device ${token}`, 'X-Device-Timestamp': timestamp, 'X-Device-Signature': signature };
      };

      // Request signed like the tablet: GET without body, POST with body. New IP to avoid hitting the rate limit.
      const tablet = (path: string, body?: object) => {
        const headers = { ...signed(body ? 'POST' : 'GET', path), 'X-Forwarded-For': newIp() };
        return body ? http().post(path).set(headers).send(body) : http().get(path).set(headers);
      };
      // deviceId and the signed headers to open the WebSocket (GET /ws).
      return Object.assign(tablet, { deviceId, wsHeaders: () => signed('GET', '/ws') });
    },

    // Logs in and returns the access token and the refresh cookie.
    async login(email: string, pass = password): Promise<{ res: request.Response; token: string; cookie: string }> {
      const res = await http().post('/auth/login').set('X-Forwarded-For', newIp()).send({ email, password: pass });
      const cookie = ([res.headers['set-cookie']].flat()[0] ?? '').split(';')[0];
      return { res, token: res.body.accessToken as string, cookie };
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
