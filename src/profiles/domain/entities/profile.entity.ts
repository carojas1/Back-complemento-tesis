import { InvalidProfileSettings } from '../exceptions/profiles.exceptions';

// Settings of a patient's communication profile (spec 105, 010): what the tablet uses to draw the board.
export interface ProfileProps {
  id: string;
  patientId: string;
  gridSize: number; // 4, 6, 9 or 12 cells
  activityLevel: number; // 1 to 3 (2, 4 or 6 options in the activities)
  speechRate: number; // 0.5 to 1.5 (1 = normal)
  sentenceBarEnabled: boolean;
  activityPrompts: number; // prompts per activity, 5 to 20 (spec 105 FR-010)
  activityRepeatSeconds: number; // seconds without an answer before repeating the word, 5 to 60
  activityTypes: string[]; // activity types offered (today only `identify`); empty = no activities
  voice: string; // SYSTEM or CLONED (spec 010)
  version: number; // bumps with every change: the tablet knows it must download it
}

export const activityTypes = ['identify']; // spec 007
export const voices = ['SYSTEM', 'CLONED'];
// Only these fields change via PATCH (anything else in the request is ignored).
const editable = [
  'gridSize',
  'activityLevel',
  'speechRate',
  'sentenceBarEnabled',
  'activityPrompts',
  'activityRepeatSeconds',
  'activityTypes',
  'voice',
] as const;
export type ProfileChanges = Partial<Pick<ProfileProps, (typeof editable)[number]>>;
const between = (value: number | undefined, min: number, max: number) => value === undefined || (value >= min && value <= max);

export interface Profile extends Readonly<ProfileProps> {}
export class Profile {
  private constructor(props: ProfileProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: ProfileProps) {
    return new Profile(props);
  }

  // Returns the fields that changed; if there were changes, bumps the version.
  edit(changes: ProfileChanges) {
    const valid =
      (changes.gridSize === undefined || [4, 6, 9, 12].includes(changes.gridSize)) &&
      (changes.activityLevel === undefined || [1, 2, 3].includes(changes.activityLevel)) &&
      between(changes.speechRate, 0.5, 1.5) &&
      between(changes.activityPrompts, 5, 20) &&
      between(changes.activityRepeatSeconds, 5, 60) &&
      (changes.activityTypes === undefined || changes.activityTypes.every((t) => activityTypes.includes(t))) &&
      (changes.voice === undefined || voices.includes(changes.voice));
    if (!valid) throw new InvalidProfileSettings();

    // Comparison by value (activityTypes is a list).
    const changed = editable.filter((key) => changes[key] !== undefined && JSON.stringify(changes[key]) !== JSON.stringify(this[key]));
    if (changed.length > 0)
      Object.assign(this, Object.fromEntries(changed.map((key) => [key, changes[key]])), { version: this.version + 1 });
    return changed;
  }

  // Any other board change (pictograms, categories, recordings, voice audio) also bumps the version.
  markChanged() {
    Object.assign(this, { version: this.version + 1 });
  }
}
