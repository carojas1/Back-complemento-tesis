import { Page, PageRequest } from '../../../common/pagination/page';
import { Homework } from '../entities/homework.entity';

export type HomeworkStatus = 'pending' | 'done';

// A homework item with what the panel and family mode show: author, pictograms and what was practiced at home.
export interface HomeworkRow {
  id: string;
  patientId: string;
  instructions: string;
  dueDate: Date | null;
  withActivity: boolean;
  createdAt: Date;
  completedAt: Date | null;
  author: { id: string; name: string };
  completedBy: { name: string } | null;
  pictograms: { pictogramId: string; label: string; imagePath: string }[];
  practice: { sessions: number; lastAt: Date | null; correct: number; total: number };
}

export abstract class HomeworkRepository {
  abstract list(patientId: string, status: HomeworkStatus | undefined, page: PageRequest): Promise<Page<HomeworkRow>>;
  abstract row(id: string): Promise<HomeworkRow | null>;
  abstract find(id: string): Promise<Homework | null>;
  abstract save(homework: Homework): Promise<void>;
  abstract delete(id: string): Promise<void>;
  // Which of those pictograms are on the patient's board (a homework item only reviews their vocabulary).
  abstract boardPictogramIds(patientId: string, ids: string[]): Promise<string[]>;
  abstract patientCode(patientId: string): Promise<string | undefined>;
}
