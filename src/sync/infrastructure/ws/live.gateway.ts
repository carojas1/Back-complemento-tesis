import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { RawData, WebSocket } from 'ws';
import { Role } from '../../../auth/domain/entities/user.entity';
import { AuthAuditLog } from '../../../auth/domain/ports/auth-notifications.ports';
import { TokenService } from '../../../auth/domain/ports/security.ports';
import { GetAuthenticatedUserUseCase } from '../../../auth/application/get-authenticated-user.use-case';
import { DomainException } from '../../../common/exceptions/base.exception';
import { AuthenticateDeviceUseCase } from '../../../devices/application/authenticate-device.use-case';
import { DevicesRepository } from '../../../devices/domain/ports/devices.repository';
import { PatientAccess } from '../../../profiles/domain/ports/profiles.repository';
import { inInstitution } from '../../../tenancy/tenancy';
import { ListLivePatientsUseCase } from '../../application/list-live-patients.use-case';
import { toLiveView } from '../../application/live-view';
import { ProcessBatchUseCase } from '../../application/process-batch.use-case';
import { liveStatus } from '../../domain/live';
import { LiveRead } from '../../domain/ports/sync.repository';
import { SyncBatchDto } from '../http/sync.dto';
import { InMemoryLiveFeed } from './in-memory-live-feed';

type Message = { type?: string; id?: string; patientId?: string };

// WebSocket /ws (spec 106, agreed 2026-10-21/23).
// - The tablet connects with the @DeviceAuth headers (signature of `GET\n/ws\ntimestamp`) and sends { type: 'batch' };
//   the ack goes out after writing to PostgreSQL. Without an ack, the tablet resends it via POST /sync/batch.
// - Staff connect with ?token=<JWT>. { type: 'presence' }: list with each patient's status and its changes
//   (therapist: assigned; admin: all). { type: 'watch', patientId } (assigned therapist only): what already happened in the
//   open session and then every event, response and status change (spec 106 FR-005/006).
// The WebSocket does not go through the HTTP interceptor: each message and the close run inside the institution of the account or of
// the tablet (spec 113 FR-010).
// A batch is small JSON; anything far larger is not a tablet.
@WebSocketGateway({ path: '/ws', maxPayload: 2 * 1024 * 1024 })
export class LiveGateway implements OnGatewayConnection {
  private readonly logger = new Logger(LiveGateway.name);
  private readonly appKey: Buffer;

  constructor(
    private readonly authenticateDevice: AuthenticateDeviceUseCase,
    private readonly devices: DevicesRepository,
    private readonly tokens: TokenService,
    private readonly getUser: GetAuthenticatedUserUseCase,
    private readonly access: PatientAccess,
    private readonly processBatch: ProcessBatchUseCase,
    private readonly live: InMemoryLiveFeed,
    private readonly read: LiveRead,
    private readonly listLive: ListLivePatientsUseCase,
    private readonly audit: AuthAuditLog,
    config: ConfigService,
  ) {
    this.appKey = Buffer.from(config.getOrThrow<string>('APP_KEY'));
  }

  async handleConnection(client: WebSocket, request: IncomingMessage) {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const header = (name: string) => request.headers[name] as string | undefined;
    try {
      const staffToken = url.searchParams.get('token');
      if (staffToken) {
        const claims = this.tokens.verifyAccessToken(staffToken);
        if (claims?.role !== Role.THERAPIST && claims?.role !== Role.ADMIN) throw new Error('token');
        const user = await this.getUser.execute(claims.sub);
        if (user.mustChangePassword) throw new Error('password');
        const institutionId = user.institutionId!;
        const viewer = { userId: user.id, isAdmin: claims.role === Role.ADMIN, institutionId };
        // The connection lives as long as its token: someone deactivated stops receiving when it expires, at most 15 minutes later.
        const expiry = setTimeout(() => client.close(4401, 'token expired'), Math.max(0, (claims.exp ?? 0) * 1000 - Date.now()));
        client.on('message', (raw) => this.run(institutionId, () => this.onStaff(client, viewer, raw)));
        client.on('close', () => {
          clearTimeout(expiry);
          void this.run(institutionId, () => this.live.forget(client));
        });
      } else {
        const sentKey = Buffer.from(header('x-app-key') ?? '');
        if (sentKey.length !== this.appKey.length || !timingSafeEqual(sentKey, this.appKey)) throw new Error('app key');
        const authorization = header('authorization');
        const device = await this.authenticateDevice.execute({
          token: authorization?.startsWith('Device ') ? authorization.slice(7) : undefined,
          timestamp: header('x-device-timestamp'),
          signature: header('x-device-signature'),
          method: 'GET',
          path: url.pathname,
        });
        const institutionId = device.institutionId;
        client.on('message', (raw) => this.run(institutionId, () => this.onBatch(client, device.id, raw)));
        client.on('close', () => this.run(institutionId, () => this.live.forget(client)));
        // Their patients with an open session become "online".
        await inInstitution(institutionId, () => this.live.connectTablet(client, device.id));
      }
      client.send(JSON.stringify({ type: 'ready' }));
    } catch {
      client.close(4401, 'No autorizado');
    }
  }

