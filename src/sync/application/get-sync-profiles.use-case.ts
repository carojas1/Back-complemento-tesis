import { Injectable } from '@nestjs/common';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { FileStorage } from '../../common/storage/file-storage';
import { toProfileView } from '../../profiles/application/profile-view';
import { ProfilesRepository } from '../../profiles/domain/ports/profiles.repository';

// GET /sync/profiles?since= (spec 106/003): profiles changed since the version the tablet has, the discharged ones
// and the current version. Only code, avatar and board: never names, dates or diagnosis (FR-001).
// Spec 110: removed ones arrive in `retiredPatientCodes` and also inside `dischargedPatientCodes`,
// so the app that already deletes discharged patients also removes them without changes.
@Injectable()
export class GetSyncProfilesUseCase {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(since: number, page: PageRequest) {
    // The version comes first and caps the page: a board saved while this runs waits for the next sync instead of being skipped.
    const version = await this.profiles.currentVersion();
    const [boards, discharged, retiredPatientCodes] = await Promise.all([
      this.profiles.listBoardsChangedSince(since, page, version),
      this.profiles.dischargedCodesSince(since),
      this.profiles.retiredCodesSince(since),
    ]);
    const dischargedPatientCodes = [...new Set([...discharged, ...retiredPatientCodes])];
    return {
      ...(await mapPage(boards, (board) => toProfileView(board, this.storage))),
      dischargedPatientCodes,
      retiredPatientCodes,
      version,
    };
  }
}
