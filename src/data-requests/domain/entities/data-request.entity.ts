import { DataRequestClosed, DataRequestWrongType } from '../exceptions/data-requests.exceptions';

export type DataRequestType = 'ACCESS' | 'RECTIFICATION' | 'DELETION';
export type DataRequestStatus = 'OPEN' | 'DONE' | 'REJECTED';
// Deadline status of an open request (FR-002): overdue, due soon (≤ 3 days) or on time. null if already handled.
export type Deadline = 'OVERDUE' | 'DUE_SOON' | 'ON_TIME' | null;

const day = 24 * 60 * 60_000;
const responseDays = 15; // FR-002
const dueSoonDays = 3;

// Technical patient that keeps the anonymous sessions of deleted patients with authorized statistical use (plan 110).
export const anonymousPatientCode = 'ANONIMO';

export interface DataRequestProps {
  id: string;
  patientCode: string; // code, not an FK: the request survives the deletion (FR-001)
  type: DataRequestType;
  requestedAt: Date;
  respondedAt: Date | null;
  status: DataRequestStatus;
  handledBy: string | null;
  notes: string | null;
  statisticalUseAllowed: boolean | null; // DELETION only
}

// Spec 110: legal guardian's request (access, rectification or deletion) with its deadline and who handled it.
export interface DataRequest extends Readonly<DataRequestProps> {}
export class DataRequest {
  private constructor(props: DataRequestProps) {
    Object.assign(this, props);
  }

  static create(input: { id: string; patientCode: string; type: DataRequestType; notes?: string; statisticalUseAllowed?: boolean }) {
    return new DataRequest({
      id: input.id,
      patientCode: input.patientCode,
      type: input.type,
      requestedAt: new Date(),
      respondedAt: null,
      status: 'OPEN',
      handledBy: null,
      notes: input.notes?.trim() || null,
      statisticalUseAllowed: input.type === 'DELETION' ? (input.statisticalUseAllowed ?? false) : null,
    });
  }

  static reconstitute(props: DataRequestProps) {
    return new DataRequest(props);
  }

  dueAt() {
    return new Date(this.requestedAt.getTime() + responseDays * day);
  }

  deadline(now = new Date()): Deadline {
    if (this.status !== 'OPEN') return null;
    const left = this.dueAt().getTime() - now.getTime();
    return left < 0 ? 'OVERDUE' : left <= dueSoonDays * day ? 'DUE_SOON' : 'ON_TIME';
  }

  // An open request of the expected type; otherwise it cannot be handled this way.
  assertOpen(type?: DataRequestType) {
    if (type && this.type !== type) throw new DataRequestWrongType(type);
    if (this.status !== 'OPEN') throw new DataRequestClosed();
  }

  // Handled: the response (e.g. what was corrected) is added to the request notes.
  complete(handledBy: string, response?: string) {
    this.close('DONE', handledBy, response);
  }

  reject(handledBy: string, reason: string) {
    this.close('REJECTED', handledBy, reason);
  }

  private close(status: DataRequestStatus, handledBy: string, response?: string) {
    this.assertOpen();
    const text = response?.trim();
    const notes = text ? [this.notes, `Respuesta: ${text}`].filter(Boolean).join('\n') : this.notes;
    Object.assign(this, { status, handledBy, respondedAt: new Date(), notes });
  }
}
