import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { RoomNameTaken, RoomNotFound } from '../domain/exceptions/center.exceptions';
import { CenterRepository } from '../domain/ports/center.repository';

// A room in use is deactivated, never deleted: its past appointments keep counting for occupancy.
@Injectable()
export class UpdateRoomUseCase {
  constructor(
    private readonly repo: CenterRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(id: string, changes: { name?: string; active?: boolean }, actor: { id: string; ip?: string }) {
    const room = await this.repo.updateRoom(id, changes);
    if (room === undefined) throw new RoomNotFound();
    if (room === null) throw new RoomNameTaken();
    await this.audit.record({
      action: 'CENTER_ROOM_CHANGE',
      actorType: 'USER',
      actorId: actor.id,
      entity: 'Room',
      entityId: id,
      ip: actor.ip,
      summary: changes,
    });
    return room;
  }
}
