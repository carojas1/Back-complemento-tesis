// API performance tests with k6: a day of Center usage, all at once.
//   - panel: therapists in the panel (patient list, record, sessions, report, observations).
//   - tablets: tablets that sync batches of signed events (spec 106) and download profiles and settings.
//   - admin: the administrator reviews tablets, users and the audit log.
//   - documents: therapists who request the report PDF through the queue and wait for it to be ready.
//   - burst (separate profile): the 20 tablets sync in the same second, as when the Center's wifi comes back.
//
//   k6 run -e PROFILE=smoke|load|stress|burst test/perf/necon.js
//
// Needs test/perf/fixtures.json (node test/perf/seed.mjs) and an API against an ISOLATED database, never Neon.
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

const fx = JSON.parse(open('./fixtures.json'));
const api = __ENV.PERF_API || fx.api;
const profile = __ENV.PROFILE || 'smoke';

const pdfReady = new Trend('pdf_ready_ms', true); // from requesting the PDF to having its download URL
const eventsSynced = new Counter('events_synced');
const throttled = new Counter('throttled_429');
const serverErrors = new Counter('server_errors_5xx');

// "Reading" pause between actions: realistic in load; short in stress to find the limit.
const think = { smoke: [1, 2], load: [2, 5], stress: [1.5, 2], burst: [1, 2] }[profile];
const pause = () => sleep(think[0] + Math.random() * (think[1] - think[0]));

const scenarios = {
  smoke: {
    panel: { executor: 'constant-vus', exec: 'panel', vus: 1, duration: '30s' },
    tablets: { executor: 'constant-vus', exec: 'tablets', vus: 1, duration: '30s' },
    admin: { executor: 'constant-vus', exec: 'admin', vus: 1, duration: '30s' },
    documents: { executor: 'per-vu-iterations', exec: 'documents', vus: 1, iterations: 1, maxDuration: '1m' },
  },
  load: {
    panel: { executor: 'ramping-vus', exec: 'panel', stages: [{ duration: '1m', target: 30 }, { duration: '3m', target: 30 }, { duration: '30s', target: 0 }] },
    tablets: { executor: 'constant-vus', exec: 'tablets', vus: 20, duration: '4m30s' },
    admin: { executor: 'constant-vus', exec: 'admin', vus: 1, duration: '4m30s' },
    documents: { executor: 'constant-vus', exec: 'documents', vus: 2, duration: '4m', startTime: '30s' },
  },
  stress: {
    panel: { executor: 'ramping-vus', exec: 'panel', stages: [{ duration: '2m', target: 40 }, { duration: '3m', target: 40 }, { duration: '30s', target: 0 }] },
    tablets: { executor: 'constant-vus', exec: 'tablets', vus: 20, duration: '5m30s' },
    admin: { executor: 'constant-vus', exec: 'admin', vus: 2, duration: '5m30s' },
    documents: { executor: 'constant-vus', exec: 'documents', vus: 4, duration: '5m', startTime: '30s' },
  },
  burst: {
    burst: { executor: 'per-vu-iterations', exec: 'burst', vus: 20, iterations: 6, maxDuration: '2m' },
  },
}[profile];

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{kind:panel}': ['p(95)<500'],
    'http_req_duration{kind:tablet}': ['p(95)<800'],
    'http_req_duration{kind:admin}': ['p(95)<800'],
    'http_req_duration{kind:login}': ['p(95)<1500'], // argon2id is slow on purpose
    pdf_ready_ms: ['p(95)<20000'],
    events_synced: ['count>0'], // if the tablet signature fails, the test does not pass silently
    server_errors_5xx: ['count==0'],
  },
};

const vu = () => exec.vu.idInTest;
const ipOf = (n) => `10.20.${Math.floor(n / 250)}.${(n % 250) + 1}`;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function track(res, name) {
  if (res.status === 429) throttled.add(1, { name });
  if (res.status >= 500) serverErrors.add(1, { name });
  return res;
}

