// Specs 010 and 105 (agreed 2026-10-23): the therapist builds the patient's board from the panel, records her voice,
// configures the activities and creates the cloned voice; the tablet receives everything with an audioUrl per pictogram.
import { execFileSync } from 'node:child_process';
import { Role } from '../src/auth/domain/entities/user.entity';
import { JobsWorker } from '../src/jobs/application/jobs.worker';
import { voiceTypes } from '../src/jobs/domain/entities/job.entity';
import { createTestApp, png, TestApp } from './app';

let t: TestApp;
let ana: string;
let otra: string;
let patient: { id: string; code: string };
let catalog: { needs: string; places: string; water: string; eat: string; home: string };

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
// Real audios made with ffmpeg (the same one the API uses to convert): a tone of `seconds` seconds.
const tone = (seconds: number, format: 'webm' | 'ogg', codec: string) =>
  execFileSync(
    'ffmpeg',
    ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-ac', '1', '-c:a', codec, '-f', format, 'pipe:1'],
    { maxBuffer: 5_000_000 },
  );
const m4a = execFileSync(
  'sh',
  ['-c', 'f=$(mktemp --suffix=.m4a) && ffmpeg -y -v error -f lavfi -i sine=duration=1 -ac 1 -c:a aac -b:a 64k "$f" && cat "$f" && rm "$f"'],
  { maxBuffer: 5_000_000 },
); // as the app records
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(40)]);
// A word of `word` s with half a second of silence on each side, as the cloning service delivers it; `gainDb`
// makes it quieter (the word is barely audible) or louder.
const padded = (format: 'mp3' | 'm4a', word = 0.6, gainDb = 0) =>
  execFileSync(
    'sh',
    [
      '-c',
      `f=$(mktemp --suffix=.${format}) && ffmpeg -y -v error -f lavfi -i sine=duration=${word}:sample_rate=24000 -af volume=${gainDb}dB,adelay=500:all=1,apad=pad_dur=0.5 -ac 1 -b:a 64k "$f" && cat "$f" && rm "$f"`,
    ],
    { maxBuffer: 5_000_000 },
  );
// Average volume (dB) of the audio.
const meanDb = (audio: Buffer, format: 'mp3' | 'm4a') =>
  Number(
    /mean_volume: (-?[\d.]+)/.exec(
      execFileSync(
        'sh',
        [
          '-c',
          `f=$(mktemp --suffix=.${format}) && cat > "$f" && ffmpeg -nostdin -hide_banner -i "$f" -af volumedetect -f null - 2>&1; rm "$f"`,
        ],
        { input: audio },
      ).toString(),
    )![1],
  );
const seconds = (audio: Buffer, format: 'mp3' | 'm4a') =>
  Number(
    execFileSync(
      'sh',
      ['-c', `f=$(mktemp --suffix=.${format}) && cat > "$f" && ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"; rm "$f"`],
      { input: audio },
    )
      .toString()
      .trim(),
  );

beforeAll(async () => (t = await createTestApp()));
beforeEach(async () => {
  await t.reset();
  t.synthesizer.down = false;
  await t.createUser('jefe@centro.org', Role.ADMIN);
  const anaId = (await t.createUser('ana@centro.org')).id;
  await t.createUser('otra@centro.org');
  const admin = (await t.login('jefe@centro.org')).token;
  ana = (await t.login('ana@centro.org')).token;
  otra = (await t.login('otra@centro.org')).token;

  // Center catalog: Necesidades (agua, comer) and Lugares (casa).
  const post = (url: string, body: object) => t.http().post(url).auth(ana, { type: 'bearer' }).send(body);
  const picto = async (label: string) =>
    (await t.http().post('/pictograms').auth(ana, { type: 'bearer' }).field('label', label).attach('image', png, 'p.png')).body
      .id as string;
  const [needs, places] = await Promise.all([
    post('/categories', { name: 'Necesidades', color: '#FFB74D' }).then((r) => r.body.id as string),
    post('/categories', { name: 'Lugares', color: '#BA68C8' }).then((r) => r.body.id as string),
  ]);
  const [water, eat, home] = [await picto('agua'), await picto('comer'), await picto('casa')];
  for (const pictogramId of [water, eat]) await post(`/categories/${needs}/pictograms`, { pictogramId });
  await post(`/categories/${places}/pictograms`, { pictogramId: home });
  catalog = { needs, places, water, eat, home };

  const avatarId = (
    await t.http().post('/catalogs/avatars').auth(admin, { type: 'bearer' }).field('name', 'zorro').attach('image', svg, 'z.svg')
  ).body.id;
  let req = t.http().post('/patients').auth(admin, { type: 'bearer' });
  const fields = { firstNames: 'Mateo', lastNames: 'Pérez', birthDate: '2018-05-20', guardianName: 'Lucía', guardianPhone: '0991234567' };
  for (const [key, value] of Object.entries({ ...fields, consentDate: '2026-10-20', avatarId, therapistIds: anaId }))
    req = req.field(key, value);
  patient = (await req.attach('consentImage', png, 'c.png')).body;
});
afterAll(() => t.app.close());

