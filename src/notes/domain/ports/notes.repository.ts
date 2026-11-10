import { Page, PageRequest } from '../../../common/pagination/page';
import { GoalStatus, Note } from '../entities/note.entity';

export interface NoteRow extends Note {
  authorName: string;
}

export interface GoalRow {
  id: string;
  patientId: string;
  authorName: string;
  text: string;
  targetDate: Date | null;
  status: GoalStatus;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class NotesRepository {
  abstract listNotes(patientId: string, period: { from?: Date; to?: Date }, page: PageRequest): Promise<Page<NoteRow>>;
  abstract findNote(id: string): Promise<Note | null>;
  abstract saveNote(note: Note): Promise<void>;
  abstract sessionOfPatient(sessionId: string, patientId: string): Promise<boolean>;
  abstract listGoals(patientId: string, page: PageRequest): Promise<Page<GoalRow>>;
  abstract findGoal(id: string): Promise<{ id: string; patientId: string } | null>;
  abstract createGoal(goal: { patientId: string; authorId: string; text: string; targetDate: Date | null }): Promise<string>;
  abstract updateGoal(id: string, changes: { status?: GoalStatus; text?: string; targetDate?: Date | null }): Promise<void>;
  abstract patientCode(patientId: string): Promise<string | undefined>;
}