// ---------- Staff: session with JWT (renewed by logging in again before 15 min) ----------
const sessions = {};
function tokenFor(account) {
  const cached = sessions[account.email];
  if (cached && cached.until > Date.now()) return cached.token;
  const res = track(
    http.post(`${api}/auth/login`, JSON.stringify({ email: account.email, password: account.password }), {
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipOf(vu() * 50 + (exec.vu.iterationInScenario % 50)) },
      tags: { kind: 'login', name: 'POST /auth/login' },
    }),
    'login',
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  const token = res.json('accessToken');
  sessions[account.email] = { token, until: Date.now() + 12 * 60_000 };
  return token;
}

const get = (token, path, kind, name) =>
  track(http.get(`${api}${path}`, { headers: { Authorization: `Bearer ${token}` }, tags: { kind, name } }), name);

// Each VU is a different therapist (the API limits are per user).
const therapistOf = () => fx.therapists[(vu() - 1) % fx.therapists.length];
const patientsOf = (therapist) => fx.patients.filter((p) => p.therapistIds.includes(therapist.id));

export function panel() {
  const me = therapistOf();
  const token = tokenFor(me);
  const list = get(token, '/patients?limit=20', 'panel', 'GET /patients');
  check(list, { 'pacientes 200': (r) => r.status === 200 });
  const patient = pick(patientsOf(me));
  pause();
  check(get(token, `/patients/${patient.id}`, 'panel', 'GET /patients/:id'), { 'ficha 200': (r) => r.status === 200 });
  check(get(token, `/patients/${patient.id}/sessions?limit=20`, 'panel', 'GET /patients/:id/sessions'), { 'sesiones 200': (r) => r.status === 200 });
  pause();
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  const report = get(token, `/patients/${patient.id}/reports?from=${from.toISOString()}&to=${to.toISOString()}`, 'panel', 'GET /patients/:id/reports');
  check(report, { 'reporte 200': (r) => r.status === 200 });
  check(get(token, `/patients/${patient.id}/notes?limit=20`, 'panel', 'GET /patients/:id/notes'), { 'observaciones 200': (r) => r.status === 200 });
  pause();
}

export function admin() {
  const token = tokenFor(fx.admin);
  check(get(token, '/devices?limit=20', 'admin', 'GET /devices'), { 'tabletas 200': (r) => r.status === 200 });
  check(get(token, '/users?limit=20', 'admin', 'GET /users'), { 'usuarios 200': (r) => r.status === 200 });
  check(get(token, '/audit?limit=20', 'admin', 'GET /audit'), { 'auditoría 200': (r) => r.status === 200 });
  pause();
}

export function documents() {
  const me = fx.therapists[(vu() + 7) % fx.therapists.length];
  const token = tokenFor(me);
  const patient = pick(patientsOf(me));
  const to = new Date();
  const from = new Date(to.getTime() - (7 + Math.floor(Math.random() * 80)) * 86_400_000); // different periods: no deduplication
  const started = Date.now();
  const queued = track(
    http.post(`${api}/patients/${patient.id}/reports/pdf-jobs?from=${from.toISOString()}&to=${to.toISOString()}`, null, {
      headers: { Authorization: `Bearer ${token}` },
      tags: { kind: 'panel', name: 'POST /patients/:id/reports/pdf-jobs' },
    }),
    'pdf-jobs',
  );
  if (!check(queued, { 'PDF en cola 202': (r) => r.status === 202 })) return sleep(5);
  const id = queued.json('id');
  for (let i = 0; i < 60; i++) {
    sleep(1);
    const job = get(token, `/jobs/${id}`, 'panel', 'GET /jobs/:id');
    const status = job.json('status');
    if (status === 'DONE') {
      pdfReady.add(Date.now() - started);
      check(job, { 'PDF con URL de descarga': (r) => !!r.json('downloadUrl') });
      break;
    }
    if (status === 'FAILED' || status === 'CANCELED') {
      check(job, { 'PDF terminado': () => false });
      break;
    }
  }
  sleep(10);
}