const url = (path = '') => `/patients/${patient.id}/profile${path}`;
const as = (token: string) => ({
  get: (path: string) => t.http().get(path).auth(token, { type: 'bearer' }),
  post: (path: string, body?: object) => t.http().post(path).auth(token, { type: 'bearer' }).send(body),
  patch: (path: string, body: object) => t.http().patch(path).auth(token, { type: 'bearer' }).send(body),
  delete: (path: string) => t.http().delete(path).auth(token, { type: 'bearer' }),
});
type Board = { profileVersion: number; categories: { id: string; name: string; pictograms: { id: string; label: string }[] }[] };
const labels = (board: Board) => Object.fromEntries(board.categories.map((c) => [c.name, c.pictograms.map((p) => p.label)]));

describe('edit the board (spec 105 FR-009)', () => {
  it('removes and adds catalog categories and pictograms without touching the catalog; each change bumps the version', async () => {
    const start: Board = (await as(ana).get(url())).body;
    expect(labels(start)).toEqual({ Necesidades: ['agua', 'comer'], Lugares: ['casa'] });

    const places = start.categories.find((c) => c.name === 'Lugares')!;
    const removed: Board = (await as(ana).delete(url(`/categories/${places.id}`))).body;
    expect(labels(removed)).toEqual({ Necesidades: ['agua', 'comer'] });
    expect(removed.profileVersion).toBe(start.profileVersion + 1);
    expect((await as(ana).get('/categories?page=1&limit=10')).body.total).toBe(2); // the catalog stays the same

    const readded = await as(ana).post(url('/categories'), { categoryId: catalog.places });
    expect(readded.status).toBe(201);
    expect(labels(readded.body)).toEqual({ Necesidades: ['agua', 'comer'], Lugares: ['casa'] });
    expect((await as(ana).post(url('/categories'), { categoryId: catalog.places })).status).toBe(409);

    const needs = (readded.body as Board).categories.find((c) => c.name === 'Necesidades')!;
    const water = needs.pictograms.find((p) => p.label === 'agua')!;
    expect(labels((await as(ana).delete(url(`/pictograms/${water.id}`))).body)).toMatchObject({ Necesidades: ['comer'] });
    const back = await as(ana).post(url(`/categories/${needs.id}/pictograms`), { pictogramId: catalog.water });
    expect(labels(back.body)).toMatchObject({ Necesidades: ['comer', 'agua'] }); // at the end
    expect((await as(ana).post(url(`/categories/${needs.id}/pictograms`), { pictogramId: catalog.water })).status).toBe(409);
    expect((await as(ana).post(url(`/categories/${needs.id}/pictograms`), { pictogramId: crypto.randomUUID() })).status).toBe(404);

    expect((await as(otra).delete(url(`/categories/${needs.id}`))).status).toBe(403);
    // Four changes made (the 409s, 404s and 403s change nothing).
    expect(await t.prisma.auditLog.count({ where: { action: 'PROFILE_UPDATE' } })).toBe(4);
  });

  it('reorders board categories and pictograms (drag in the web editor)', async () => {
    const put = (path: string, ids: string[]) => t.http().put(url(path)).auth(ana, { type: 'bearer' }).send({ ids });
    const board: Board = (await as(ana).get(url())).body;
    const needs = board.categories.find((c) => c.name === 'Necesidades')!;
    const places = board.categories.find((c) => c.name === 'Lugares')!;
    const first = await put('/categories/order', [needs.id, places.id]);
    expect(first.body.categories.map((c: { name: string }) => c.name)).toEqual(['Necesidades', 'Lugares']);
    const swapped = await put('/categories/order', [places.id, needs.id]);
    expect(swapped.body.categories.map((c: { name: string }) => c.name)).toEqual(['Lugares', 'Necesidades']);
    expect((await put('/categories/order', [needs.id])).status).toBe(404); // faltan ids

    const [water, eat] = needs.pictograms;
    const ordered = await put(`/categories/${needs.id}/pictograms/order`, [eat.id, water.id]);
    expect(labels(ordered.body)).toEqual({ Lugares: ['casa'], Necesidades: ['comer', 'agua'] });
    expect(ordered.body.profileVersion).toBe(board.profileVersion + 3);
  });

  it('the word type reaches the board and editing it bumps the version so the tablet downloads it (agreed 2026-10-25)', async () => {
    const water = async () =>
      ((await as(ana).get(url())).body as Board).categories.flatMap((c) => c.pictograms).find((p) => p.label === 'agua');
    const before = await t.prisma.profile.findFirstOrThrow({ where: { patientId: patient.id } });
    expect(await water()).toMatchObject({ wordType: null }); // own image: unclassified until the therapist says otherwise
    await as(ana).patch(`/pictograms/${catalog.water}`, { wordType: 'THING' });
    const after = await t.prisma.profile.findFirstOrThrow({ where: { patientId: patient.id } });
    expect(after.syncVersion).toBeGreaterThan(before.syncVersion);
    expect(await water()).toMatchObject({ wordType: 'THING' });
  });

  it('activities configurable per profile (spec 105 FR-010)', async () => {
    const changed = await as(ana).patch(url(), { activityPrompts: 8, activityRepeatSeconds: 20, activityTypes: ['identify'] });
    expect(changed.body).toMatchObject({ activityPrompts: 8, activityRepeatSeconds: 20, activityTypes: ['identify'] });
    expect((await as(ana).patch(url(), { activityPrompts: 30 })).status).toBe(400);
    expect((await as(ana).patch(url(), { activityTypes: ['memoria'] })).status).toBe(400);
    expect((await as(ana).patch(url(), { activityTypes: [] })).body.activityTypes).toEqual([]); // no activities
    expect((await as(ana).patch(url(), { voice: 'CLONED' })).status).toBe(409); // no cloned voice ready
  });
});

