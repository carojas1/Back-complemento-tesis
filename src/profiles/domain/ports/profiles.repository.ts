import { Page, PageRequest } from '../../../common/pagination/page';
import { Pictogram } from '../../../pictograms/domain/entities/pictogram.entity';
import { Profile } from '../entities/profile.entity';

// A patient's board: its categories (copied from the catalog) with their pictograms in order.
export interface BoardPictogram {
  id: string; // pictogram id in the profile (to hide it)
  pictogram: Pictogram;
  sortOrder: number;
  hidden: boolean;
  usage: { useCount: number; daysUsed: number; lastUsedAt: Date | null }; // spec 105 FR-008
  recordingPath: string | null; // the therapist's recording (spec 010)
  clipPath: string | null; // cloned voice audio, if it exists and matches the current label
}
export interface BoardCategory {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  pictograms: BoardPictogram[];
}
export interface ProfileBoard {
  profile: Profile;
  patientCode: string;
  avatarPath: string;
  voiceStatus: 'NONE' | 'PENDING' | 'READY' | 'FAILED'; // the patient's cloned voice (spec 010)
  categories: BoardCategory[];
}

export type AddResult = 'added' | 'missing' | 'duplicate';

export abstract class ProfilesRepository {
  // Copies the active catalog (categories with active pictograms) into the patient's new profile.
  abstract createFromTemplate(patientId: string): Promise<void>;
  abstract findByPatient(patientId: string): Promise<Profile | null>;
  abstract findBoard(patientId: string): Promise<ProfileBoard | null>;
  // Saving any change bumps the global version, so GET /sync/profiles?since= delivers it.
  abstract saveSettings(profile: Profile): Promise<void>;
  abstract setPictogramHidden(profile: Profile, boardPictogramId: string, hidden: boolean): Promise<boolean>;
  abstract touch(patientId: string): Promise<void>;
  abstract voiceReady(patientId: string): Promise<boolean>;
  // Board editing (spec 105 FR-009): a copy of the catalog; never touches the Center's catalog.
  abstract addCategory(profileId: string, categoryId: string): Promise<AddResult>;
  abstract removeCategory(profileId: string, profileCategoryId: string): Promise<boolean>;
  abstract addPictogram(profileId: string, profileCategoryId: string, pictogramId: string): Promise<AddResult>;
  // Reorder (spec 105, drag in the editor): the list must contain exactly the current ids; the array order is the order.
  abstract orderCategories(profileId: string, profileCategoryIds: string[]): Promise<boolean>;
  abstract orderPictograms(profileId: string, profileCategoryId: string, boardPictogramIds: string[]): Promise<boolean>;
  abstract removePictogram(profileId: string, boardPictogramId: string): Promise<{ recordingPath: string | null } | null>; // null: not found
  abstract setRecording(profileId: string, boardPictogramId: string, path: string | null): Promise<{ previous: string | null } | null>;
  // For the tablet (spec 106): profiles of active patients changed after `since`.
  abstract listBoardsChangedSince(since: number, page: PageRequest, upTo: number): Promise<Page<ProfileBoard>>;
  abstract dischargedCodesSince(since: number): Promise<string[]>;
  // Patients deleted (spec 110) after `since`: the tablet deletes their profile.
  abstract retiredCodesSince(since: number): Promise<string[]>;
  abstract currentVersion(): Promise<number>;
}

// The therapist has the patient assigned (TherapistPatient). Own port so as not to depend on the patients module.
export abstract class PatientAccess {
  abstract isAssigned(patientId: string, therapistId: string): Promise<boolean>;
}

// Converts the therapist's recording to m4a (spec 105 FR-004): the app already records m4a, but the browser records webm or
// ogg. Returns the m4a and its duration, or null if the file is not readable audio.
export abstract class AudioConverter {
  abstract toM4a(audio: Buffer): Promise<{ audio: Buffer; seconds: number } | null>;
}
