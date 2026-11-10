import { Injectable, Logger } from '@nestjs/common';
import { inInstitution } from '../../tenancy/tenancy';
import { PasswordReset } from '../domain/entities/password-reset.entity';
import { normalizeEmail } from '../domain/entities/user.entity';
import { AuthAuditLog, AuthMailer } from '../domain/ports/auth-notifications.ports';
import { AuthRepository } from '../domain/ports/auth.repository';
import { TokenService } from '../domain/ports/security.ports';

// Always ends the same way, whether or not the e-mail exists (does not reveal which accounts exist).
// One link per account: the same e-mail may have accounts in several institutions (spec 113 FR-008).
@Injectable()
export class ForgotPasswordUseCase {
  private readonly logger = new Logger(ForgotPasswordUseCase.name);

  constructor(
    private readonly repo: AuthRepository,
    private readonly tokens: TokenService,
    private readonly mailer: AuthMailer,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { email: string; ip?: string }): Promise<void> {
    for (const { user } of await this.repo.findAccountsByEmail(normalizeEmail(input.email))) {
      if (!user.canLogIn()) continue;
      const plain = this.tokens.generateOpaqueToken();
      await this.repo.savePasswordReset(PasswordReset.issue(user.id, this.tokens.hashOpaqueToken(plain), new Date()));
      // Not awaited: the time the mail server takes, or its failure, would tell who has an account.
      void this.mailer
        .sendPasswordReset({ email: user.email, name: user.name }, plain)
        .catch((e: unknown) => this.logger.warn(`Reset mail not sent: ${e instanceof Error ? e.message : 'error'}`));
      await inInstitution(user.institutionId, () =>
        this.audit.record({ action: 'PASSWORD_RESET_REQUESTED', actorType: 'USER', actorId: user.id, userId: user.id, ip: input.ip }),
      );
    }
  }
}
