import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException, ErrorKind } from '../exceptions/base.exception';

// Constitution format: { statusCode, error, message }.
interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  // DTO validation errors.
  details?: string[];
  // Outside production only.
  debug?: { internalMessage?: string; stack?: string };
  [extra: string]: unknown;
}

const statusByKind: Record<ErrorKind, number> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  INVALID: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  TOO_MANY_ATTEMPTS: HttpStatus.TOO_MANY_REQUESTS,
  TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
};

const errorByStatus: Record<number, string> = {
  400: 'BadRequest',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'NotFound',
  409: 'Conflict',
  413: 'PayloadTooLarge',
  429: 'TooManyRequests',
};

// No database (Neon down or a network blocking it): Prisma with the pg adapter brings the socket code
// (ETIMEDOUT…) or its own connection code (P1001…). It answers 503 so the tablet switches to its offline mode (spec 002 FR-008).
const databaseDown = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
]);
const codeOf = (e: Error) => (e as { code?: unknown }).code;
const isDatabaseDown = (e: Error) => e.name === 'PrismaClientInitializationError' || databaseDown.has(String(codeOf(e)));

// The API's only error translator. Registered once in main.ts.
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly isDevelopment = process.env.NODE_ENV !== 'production';

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const body = this.toResponse(exception, request);
    ctx.getResponse<Response>().status(body.statusCode).json(body);
  }

  private toResponse(exception: unknown, request: Request): ErrorResponse {
    if (exception instanceof DomainException) {
      this.logger.log(`[DOMAIN] ${exception.errorCode} ${request.method} ${request.path} | ${exception.message}`);
      const { kind, errorCode, safeMessage, extra } = exception;
      return { ...extra, statusCode: statusByKind[kind], error: errorCode, message: safeMessage ?? exception.message };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      const raw = typeof res === 'object' && res !== null ? (res as Record<string, unknown>).message : res;

      // ValidationPipe returns an array of messages.
      if (Array.isArray(raw)) {
        return { statusCode, error: 'ValidationError', message: 'Datos inválidos', details: raw.map(String) };
      }
      return { statusCode, error: errorByStatus[statusCode] ?? 'Error', message: typeof raw === 'string' ? raw : exception.message };
    }

    const error = exception instanceof Error ? exception : new Error(String(exception));
    if (isDatabaseDown(error)) {
      this.logger.warn(
        `[DATABASE] ${request.method} ${request.path} | ${typeof codeOf(error) === 'string' ? String(codeOf(error)) : error.name}`,
      );
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'DatabaseUnavailable',
        message: 'Sin conexión con la base de datos. Intente más tarde.',
      };
    }
    this.logger.error(`[UNHANDLED] ${request.method} ${request.path}`, error.stack);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'Error interno del servidor',
      ...(this.isDevelopment && { debug: { internalMessage: error.message, stack: error.stack } }),
    };
  }
}
