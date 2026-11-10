// The audio of a board word (spec 010, agreed 2026-10-25), ready to be chained into a phrase: without the
// silence at the edges (the cloned voice carries ~0.4 s on each side and recordings, however long the therapist takes to
// start speaking) and at the same volume as the others, so no word sounds quieter. `loudestDb` is the loudest part of the
// audio before leveling it (in 0.1 s windows): it tells whether a voice is heard or it is nearly silence.
export type WordAudioResult = { audio: Buffer; seconds: number; loudestDb: number };

// A word is good if it lasts as long as a word does and can be heard (measured on real cloned-voice audio: the good ones
// last 0.3 to 1.5 s and reach −30 dB or more; the failed ones, seconds of murmur or near silence).
export const wordRules = { maxSeconds: 3, minLoudestDb: -35 };
export const isGoodWord = (word: WordAudioResult) => word.seconds <= wordRules.maxSeconds && word.loudestDb >= wordRules.minLoudestDb;

export abstract class WordAudio {
  // If there is nothing to change it returns the same Buffer it received; null if it is not audio (or ffmpeg is missing).
  abstract prepare(audio: Buffer, format: 'mp3' | 'm4a'): Promise<WordAudioResult | null>;
}
