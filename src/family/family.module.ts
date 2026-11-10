import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { HomeworkModule } from '../homework/homework.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SyncModule } from '../sync/sync.module';
import { FamilyUseCases } from './application/family.use-cases';
import { FamilyRead } from './domain/ports/family.read';
import { FamilyController } from './infrastructure/http/family.controller';
import { FamilyPrismaRead } from './infrastructure/prisma/family.prisma.read';

// Spec 112: guardians' family mode. Reuses the board (profiles), the session list (sessions),
// the homework (homework) and the tablet batch (sync).
@Module({
  imports: [AuthModule, ProfilesModule, SessionsModule, HomeworkModule, SyncModule],
  controllers: [FamilyController],
  providers: [{ provide: FamilyRead, useClass: FamilyPrismaRead }, FamilyUseCases],
})
export class FamilyModule {}
