import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Repository cache (spec 114 FR-002): everything lasts 60 s and every write clears its key. It lives here because the
// API and the worker use it. With REDIS_URL it lives in Redis (both processes share it); without it, in process memory (tests).
const cache = CacheModule.registerAsync({
  isGlobal: true,
  useFactory: () => ({ ttl: 60_000, stores: process.env.REDIS_URL ? [new KeyvRedis(process.env.REDIS_URL)] : undefined }),
});

@Global()
@Module({ imports: [cache], providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
