// Routes of the local `Clonar-voz` service (FastAPI): voices, synthesis with its SSE events and the generated audios.
export const cloneVoiceApi = {
  baseUrl: process.env.VOICE_CLONE_URL ?? 'http://127.0.0.1:8080',
  voices: '/api/voces',
  generate: '/api/generar',
  taskEvents: (taskId: string) => `/api/tarea/${taskId}/eventos`,
  output: (file: string) => `/api/salidas/${file}`,
};
