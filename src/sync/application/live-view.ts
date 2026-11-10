import { LivePatient, LiveStatus } from '../domain/live';

// What the web sees for a live patient: code, status and the open session (no names or clinical data).
export const toLiveView = (p: LivePatient, status: LiveStatus, avatarUrl?: string) => ({
  patientId: p.patientId,
  code: p.code,
  ...(avatarUrl ? { avatarUrl } : {}),
  status,
  session: p.session && {
    id: p.session.id,
    startedAt: p.session.startedAt,
    lastEventAt: p.session.lastEventAt,
    therapistName: p.session.therapistName,
    deviceName: p.session.deviceName,
  },
});