describe('therapist recording (spec 010)', () => {
  it('uploads an m4a for a pictogram, the tablet receives its audioUrl and removing it leaves it without audio again', async () => {
    const board: Board = (await as(ana).get(url())).body;
    const water = board.categories[0].pictograms[0];
    const put = (audio: Buffer) =>
      t
        .http()
        .put(url(`/pictograms/${water.id}/recording`))
        .auth(ana, { type: 'bearer' })
        .attach('audio', audio, 'a.m4a');

    expect((await put(png)).body.error).toBe('InvalidRecording'); // not audio
    const recorded = await put(m4a);
    expect(recorded.status).toBe(200);
    expect(recorded.body.categories[0].pictograms[0]).toMatchObject({ audioSource: 'recording', audioUrl: expect.any(String) });
    const stored = () => [...t.memoryStorage!.files.entries()].filter(([path]) => path.startsWith('recordings/'));
    expect(stored()[0][1].equals(m4a)).toBe(true); // the app's m4a is stored as is

    // The browser records webm or ogg (opus): it is stored converted to m4a. Over 3 s is rejected with its reason.
    expect((await put(tone(1, 'webm', 'libopus'))).status).toBe(200);
    expect(stored()).toHaveLength(1); // the previous recording was deleted from the bucket
    expect(stored()[0][0]).toMatch(/\.m4a$/);
    expect(stored()[0][1].subarray(4, 8).toString()).toBe('ftyp');
    expect((await put(tone(2, 'ogg', 'libopus'))).status).toBe(200);
    expect((await put(tone(5, 'webm', 'libopus'))).body).toMatchObject({ statusCode: 400, error: 'RecordingTooLong' });

    const removed = await as(ana).delete(url(`/pictograms/${water.id}/recording`));
    expect(removed.body.categories[0].pictograms[0]).toMatchObject({ audioSource: null, audioUrl: null });
  });

  it('stores the recording without the edge silence, so the phrase sounds continuous', async () => {
    const board: Board = (await as(ana).get(url())).body;
    const water = board.categories[0].pictograms[0];
    const recording = padded('m4a');
    const res = await t
      .http()
      .put(url(`/pictograms/${water.id}/recording`))
      .auth(ana, { type: 'bearer' })
      .attach('audio', recording, 'a.m4a');
    expect(res.status).toBe(200);
    // The in-memory bucket lasts the whole suite: look at the file the database says, not just any in `recordings/`.
    const { recordingPath } = await t.prisma.profilePictogram.findUniqueOrThrow({ where: { id: water.id } });
    expect(seconds(recording, 'm4a')).toBeGreaterThan(1.5);
    expect(seconds(t.memoryStorage!.files.get(recordingPath!)!, 'm4a')).toBeLessThan(0.9); // the word (0.6 s) and a few ms on each side
  });
});

