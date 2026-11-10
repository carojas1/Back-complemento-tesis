-- La voz clonada pasa a la cola de trabajos: registrar la voz base y generar los audios del tablero.
ALTER TYPE "JobType" ADD VALUE 'VOICE_REGISTER';
ALTER TYPE "JobType" ADD VALUE 'VOICE_CLIPS';
