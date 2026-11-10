// Live presence for the web (spec 106 FR-005): a patient's status comes from their open session and from whether the tablet
// that runs it is connected to the WebSocket.
export type LiveStatus = 'ONLINE' | 'AWAY' | 'OFFLINE';

export interface LiveSession {
  id: string;
  startedAt: Date;
  lastEventAt: Date | null;
  therapistName: string | null;
  deviceId: string;
  deviceName: string;
}

export interface LivePatient {
  patientId: string;
  code: string;
  avatarPath: string;
  session: LiveSession | null; // the open session (no end and with activity in the last 2 h), if any
}

const idle = 5 * 60_000; // more than 5 min without events: away

export function liveStatus(patient: LivePatient, tabletConnected: boolean, now = new Date()): LiveStatus {
  if (!patient.session) return 'OFFLINE';
  const last = (patient.session.lastEventAt ?? patient.session.startedAt).getTime();
  return tabletConnected && now.getTime() - last < idle ? 'ONLINE' : 'AWAY';
}
