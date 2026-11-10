import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { RoomNameTaken } from '../domain/exceptions/center.exceptions';
import { CenterRepository } from '../domain/ports/center.repository';

@Injectable()
export class CreateRoomUseCase {
  constructor(
    private readonly repo: CenterRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(name: string, actor: { id: string; ip?: string }) {
    const room = await this.repo.createRoom(name);
    if (!room) throw new RoomNameTaken();
    await this.audit.record({
      action: 'CENTER_ROOM_CHANGE',
      actorType: 'USER',
      actorId: actor.id,
      entity: 'Room',
      entityId: room.id,
      ip: actor.ip,
      summary: { name },
    });
    return room;
  }
}
