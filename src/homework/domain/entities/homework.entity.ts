import { DomainException } from '../../../common/exceptions/base.exception';

export class HomeworkNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'HomeworkNotFound', 'El deber no existe');
  }
}

export class HomeworkDone extends DomainException {
  constructor() {
    super('CONFLICT', 'HomeworkDone', 'El deber ya está hecho: no se puede cambiar ni borrar');
  }
}

export class InvalidHomeworkPictograms extends DomainException {
  constructor() {
    super('INVALID', 'InvalidHomeworkPictograms', 'Elija de 1 a 12 pictogramas del tablero del paciente');
  }
}

export interface HomeworkProps {
  id: string;
  patientId: string;
  authorId: string;
  instructions: string;
  dueDate: Date | null;
  withActivity: boolean;
  pictogramIds: string[];
  completedAt: Date | null;
  completedBy: string | null;
  createdAt: Date;
}

type Changes = Partial<Pick<HomeworkProps, 'instructions' | 'dueDate' | 'withActivity' | 'pictogramIds'>>;

const checkPictograms = (ids: string[]) => {
  if (ids.length < 1 || ids.length > 12 || new Set(ids).size !== ids.length) throw new InvalidHomeworkPictograms();
};

// Home review homework (spec 112 FR-005). The therapist changes or deletes it while it is not done; the guardian
// marks it done only once.
export interface Homework extends Readonly<HomeworkProps> {}
export class Homework {
  private constructor(props: HomeworkProps) {
    Object.assign(this, props);
  }

  static create(props: Omit<HomeworkProps, 'completedAt' | 'completedBy' | 'createdAt'>) {
    checkPictograms(props.pictogramIds);
    return new Homework({ ...props, completedAt: null, completedBy: null, createdAt: new Date() });
  }

  static reconstitute(props: HomeworkProps) {
    return new Homework(props);
  }

  change(changes: Changes) {
    this.assertOpen();
    if (changes.pictogramIds) checkPictograms(changes.pictogramIds);
    Object.assign(this, Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)));
  }

  assertOpen() {
    if (this.completedAt) throw new HomeworkDone();
  }

  // false if it was already done: marking it twice changes neither who nor when.
  complete(guardianId: string) {
    if (this.completedAt) return false;
    Object.assign(this, { completedAt: new Date(), completedBy: guardianId });
    return true;
  }
}
