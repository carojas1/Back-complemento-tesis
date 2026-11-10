import { Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import { httpClient } from '../../../common/http/http-client';
import { VoiceSynthesizer } from '../../domain/ports/voices.repository';
import { cloneVoiceApi } from './clone-voice.endpoints';

type Event = { tipo: string; mp3?: string; archivo?: string; mensaje?: string };

const clone = httpClient(cloneVoiceApi.baseUrl, 60_000);
// The detail the service returns (or the network error) for the FAILED voice's message.
const detail = (e: unknown) =>
  e instanceof AxiosError ? `${e.response?.status ?? e.code}: ${JSON.stringify(e.response?.data ?? e.message)}` : String(e);

// Local `Clonar-voz` service (~/Documents/tesis/Clonar-voz: FastAPI + Qwen3-TTS with llama.cpp, MIT, no cloud).
// Register: POST /api/voces (audio + name + optional transcript). Speak: POST /api/generar → SSE events until
// `fin` → GET /api/salidas/<mp3>.
@Injectable()
export class CloneVoiceSynthesizer extends VoiceSynthesizer {
  async register(sample: Buffer, fileName: string, name: string, transcript?: string | null) {
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(sample)]), fileName);
    form.append('nombre', name);
    if (transcript) form.append('transcripcion', transcript);
    const voice = await clone.post<{ id: string }>(cloneVoiceApi.voices, form, { timeout: 120_000 }).catch((e: unknown) => {
      throw new Error(`El servicio de voz rechazó la muestra (${detail(e)})`);
    });
    return voice.id;
  }

  async synthesize(engineVoiceId: string, text: string) {
    const { id, archivo } = await clone
      .post<{ id: string; archivo: string }>(cloneVoiceApi.generate, { texto: text, voz: engineVoiceId, idioma: 'es' }, { timeout: 30_000 })
      .catch((e: unknown) => {
        throw new Error(`El servicio de voz no generó "${text}" (${detail(e)})`);
      });

    // A word on CPU takes tens of seconds: the final event is awaited for up to 5 minutes.
    const stream = await clone.get<string>(cloneVoiceApi.taskEvents(id), { timeout: 300_000, responseType: 'text' });
    const events = stream
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as Event);
    const end = events.find((e) => ['fin', 'error', 'cancelada'].includes(e.tipo));
    if (end?.tipo !== 'fin') throw new Error(end?.mensaje ?? `La síntesis de "${text}" no terminó`);

    const audio = await clone
      .get<ArrayBuffer>(cloneVoiceApi.output(end.mp3 || end.archivo || archivo), { responseType: 'arraybuffer' })
      .catch(() => {
        throw new Error(`No se pudo descargar el audio de "${text}"`);
      });
    await clone.delete(cloneVoiceApi.output(archivo)).catch(() => undefined); // cleans up the service's history
    return Buffer.from(audio);
  }
}
