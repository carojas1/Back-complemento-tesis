import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import { WordAudio } from './word-audio';

const run = promisify(execFile);

// −40 dB separates the voice (−18 to −40 dB) from the background noise of the cloned voice (−50 to −60 dB) without eating the end of the
// word. 40 ms remain before and 80 ms after so it does not sound cut off. The end is trimmed by reversing the audio.
const trim = [
  'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.04',
  'areverse',
  'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.08',
  'areverse',
].join(',');
// Measurement: the loudest part in 0.1 s windows (RMS), the average and the peak of the whole audio.
const measure =
  'aresample=24000,asetnsamples=n=2400,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level,volumedetect';
const encoders = { mp3: ['-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3'], m4a: ['-c:a', 'aac', '-b:a', '64k', '-f', 'mp4'] };
const level = { meanDb: -20, peakDb: -1.5 }; // even volume: the word's average, without the peak clipping
const minTrimSeconds = 0.1; // for less (or under 3 dB of volume, which is barely noticeable) it is not worth re-encoding
const minGainDb = 3;

// The system's ffmpeg (`FFMPEG_PATH`, on the PATH by default), in another process: it does not block the API or the worker. It encodes
// only once (trim and volume together) to avoid losing quality.
@Injectable()
export class FfmpegWordAudio extends WordAudio {
  private readonly ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';

  async prepare(audio: Buffer, format: 'mp3' | 'm4a') {
    const dir = await mkdtemp(join(tmpdir(), 'palabra-'));
    try {
      const input = join(dir, `entrada.${format}`);
      const output = join(dir, `salida.${format}`);
      await writeFile(input, audio);
      const before = await this.measure(input, '');
      const word = await this.measure(input, `${trim},`);
      if (!word.seconds) return { audio, seconds: before.seconds, loudestDb: -99 }; // everything was silence: no voice
      const gain = Math.min(level.meanDb - word.meanDb, level.peakDb - word.peakDb);
      const trimmed = before.seconds - word.seconds >= minTrimSeconds;
      if (!trimmed && Math.abs(gain) < minGainDb) return { audio, seconds: before.seconds, loudestDb: word.loudestDb };
      const filter = `${trimmed ? `${trim},` : ''}volume=${gain.toFixed(1)}dB`;
      const args = ['-nostdin', '-v', 'error', '-i', input, '-vn', '-af', filter, '-ac', '1', ...encoders[format], output];
      await run(this.ffmpeg, args, { timeout: 15_000 });
      return { audio: await readFile(output), seconds: word.seconds, loudestDb: word.loudestDb };
    } catch {
      return null; // not audio, or ffmpeg is missing
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  // Duration (the trailing `time=` line), the loudest part in 0.1 s, average and peak, after applying `pre` (the
  // trim, or nothing).
  private async measure(path: string, pre: string) {
    const args = ['-nostdin', '-hide_banner', '-i', path, '-af', `${pre}${measure}`, '-f', 'null', '-'];
    const { stderr } = await run(this.ffmpeg, args, { timeout: 15_000, maxBuffer: 10_000_000 });
    const rms = [...stderr.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => (m[1] === '-inf' ? -99 : Number(m[1])));
    const time = [...stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
    return {
      seconds: time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : 0,
      loudestDb: rms.length ? Math.max(...rms) : -99,
      meanDb: Number(/mean_volume: (-?[\d.]+)/.exec(stderr)?.[1] ?? -99),
      peakDb: Number(/max_volume: (-?[\d.]+)/.exec(stderr)?.[1] ?? -99),
    };
  }
}
