import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { inScope } from './tenancy';

type ScopedRequest = { user?: { institutionId: string | null }; device?: { institutionId: string } };

// Global: every HTTP request runs in its own context, with the institution the guards left (spec 113 FR-002). It is never
// read from the body, the query or a header. A public route starts with no institution: RLS lets it see nothing
// until the use case sets it (login, refresh, tablet registration).
@Injectable()
export class TenancyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<ScopedRequest>();
    const institutionId = req.user?.institutionId ?? req.device?.institutionId ?? null;
    // Subscribe inside the context: the handler and everything it awaits inherit the institution.
    return new Observable((subscriber) => inScope({ institutionId }, () => next.handle().subscribe(subscriber)));
  }
}
