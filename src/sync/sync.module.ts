import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { DevicesModule } from '../devices/devices.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { GetSyncProfilesUseCase } from './application/get-sync-profiles.use-case';
import { ListLivePatientsUseCase } from './application/list-live-patients.use-case';
import { ProcessBatchUseCase } from './application/process-batch.use-case';
import { LiveFeed, LiveRead, SyncRepository } from './domain/ports/sync.repository';
import { LiveController } from './infrastructure/http/live.controller';
import { SyncController } from './infrastructure/http/sync.controller';
import { LivePrismaRead } from './infrastructure/prisma/live.prisma.read';
import { SyncPrismaRepository } from './infrastructure/prisma/sync.prisma.repository';
import { InMemoryLiveFeed } from './infrastructure/ws/in-memory-live-feed';
import { LiveGateway } from './infrastructure/ws/live.gateway';

// DevicesModule: @DeviceAuth and WebSocket authentication. ProfilesModule: profiles and assignment for live watching.
@Module({
  imports: [AuthModule, DevicesModule, ProfilesModule],
  controllers: [SyncController, LiveController],
  providers: [
    { provide: SyncRepository, useClass: SyncPrismaRepository },
    { provide: LiveRead, useClass: LivePrismaRead },
    ListLivePatientsUseCase,
    InMemoryLiveFeed,
    { provide: LiveFeed, useExisting: InMemoryLiveFeed },
    GetSyncProfilesUseCase,
    ProcessBatchUseCase,
    LiveGateway,
  ],
  exports: [ProcessBatchUseCase], // home practice by guardians (spec 112)
})
export class SyncModule {}