describe('voz clonada (spec 010 FR-004/005)', () => {
  // The queue worker, voice lane, until nothing is left (in production it runs in its own process).
  const drainVoice = async () => {
    while (await t.app.get(JobsWorker).runOnce(new Date(), voiceTypes));
  };
  const create = (fields: Record<string, string>, sample: Buffer | null = wav) => {
    let req = t.http().post(`/patients/${patient.id}/voice`).auth(ana, { type: 'bearer' });
    for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
    return sample ? req.attach('sample', sample, 'muestra.wav') : req;
  };
  const consent = {
    ownerName: 'Lucía Pérez',
    relationship: 'Madre',
    consentDate: '2026-10-20',
    consentConfirmed: 'true',
    transcript: 'Hola',
  };
  const generate = async () => {
    expect((await as(ana).post(`/patients/${patient.id}/voice/generate`)).status).toBe(202);
    await drainVoice();
  };

  it('requires consent, generates one audio per word on request, the profile delivers it and the recording takes priority', async () => {
    expect((await create({ ...consent, consentConfirmed: 'false' })).body.error).toBe('VoiceConsentRequired');
    expect((await create(consent, png)).body.error).toBe('InvalidVoiceSample');

    const created = await create(consent);
    expect(created.status).toBe(201);
    await drainVoice();
    // The base voice becomes ready, but the audios are generated only when the therapist asks.
    const voice = await as(ana).get(`/patients/${patient.id}/voice`);
    expect(voice.body).toMatchObject({
      status: 'READY',
      transcript: 'Hola',
      progress: { ready: 0, total: 3 },
      missing: 3,
      generating: false,
    });
    expect(t.synthesizer.spoken).toEqual([]);
    await generate();
    expect((await as(ana).get(`/patients/${patient.id}/voice`)).body).toMatchObject({ missing: 0, generating: false });
    expect(t.synthesizer.spoken.sort()).toEqual(['agua', 'casa', 'comer']);
    expect((await create(consent)).status).toBe(409);

    // The tablet downloads the profile with the chosen cloned voice: each pictogram carries its audio.
    const cloned = await as(ana).patch(url(), { voice: 'CLONED' });
    expect(cloned.body).toMatchObject({ voice: 'CLONED', voiceStatus: 'READY' });
    const water = (cloned.body as Board).categories[0].pictograms[0];
    expect(cloned.body.categories[0].pictograms[0]).toMatchObject({ audioSource: 'cloned', audioUrl: expect.any(String) });
    await t
      .http()
      .put(url(`/pictograms/${water.id}/recording`))
      .auth(ana, { type: 'bearer' })
      .attach('audio', m4a, 'a.m4a');
    expect((await as(ana).get(url())).body.categories[0].pictograms[0].audioSource).toBe('recording');

    // Changing the label forces that audio to be generated again.
    await as(ana).patch(`/pictograms/${catalog.eat}`, { label: 'comida' });
    expect((await as(ana).get(`/patients/${patient.id}/voice`)).body).toMatchObject({ progress: { ready: 2, total: 3 }, missing: 1 });
    await generate();
    expect((await as(ana).get(`/patients/${patient.id}/voice`)).body.progress).toEqual({ ready: 3, total: 3 });

    expect(await t.prisma.auditLog.count({ where: { action: 'VOICE_CREATE' } })).toBe(1);
    expect((await as(otra).get(`/patients/${patient.id}/voice`)).status).toBe(403);

    // Deleting it goes back to the system voice.
    expect((await as(ana).delete(`/patients/${patient.id}/voice`)).status).toBe(204);
    expect((await as(ana).get(url())).body).toMatchObject({ voice: 'SYSTEM', voiceStatus: 'NONE' });
    expect((await as(ana).get(`/patients/${patient.id}/voice`)).status).toBe(404);
  });

  it('generation goes through the queue: it is followed by its id, a double tap does not enqueue two and an outage retries without losing what was done', async () => {
    t.synthesizer.down = false;
    await create(consent);
    await drainVoice();
    const first = await as(ana).post(`/patients/${patient.id}/voice/generate`);
    expect(first.body).toMatchObject({ generating: true, jobId: expect.any(String) });
    expect((await as(ana).post(`/patients/${patient.id}/voice/generate`)).body.jobId).toBe(first.body.jobId);
    expect((await as(ana).get(`/jobs/${first.body.jobId}`)).body).toMatchObject({
      type: 'VOICE_CLIPS',
      status: 'QUEUED',
      downloadUrl: null,
    });

    // The service goes down after the first word: what was generated stays and the job goes back to the queue with a wait.
    const real = t.synthesizer.synthesize.bind(t.synthesizer);
    const spy = jest.spyOn(t.synthesizer, 'synthesize').mockImplementationOnce(real).mockRejectedValueOnce(new Error('servicio caído'));
    await drainVoice();
    expect((await as(ana).get(`/jobs/${first.body.jobId}`)).body).toMatchObject({ status: 'QUEUED', attempts: 1 });
    expect((await as(ana).get(`/patients/${patient.id}/voice`)).body).toMatchObject({ progress: { ready: 1, total: 3 }, generating: true });

    // After the wait, the retry finishes what was missing.
    const later = new Date(Date.now() + 60_000);
    while (await t.app.get(JobsWorker).runOnce(later, voiceTypes));
    spy.mockRestore();
    expect((await as(ana).get(`/jobs/${first.body.jobId}`)).body).toMatchObject({ status: 'DONE', attempts: 2, downloadUrl: null });
    expect((await as(ana).get(`/patients/${patient.id}/voice`)).body).toMatchObject({ missing: 0, generating: false, jobId: null });
  });

  it('stores each cloned-voice audio without the edge silence', async () => {
    const word = padded('mp3');
    const spy = jest.spyOn(t.synthesizer, 'synthesize').mockResolvedValue(word);
    await create(consent);
    await drainVoice();
    await generate();
    spy.mockRestore();
    const clips = await t.prisma.voiceClip.findMany({ select: { path: true } }); // the database is emptied on each test; the bucket is not
    expect(clips).toHaveLength(3);
    expect(seconds(word, 'mp3')).toBeGreaterThan(1.5);
    for (const { path } of clips) expect(seconds(t.memoryStorage!.files.get(path)!, 'mp3')).toBeLessThan(0.9);
  });

  it('requests again the word that comes out bad (too many seconds or nearly silent) and leaves all at the same volume', async () => {
    const spy = jest
      .spyOn(t.synthesizer, 'synthesize')
      .mockResolvedValueOnce(padded('mp3', 5)) // first word: 5 s of «palabra» (mumbling)
      .mockResolvedValueOnce(padded('mp3', 0.6, -30)) // the same: barely audible
      .mockResolvedValueOnce(padded('mp3', 0.6, -12)) // the same: fine, but quiet
      .mockResolvedValue(padded('mp3', 0.6, 6)); // the other two: fine, but loud
    await create(consent);
    await drainVoice();
    await generate();
    expect(spy).toHaveBeenCalledTimes(5); // the first three times, the others once
    spy.mockRestore();
    const clips = await t.prisma.voiceClip.findMany({ select: { path: true } });
    expect(clips).toHaveLength(3);
    const levels = clips.map(({ path }) => meanDb(t.memoryStorage!.files.get(path)!, 'mp3'));
    for (const db of levels) expect(Math.abs(db - -20)).toBeLessThan(2.5); // parejas alrededor de −20 dB
  });

  it('if a word comes out bad three times it is left without audio (system voice) and the generation finishes anyway', async () => {
    const spy = jest
      .spyOn(t.synthesizer, 'synthesize')
      .mockImplementation((_voice, text) => Promise.resolve(padded('mp3', text === 'agua' ? 6 : 0.6)));
    await create(consent);
    await drainVoice();
    await generate();
    spy.mockRestore();
    expect((await as(ana).get(`/patients/${patient.id}/voice`)).body).toMatchObject({
      progress: { ready: 2, total: 3 },
      missing: 1,
      generating: false,
    });
    expect(await t.prisma.job.count({ where: { type: 'VOICE_CLIPS', status: 'DONE' } })).toBe(1);
  });

  it('with the service down the voice becomes FAILED and nothing is lost', async () => {
    t.synthesizer.down = true;
    await create(consent);
    await drainVoice();
    expect((await as(ana).post(`/patients/${patient.id}/voice/generate`)).body.error).toBe('VoiceNotReady');
    expect((await as(ana).get(`/patients/${patient.id}/voice`)).body).toMatchObject({ status: 'FAILED', error: 'servicio caído' });
  });
});
