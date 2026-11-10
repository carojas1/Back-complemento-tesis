import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import { AudioConverter } from '../../domain/ports/profiles.repository';

const run = promisify(execFile);
const isM4a = (bytes: Buffer) => bytes.length > 12 && bytes.subarray(4, 8).toString() === 'ftyp';

// system ffmpeg (`FFMPEG_PATH`/`FFPROBE_PATH`, on the PATH by default): runs in another process, does not block the API.
// The app's m4a is stored as is; anything else is converted to 22 kHz mono AAC at 64 kbps, as the app records (spec 010
// FR-001). The duration is measured on the final m4a: the browser's webm does not carry it in the header.
@Injectable()
export class FfmpegAudioConverter extends AudioConverter {
  private readonly ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
  private readonly ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe';

  async toM4a(audio: Buffer) {
    const dir = await mkdtemp(join(tmpdir(), 'grabacion-'));
    try {
      const input = join(dir, 'entrada');
      const output = join(dir, 'salida.m4a');
      await writeFile(input, audio);
      const target = isM4a(audio) ? input : output;
      if (target === output) {
        const args = ['-v', 'error', '-i', input, '-vn', '-ac', '1', '-ar', '22050', '-c:a', 'aac', '-b:a', '64k', '-f', 'mp4', output];
        await run(this.ffmpeg, args, { timeout: 15_000 });
      }
      const probe = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', target];
      const seconds = Number((await run(this.ffprobe, probe, { timeout: 15_000 })).stdout.trim());
      if (!Number.isFinite(seconds)) return null;
      return { audio: target === output ? await readFile(output) : audio, seconds };
    } catch {
      return null; // ffmpeg could not read it: it is not audio
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
