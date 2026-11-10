import { Page, PageRequest } from '../../../common/pagination/page';
import { CenterHoursEntry, Room } from '../entities/center.entity';

// Runs under RLS: everything stays inside the center of the request.
export abstract class CenterRepository {
  abstract listRooms(onlyActive: boolean, page: PageRequest): Promise<Page<Room>>;
  // null when the name is taken.
  abstract createRoom(name: string): Promise<Room | null>;
  // undefined when the room does not exist, null when the name is taken.
  abstract updateRoom(id: string, changes: { name?: string; active?: boolean }): Promise<Room | null | undefined>;
  abstract getHours(): Promise<CenterHoursEntry[]>;
  abstract replaceHours(hours: CenterHoursEntry[]): Promise<void>;
}
