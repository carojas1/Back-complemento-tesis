export abstract class AuthMailer {
  abstract sendPasswordReset(to: { email: string; name: string }, token: string): Promise<void>;
  // First admin of an approved institution (spec 113 FR-007): their temporary password.
  abstract sendInstitutionWelcome(to: { email: string; name: string }, institution: string, temporaryPassword: string): Promise<void>;
  // To whoever requested the account: the platform will contact them within 24 hours.
  abstract sendRequestReceived(to: { email: string; name: string }, institution: string): Promise<void>;
  // To each super admin: a new center awaits review.
  abstract sendNewRequestAlert(to: string[], institution: string, requestId: string): Promise<void>;
}

export type AuthAuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED'
  | 'TEMP_PASSWORD_SET'
  | 'PIN_SET'
  | 'PIN_CLEARED'
  | 'THERAPIST_PIN_OK'
  | 'THERAPIST_PIN_FAILED'
  | 'THERAPIST_PIN_REVOKED'
  | 'CATALOG_CREATE'
  | 'CATALOG_UPDATE'
  | 'CATALOG_DELETE'
  | 'PATIENT_CREATE'
  | 'PATIENT_READ'
  | 'PATIENT_UPDATE'
  | 'PATIENT_DISCHARGE'
  | 'PATIENT_REACTIVATE'
  | 'CONSENT_READ'
  | 'PROFILE_UPDATE'
  | 'VOICE_CREATE'
  | 'VOICE_DELETE'
  | 'SETTINGS_UPDATE' // spec 103 FR-008
  | 'CENTER_PIN_SET'
  | 'CENTER_LOGO_SET'
  | 'CENTER_LOGO_REMOVE'
  | 'AUDIT_EXPORT'
  | 'LIVE_WATCH'
  | 'SESSION_READ'
  | 'REPORT_EXPORT' // report PDF (spec 107 FR-003)
  | 'DATA_REQUEST_CREATE' // spec 110
  | 'DATA_EXPORT'
  | 'DATA_REQUEST_RECTIFY'
  | 'DATA_REQUEST_REJECT'
  | 'DATA_DELETION'
  | 'NOTE_CREATE'
  | 'NOTE_UPDATE'
  | 'GOAL_CREATE'
  | 'GOAL_UPDATE'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'PATIENTS_ASSIGNED'
  | 'CHILDREN_ASSIGNED' // spec 112: children of a guardian
  | 'DEVICE_CODE_CREATED'
  | 'DEVICE_REGISTERED'
  | 'DEVICE_REVOKED'
  | 'CATEGORY_CREATE'
  | 'CATEGORY_UPDATE'
  | 'CATEGORY_PICTOGRAMS_SET'
  | 'PICTOGRAM_CREATE'
  | 'PICTOGRAM_UPDATE'
  | 'NOTE_SHARE' // spec 112
  | 'HOMEWORK_CREATE'
  | 'HOMEWORK_UPDATE'
  | 'HOMEWORK_DELETE'
  | 'HOMEWORK_COMPLETE'
  | 'FAMILY_READ'
  | 'HOME_PRACTICE'
  | 'INSTITUTION_REQUEST_CREATE' // spec 113
  | 'INSTITUTION_REQUEST_READ'
  | 'INSTITUTION_APPROVE'
  | 'INSTITUTION_REJECT'
  | 'INSTITUTION_REQUEST_REVIEW' // platform administration
  | 'INSTITUTION_UPDATE'
  | 'INSTITUTION_SUSPEND'
  | 'INSTITUTION_REACTIVATE'
  | 'APPOINTMENT_CREATE' // schedule
  | 'APPOINTMENT_UPDATE'
  | 'APPOINTMENT_STATUS'
  | 'CENTER_ROOM_CHANGE' // center configuration
  | 'CENTER_HOURS_CHANGE'
  | 'TREATMENT_PLAN_CHANGE'
  | 'SUBSCRIPTION_PAYMENT' // annual plan
  | 'SUBSCRIPTION_CHANGE'
  | 'SUBSCRIPTION_CANCEL';

export interface AuthAuditEntry {
  action: AuthAuditAction;
  actorType: 'USER' | 'DEVICE' | 'SYSTEM';
  actorId?: string | null;
  // Affected record: a user by default, or `entity` + `entityId` (e.g. a tablet).
  userId?: string | null;
  entity?:
    | 'User'
    | 'Device'
    | 'Category'
    | 'Pictogram'
    | 'Avatar'
    | 'Diagnosis'
    | 'Condition'
    | 'Patient'
    | 'Profile'
    | 'Voice'
    | 'AuditLog'
    | 'Session'
    | 'Note'
    | 'Goal'
    | 'Homework'
    | 'DataRequest'
    | 'CenterSettings'
    | 'InstitutionRequest'
    | 'Institution'
    | 'Appointment'
    | 'Room'
    | 'CenterHours'
    | 'TreatmentPlan'
    | 'Subscription';
  // Patient code (never the name): allows filtering the audit by patient (spec 109 FR-001).
  patientCode?: string;
  entityId?: string | null;
  ip?: string | null;
  summary?: Record<string, unknown>;
}

// Spec 101 FR-005: sign-ins are recorded in the audit (spec 109).
export abstract class AuthAuditLog {
  abstract record(entry: AuthAuditEntry): Promise<void>;
}
