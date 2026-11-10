import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ProfilesModule } from '../profiles/profiles.module';
import { HomeworkUseCases } from './application/homework.use-cases';
import { HomeworkRepository } from './domain/ports/homework.repository';
import { HomeworkController } from './infrastructure/http/homework.controller';
import { HomeworkPrismaRepository } from './infrastructure/prisma/homework.prisma.repository';

// Spec 112: home review homework. Exports the repository: family mode reads them and marks them done.
@Module({
  imports: [AuthModule, ProfilesModule],
  controllers: [HomeworkController],
  providers: [{ provide: HomeworkRepository, useClass: HomeworkPrismaRepository }, HomeworkUseCases],
  exports: [HomeworkRepository],
})
export class HomeworkModule {}
