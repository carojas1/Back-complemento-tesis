// Data for the performance tests (k6). Fills an ISOLATED database through the API, as the Center would:
// therapists, pictogram catalog, patients with consent, tablets registered with an ECDSA key and a
// synced session history. Never against Neon: the PERF_API API must use a test database.
//
//   node test/perf/seed.mjs   (PERF_API=http://localhost:3100 PERF_APP_KEY=… PERF_ADMIN_EMAIL=… PERF_ADMIN_PASSWORD=…)
//
// Leaves test/perf/fixtures.json (test accounts and keys, ignored by git) for the k6 script.
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const api = process.env.PERF_API ?? 'http://localhost:3100';
const appKey = process.env.PERF_APP_KEY ?? 'perf-app-key';
const adminEmail = process.env.PERF_ADMIN_EMAIL ?? 'admin@perf.test';
const adminPassword = process.env.PERF_ADMIN_PASSWORD ?? 'PerfAdmin2026';
const sizes = { therapists: 40, patients: 60, devices: 20, sessionsPerPatient: 6, eventsPerSession: 30 };
const therapistPassword = 'PerfClave2026';
const centerPin = '2580';

// Real 1×1 PNG image (consent, pictograms) and an SVG avatar.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
const words = {
  Necesidades: ['agua', 'comer', 'baño', 'dormir', 'ayuda', 'más', 'parar', 'jugar'],
  Emociones: ['feliz', 'triste', 'enojado', 'miedo', 'cansado', 'dolor', 'calma', 'sorpresa'],
  Personas: ['mamá', 'papá', 'hermano', 'abuela', 'terapeuta', 'amigo', 'profesor', 'yo'],
  Acciones: ['quiero', 'ir', 'dar', 'mirar', 'abrir', 'cerrar', 'escuchar', 'pintar'],
  Lugares: ['casa', 'escuela', 'parque', 'cocina', 'cuarto', 'patio', 'tienda', 'calle'],
};
const colors = ['#F2C94C', '#56CCF2', '#BB6BD9', '#6FCF97', '#F2994A'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 0;
const newIp = () => `10.9.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`; // each login with its own IP (rate limit)

async function call(method, path, { token, body, form, headers = {} } = {}) {
  const h = { 'X-Forwarded-For': newIp(), ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(api + path, { method, headers: h, body: payload });
    if (res.status === 429 && attempt < 5) {
      await sleep(2000 * (attempt + 1)); // the seed respects the API limits
      continue;
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
    return data;
  }
}

const formOf = (fields, files = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) form.append(k, String(one));
  for (const [k, [buf, name, type]] of Object.entries(files)) form.append(k, new Blob([buf], { type }), name);
  return form;
};

// Logs in; if the password is temporary, changes it to `finalPassword`.
async function login(email, password, finalPassword) {
  const session = await call('POST', '/auth/login', { body: { email, password } });
  if (!session.user.mustChangePassword) return session.accessToken;
  const changed = await call('POST', '/auth/change-password', {
    token: session.accessToken,
    body: { currentPassword: password, newPassword: finalPassword },
  });
  return changed.accessToken;
}

// Tablet signature (spec 103 FR-005): ECDSA P-256 of `METHOD\npath\ntimestamp`, in DER and base64.
async function tabletCall(device, method, path, body) {
  const { sign } = await import('node:crypto');
  const timestamp = String(Date.now());
  const signature = sign('sha256', Buffer.from(`${method}\n${path}\n${timestamp}`), device.privateKey).toString('base64');
  return call(method, path, {
    body,
    headers: { 'X-App-Key': appKey, Authorization: `Device ${device.token}`, 'X-Device-Timestamp': timestamp, 'X-Device-Signature': signature },
  });
}

const daysAgo = (d, minutes = 0) => new Date(Date.now() - d * 86_400_000 + minutes * 60_000).toISOString();

async function main() {
  const adminFinal = `${adminPassword}x`;
  let admin;
  try {
    admin = await login(adminEmail, adminPassword, adminFinal);
  } catch {
    admin = await login(adminEmail, adminFinal, adminFinal); // already changed in a previous run
  }
  console.log('admin listo');
  await call('PUT', '/settings/center-pin', { token: admin, body: { pin: centerPin } }).catch(() =>
    call('PUT', '/settings/center-pin', { token: admin, body: { currentPin: centerPin, pin: centerPin } }),
  );
  const avatar = await call('POST', '/catalogs/avatars', { token: admin, form: formOf({ name: `perf-${randomUUID().slice(0, 6)}` }, { image: [svg, 'a.svg', 'image/svg+xml'] }) });

  const therapists = [];
  for (let i = 0; i < sizes.therapists; i++) {
    const email = `terapeuta${i}@perf.test`;
    const user = await call('POST', '/users', { token: admin, body: { name: `Terapeuta ${i}`, email, temporaryPassword: 'Temporal2026' } });
    await login(email, 'Temporal2026', therapistPassword);
    therapists.push({ id: user.id, email, password: therapistPassword });
  }
  console.log(`${therapists.length} terapeutas`);

  // Center catalog: 5 categories × 8 pictograms (what each new patient's profile copies).
  const author = await login(therapists[0].email, therapistPassword, therapistPassword);
  const pictograms = [];
  let c = 0;
  for (const [name, labels] of Object.entries(words)) {
    const category = await call('POST', '/categories', { token: author, body: { name: `${name} perf`, color: colors[c++] } });
    for (const label of labels) {
      const p = await call('POST', '/pictograms', { token: author, form: formOf({ label }, { image: [png, 'p.png', 'image/png'] }) });
      await call('POST', `/categories/${category.id}/pictograms`, { token: author, body: { pictogramId: p.id } });
      pictograms.push({ id: p.id, word: label, categoryId: category.id });
    }
  }
  console.log(`${pictograms.length} pictogramas`);

  const patients = [];
  for (let i = 0; i < sizes.patients; i++) {
    const assigned = [therapists[i % therapists.length].id, therapists[(i + 1) % therapists.length].id];
    const fields = {
      firstNames: `Paciente${i}`,
      lastNames: 'Prueba Rendimiento',
      birthDate: '2016-03-10',
      guardianName: 'Representante',
      guardianPhone: '0991234567',
      consentDate: '2026-10-01',
      avatarId: avatar.id,
      therapistIds: assigned,
    };
    const p = await call('POST', '/patients', { token: admin, form: formOf(fields, { consentImage: [png, 'c.png', 'image/png'] }) });
    patients.push({ id: p.id, code: p.code, therapistIds: assigned });
  }
  console.log(`${patients.length} pacientes`);

  const devices = [];
  for (let i = 0; i < sizes.devices; i++) {
    if (i > 0) await sleep(12_500); // the API gives 5 codes per minute (protects the Center PIN)
    const { code } = await call('POST', '/devices/registration-codes', { token: admin, body: { centerPin } });
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const reg = await call('POST', '/devices/register', { headers: { 'X-App-Key': appKey }, body: { code, name: `Tableta perf ${i}`, publicKey: spki } });
    devices.push({ deviceId: reg.deviceId, token: reg.token, privateKey, jwk: privateKey.export({ format: 'jwk' }) });
  }
  console.log(`${devices.length} tabletas`);

  // History: sessions from the last 60 days per patient, synced in batches of up to 100 records.
  let synced = 0;
  for (const [i, patient] of patients.entries()) {
    const device = devices[i % devices.length];
    for (let s = 0; s < sizes.sessionsPerPatient; s++) {
      const day = 2 + s * 9;
      const session = { id: randomUUID(), patientCode: patient.code, therapistId: patient.therapistIds[0], therapistVerified: true, profileVersion: 1, startedAt: daysAgo(day), endedAt: daysAgo(day, 25) };
      const events = Array.from({ length: sizes.eventsPerSession }, (_, e) => {
        const p = pictograms[(i * 7 + s * 3 + e) % pictograms.length];
        return e % 6 === 5
          ? { id: randomUUID(), sessionId: session.id, type: 'sentence_spoken', payload: { words: ['quiero', p.word], length: 2 }, occurredAt: daysAgo(day, e * 0.5) }
          : { id: randomUUID(), sessionId: session.id, type: 'pictogram_tapped', payload: { pictogramId: p.id, word: p.word, categoryId: p.categoryId }, occurredAt: daysAgo(day, e * 0.5) };
      });
      await tabletCall(device, 'POST', '/sync/batch', { sessions: [session], events, activityRuns: [], activityResults: [] });
      synced += events.length;
      await sleep(250); // 60 batches per minute per tablet at most
    }
  }
  console.log(`${synced} eventos sincronizados`);

  const fixtures = {
    api,
    appKey,
    therapists,
    patients,
    pictograms,
    admin: { email: adminEmail, password: adminFinal },
    devices: devices.map(({ deviceId, token, jwk }) => ({ deviceId, token, jwk })),
  };
  writeFileSync(new URL('./fixtures.json', import.meta.url), JSON.stringify(fixtures, null, 2));
  console.log('fixtures.json listo');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
