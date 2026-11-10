import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';
import { currentInstitution } from '../../../tenancy/tenancy';
import { toLiveView } from '../../application/live-view';
import { liveStatus } from '../../domain/live';
import { LiveFeed, LiveRead } from '../../domain/ports/sync.repository';

const send = (client: WebSocket, message: Record<string, unknown>) =>
  client.readyState === client.OPEN && client.send(JSON.stringify(message));

// Live delivery (spec 106 FR-005/006): who watches which patient, who watches presence and which tablets are connected.
// ponytail: in memory, fine with a single API instance; with several, Redis pub/sub (agreed: Redis for delivery).
@Injectable()
export class InMemoryLiveFeed extends LiveFeed {
  private readonly watchers = new Map<string, Set<WebSocket>>();
  // No therapistId: the admin sees everyone in their institution (spec 113 FR-010).
  private readonly presence = new Map<WebSocket, { institutionId: string; therapistId?: string }>();
  private readonly tablets = new Map<WebSocket, string>(); // socket → tablet

  constructor(private readonly read: LiveRead) {
    super();
  }

  watch(patientId: string, client: WebSocket) {
    this.watchers.set(patientId, (this.watchers.get(patientId) ?? new Set()).add(client));
  }

  watchPresence(client: WebSocket, viewer: { institutionId: string; therapistId?: string }) {
    this.presence.set(client, viewer);
  }

  async connectTablet(client: WebSocket, deviceId: string) {
    this.tablets.set(client, deviceId);
    await this.statusChanged(await this.read.openOnDevice(deviceId));
  }

  async forget(client: WebSocket) {
    for (const clients of this.watchers.values()) clients.delete(client);
    this.presence.delete(client);
    const deviceId = this.tablets.get(client);
    if (!deviceId) return;
    this.tablets.delete(client);
    await this.statusChanged(await this.read.openOnDevice(deviceId)); // the tablet left: its patients become away
  }

  tabletConnected(deviceId: string) {
    return [...this.tablets.values()].includes(deviceId);
  }

  publish(patientId: string, message: Record<string, unknown>) {
    for (const client of this.watchers.get(patientId) ?? []) send(client, message);
  }

  // Runs inside the institution of whoever changed the status: only those watching that institution receive it.
  async statusChanged(patientIds: string[]) {
    if (patientIds.length === 0 || (this.presence.size === 0 && this.watchers.size === 0)) return;
    const institutionId = currentInstitution();
    const viewers = [...this.presence].filter(([, viewer]) => viewer.institutionId === institutionId);
    for (const patient of await this.read.byIds(patientIds)) {
      const message = {
        type: 'status',
        ...toLiveView(patient, liveStatus(patient, !!patient.session && this.tabletConnected(patient.session.deviceId))),
      };
      this.publish(patient.patientId, message);
      const assigned = viewers.some(([, v]) => v.therapistId) ? await this.read.assignedTherapists(patient.patientId) : [];
      for (const [client, viewer] of viewers) if (!viewer.therapistId || assigned.includes(viewer.therapistId)) send(client, message);
    }
  }
}
