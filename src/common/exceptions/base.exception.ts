// Error type in business terms. The domain does not know HTTP:
// GlobalExceptionFilter is the only one that translates kind → status.
export type ErrorKind = 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'INVALID' | 'UNAUTHORIZED' | 'TOO_MANY_ATTEMPTS' | 'TOO_LARGE';

export abstract class DomainException extends Error {
  constructor(
    public readonly kind: ErrorKind,
    // Stable code for the client, e.g. `InvalidCredentials`.
    public readonly errorCode: string,
    // Internal message (log). May hold details the client must not see.
    message: string,
    // Message for the client. If missing, `message` is used.
    public readonly safeMessage?: string,
    // Data for the client besides the message (e.g. the institutions of `ChooseInstitution`).
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
