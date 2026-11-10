// Spec 008: event types and the minimum each content carries. The API rejects anything else (FR-004, agreed 2026-10-21).
const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 200;
const count = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const optional = (check: (v: unknown) => boolean) => (v: unknown) => v === undefined || v === null || check(v);

const payloads: Record<string, (p: Record<string, unknown>) => boolean> = {
  session_started: (p) => count(p.profileVersion),
  session_ended: (p) => count(p.durationSec),
  pictogram_tapped: (p) => text(p.pictogramId) && text(p.word) && optional(text)(p.categoryId) && optional(count)(p.arasaacId),
  category_opened: (p) => text(p.categoryId),
  sentence_spoken: (p) => Array.isArray(p.words) && p.words.length <= 8 && p.words.every(text) && count(p.length),
  sentence_cleared: (p) => count(p.length),
  activity_started: (p) => text(p.runId) && text(p.type) && count(p.level),
  activity_finished: (p) => text(p.runId) && count(p.correct) && count(p.total) && typeof p.interrupted === 'boolean',
};

export const eventProblem = (type: string, payload: Record<string, unknown>) =>
  !payloads[type] ? 'UnknownEventType' : payloads[type](payload) ? null : 'InvalidEventPayload';