// ---------- Tablets: ECDSA P-256 signature of `METHOD\npath\ntimestamp` (spec 103 FR-005), in DER and base64 ----------
const keys = {};
async function keyOf(device) {
  keys[device.deviceId] ??= await crypto.subtle.importKey('jwk', device.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return keys[device.deviceId];
}

// No TextEncoder or Uint8Array.from(text) in the k6 engine: byte by byte (the message is ASCII).
function ascii(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}
// WebCrypto delivers r‖s (64 bytes); the API, like Android Keystore, uses DER.
function toDer(raw) {
  const bytes = new Uint8Array(raw);
  const int = (part) => {
    let i = 0;
    while (i < part.length - 1 && part[i] === 0) i++;
    const body = Array.from(part.slice(i));
    if (body[0] & 0x80) body.unshift(0);
    return [0x02, body.length, ...body];
  };
  const seq = [...int(bytes.slice(0, 32)), ...int(bytes.slice(32))];
  return new Uint8Array([0x30, seq.length, ...seq]).buffer;
}

async function signed(device, method, path) {
  const timestamp = String(Date.now());
  const raw = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await keyOf(device), ascii(`${method}\n${path}\n${timestamp}`));
  return {
    'X-App-Key': fx.appKey,
    Authorization: `Device ${device.token}`,
    'X-Device-Timestamp': timestamp,
    'X-Device-Signature': encoding.b64encode(toDer(raw), 'std'),
  };
}

// A short therapy session: pictogram taps and phrases, as the tablet stores them.
function sessionBatch(patient) {
  const startedAt = new Date(Date.now() - 20 * 60_000);
  const session = { id: crypto.randomUUID(), patientCode: patient.code, therapistId: patient.therapistIds[0], therapistVerified: true, profileVersion: 1, startedAt: startedAt.toISOString(), endedAt: new Date().toISOString() };
  const events = Array.from({ length: 40 }, (_, i) => {
    const p = pick(fx.pictograms);
    const occurredAt = new Date(startedAt.getTime() + i * 25_000).toISOString();
    return i % 5 === 4
      ? { id: crypto.randomUUID(), sessionId: session.id, type: 'sentence_spoken', payload: { words: ['quiero', p.word], length: 2 }, occurredAt }
      : { id: crypto.randomUUID(), sessionId: session.id, type: 'pictogram_tapped', payload: { pictogramId: p.id, word: p.word, categoryId: p.categoryId }, occurredAt };
  });
  return { sessions: [session], events, activityRuns: [], activityResults: [] };
}

// Tablets are distributed per scenario iteration, not per VU: k6 numbers the VUs interleaving scenarios and two VUs
// with the same tablet would double its rate (the API gives 60 batches per minute to each one).
const deviceSlot = () => exec.scenario.iterationInTest;

export async function tablets() {
  const slot = deviceSlot();
  await syncOnce(fx.devices[slot % fx.devices.length], fx.patients[(slot * 7) % fx.patients.length], slot % 5 === 0);
  sleep(profile === 'stress' ? 1.5 : 5);
}

// All at once, aligned to the same second, every 10 s: they upload their batch and download profiles and settings.
export async function burst() {
  sleep(10 - ((Date.now() / 1000) % 10));
  const slot = deviceSlot();
  await syncOnce(fx.devices[slot % fx.devices.length], fx.patients[(slot * 7) % fx.patients.length], true);
}

async function syncOnce(device, patient, pull) {
  const batch = sessionBatch(patient);
  const res = track(
    http.post(`${api}/sync/batch`, JSON.stringify(batch), {
      headers: { 'Content-Type': 'application/json', ...(await signed(device, 'POST', '/sync/batch')) },
      tags: { kind: 'tablet', name: 'POST /sync/batch' },
    }),
    'sync-batch',
  );
  if (check(res, { 'lote aceptado': (r) => r.status === 200 && r.json('accepted.events').length === batch.events.length })) eventsSynced.add(batch.events.length);

  if (pull) {
    const path = '/sync/profiles?since=0&limit=20';
    const profiles = track(http.get(`${api}${path}`, { headers: await signed(device, 'GET', path), tags: { kind: 'tablet', name: 'GET /sync/profiles' } }), 'sync-profiles');
    check(profiles, { 'perfiles 200': (r) => r.status === 200 });
    const settings = track(http.get(`${api}/devices/settings`, { headers: await signed(device, 'GET', '/devices/settings'), tags: { kind: 'tablet', name: 'GET /devices/settings' } }), 'settings');
    check(settings, { 'configuración 200': (r) => r.status === 200 });
  }
}
