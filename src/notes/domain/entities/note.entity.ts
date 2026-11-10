import { DomainException } from '../../../common/exceptions/base.exception';

export class NoteLocked extends DomainException {
  constructor() {
    super('FORBIDDEN', 'NoteLocked', 'Solo la autora puede editar su observación, y solo durante 24 horas');
  }
}

const day = 24 * 60 * 60_000;

// Clinical observation about the patient or a session (spec 108). It is not deleted; its author edits it for 24 h.
export interface NoteProps {
  id: string;
  patientId: string;
  sessionId: string | null;
  authorId: string;
  text: string;
  // The guardian sees it (spec 112 FR-004).
  sharedWithFamily: boolean;
  createdAt: Date;
  editedAt: Date | null;
}

export interface Note extends Readonly<NoteProps> {}
export class Note {
  private constructor(props: NoteProps) {
    Object.assign(this, props);
  }

  static create(props: Omit<NoteProps, 'createdAt' | 'editedAt' | 'sharedWithFamily'> & { sharedWithFamily?: boolean }) {
    return new Note({ ...props, sharedWithFamily: props.sharedWithFamily ?? false, createdAt: new Date(), editedAt: null });
  }

  static reconstitute(props: NoteProps) {
    return new Note(props);
  }

  editableBy(userId: string, now = new Date()) {
    return userId === this.authorId && now.getTime() - this.createdAt.getTime() < day;
  }

  // Returns the previous text (FR-001: it stays in the audit).
  edit(userId: string, text: string) {
    if (!this.editableBy(userId)) throw new NoteLocked();
    const previous = this.text;
    Object.assign(this, { text, editedAt: new Date() });
    return previous;
  }

  // Sharing with the family does not change the text: any assigned therapist can do it, without the 24 h rule (spec 112).
  share(shared: boolean) {
    Object.assign(this, { sharedWithFamily: shared });
  }
}

// Therapeutic goal: In progress → Achieved or Suspended (any assigned therapist can change it, agreed 2026-10-21).
export const goalStatuses = ['IN_PROGRESS', 'ACHIEVED', 'SUSPENDED'] as const;
export type GoalStatus = (typeof goalStatuses)[number];
