import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ProfilesModule } from '../profiles/profiles.module';
import { NotesUseCases } from './application/notes.use-cases';
import { NotesRepository } from './domain/ports/notes.repository';
import { NotesController } from './infrastructure/http/notes.controller';
import { NotesPrismaRepository } from './infrastructure/prisma/notes.prisma.repository';

// Spec 108: observations and goals.
@Module({
  imports: [AuthModule, ProfilesModule],
  controllers: [NotesController],
  providers: [{ provide: NotesRepository, useClass: NotesPrismaRepository }, NotesUseCases],
})
export class NotesModule {}
