import { DataRequestRow } from '../domain/ports/data-requests.repository';

// Response for a request: only the patient code, never their name (spec 109 FR-001); 15-day deadline (FR-002).
export function toDataRequestView({ request, patientId, handledByName }: DataRequestRow) {
  const { id, patientCode, type, status, requestedAt, respondedAt, handledBy, notes, statisticalUseAllowed } = request;
  return {
    id,
    patientCode,
    patientId,
    type,
    status,
    requestedAt,
    dueAt: request.dueAt(),
    deadline: request.deadline(),
    respondedAt,
    handledBy,
    handledByName,
    notes,
    statisticalUseAllowed,
  };
}