  // What an event on the socket triggers runs in the connection's institution. An error there (database down on close)
  // is only logged: without the catch it would be an unhandled rejection and Node would take the API down.
  private run(institutionId: string, fn: () => Promise<unknown>) {
    inInstitution(institutionId, fn).catch((e: unknown) => this.logger.warn(`WebSocket: ${e instanceof Error ? e.message : String(e)}`));
  }

  private async onBatch(client: WebSocket, deviceId: string, raw: RawData) {
    // A tablet is checked at connection, and a disabled one must stop here too, not when its socket happens to close.
    const device = await this.devices.findDeviceById(deviceId);
    if (!device || device.isRevoked()) return client.close(4401, 'No autorizado');
    const message = parse(raw);
    if (message?.type !== 'batch') return send(client, { type: 'error', id: message?.id, error: 'UnknownMessage' });
    const batch = plainToInstance(SyncBatchDto, message);
    const errors = await validate(batch, { whitelist: true });
    if (errors.length > 0) return send(client, { type: 'error', id: message.id, error: 'ValidationError' });
    try {
      send(client, { type: 'ack', id: message.id, ...(await this.processBatch.execute({ deviceId }, batch)) });
    } catch (e) {
      send(client, { type: 'error', id: message.id, error: e instanceof DomainException ? e.errorCode : 'InternalServerError' });
    }
  }

  private async onStaff(client: WebSocket, viewer: { userId: string; isAdmin: boolean; institutionId: string }, raw: RawData) {
    const { userId, isAdmin, institutionId } = viewer;
    const message = parse(raw);
    // Every request checks the account again: a deactivated person is refused here, whatever their token says.
    const account = await this.getUser.execute(userId).catch(() => null);
    if (!account?.active) return client.close(4403, 'inactive');
    if (message?.type === 'presence') {
      const page = await this.listLive.execute({ userId, isAdmin }, { page: 1, limit: 100 });
      this.live.watchPresence(client, isAdmin ? { institutionId } : { institutionId, therapistId: userId });
      return send(client, { type: 'presence', patients: page.items, total: page.total });
    }
    if (message?.type !== 'watch' || !message.patientId || isAdmin) return send(client, { type: 'error', error: 'UnknownMessage' });
    const therapistId = userId;
    if (!(await this.access.isAssigned(message.patientId, therapistId)))
      return send(client, { type: 'error', error: 'PatientNotAssigned' });
    this.live.watch(message.patientId, client);
    // Opening a patient's live view is audited (agreed 2026-10-21).
    await this.audit.record({
      action: 'LIVE_WATCH',
      actorType: 'USER',
      actorId: therapistId,
      entity: 'Patient',
      entityId: message.patientId,
    });
    // What already happened in the open session, so the web does not start blank.
    const [patient] = await this.read.byIds([message.patientId]);
    const log = patient?.session ? await this.read.sessionLog(patient.session.id) : { events: [], results: [] };
    const status = patient ? liveStatus(patient, !!patient.session && this.live.tabletConnected(patient.session.deviceId)) : 'OFFLINE';
    send(client, { ...(patient ? toLiveView(patient, status) : { patientId: message.patientId, status }), type: 'watching', ...log });
  }
}

const parse = (raw: RawData): Message | null => {
  try {
    return JSON.parse((raw as Buffer).toString()) as Message; // text messages arrive as Buffer
  } catch {
    return null;
  }
};
const send = (client: WebSocket, message: Record<string, unknown>) => client.send(JSON.stringify(message));
