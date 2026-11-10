import { Injectable } from '@nestjs/common';
import { FileStorage } from '../../common/storage/file-storage';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { liveStatus } from '../domain/live';
import { LiveFeed, LiveRead } from '../domain/ports/sync.repository';
import { toLiveView } from './live-view';

// Spec 106 FR-005: list of patients with their live status (therapist: her assigned ones; admin: all active ones).
@Injectable()
export class ListLivePatientsUseCase {
  constructor(
    private readonly read: LiveRead,
    private readonly live: LiveFeed,
    private readonly storage: FileStorage,
  ) {}

  async execute(viewer: { userId: string; isAdmin: boolean }, page: PageRequest) {
    const patients = await this.read.patients(viewer.isAdmin ? {} : { therapistId: viewer.userId }, page);
    return mapPage(patients, async (p) =>
      toLiveView(
        p,
        liveStatus(p, !!p.session && this.live.tabletConnected(p.session.deviceId)),
        await this.storage.signedUrl(p.avatarPath),
      ),
    );
  }
}
