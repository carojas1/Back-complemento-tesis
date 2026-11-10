import { createHash } from 'node:crypto';
import { ExecutionContext, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth';
import { JwtAuthGuard } from './auth/infrastructure/http/guards/jwt-auth.guard';
import { UserRoleGuard } from './auth/infrastructure/http/guards/user-role.guard';
import { JwtPayload } from './auth/infrastructure/http/jwt-payload.interface';
import { DevicesModule } from './devices/devices.module';
import { deviceRouteKey } from './devices/infrastructure/http/device-auth';
import { CategoriesModule } from './categories/categories.module';
import { StorageModule } from './common/storage/storage.module';
import { PictogramsModule } from './pictograms/pictograms.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { PatientsModule } from './patients/patients.module';
import { ProfilesModule } from './profiles/profiles.module';
import { SettingsModule } from './settings/settings.module';
import { VoicesModule } from './voices/voices.module';
import { AuditModule } from './audit/audit.module';
import { SessionsModule } from './sessions/sessions.module';
import { NotesModule } from './notes/notes.module';
import { DataRequestsModule } from './data-requests/data-requests.module';
import { JobsModule } from './jobs/jobs.module';
import { SyncModule } from './sync/sync.module';
import { VocabularyModule } from './vocabulary/vocabulary.module';
import { HomeworkModule } from './homework/homework.module';
import { FamilyModule } from './family/family.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { LimitsModule } from './limits/limits.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { CenterModule } from './center/center.module';
import { TreatmentsModule } from './treatments/treatments.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TenancyInterceptor } from './tenancy/tenancy.interceptor';
import type { Request } from 'express';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Limits per user (or per IP if the request carries no valid token):
    // a Center behind a single IP does not share a counter.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const jwt = new JwtService({ secret: config.getOrThrow<string>('JWT_SECRET') });
        return {
          throttlers: [
            { name: 'short', ttl: 1000, limit: 10 },
            { name: 'medium', ttl: 10_000, limit: 50 },
            { name: 'long', ttl: 60_000, limit: 200 },
          ],
          errorMessage: 'Demasiadas solicitudes. Intente de nuevo en unos minutos.',
          getTracker: (req: Request, context: ExecutionContext) => {
            const auth = req.headers.authorization;
            if (auth?.startsWith('Bearer ')) {
              try {
                const payload = jwt.verify<JwtPayload>(auth.slice(7));
                if (payload?.typ === 'access' && payload.sub) return `user:${payload.sub}`;
              } catch {
                // invalid or expired token: counted per IP
              }
            }
            // Spec 106 FR-004: the tablets of a room share an IP; each one counts by its token. Only on the tablet's routes: on the public
            // ones (sign-in, password reset, center requests) a made-up token would open a new counter per request and escape the limit.
            const deviceRoute = Boolean(
              Reflect.getMetadata(deviceRouteKey, context.getHandler()) || Reflect.getMetadata(deviceRouteKey, context.getClass()),
            );
            if (deviceRoute && auth?.startsWith('Device '))
              return `device:${createHash('sha256').update(auth.slice(7)).digest('hex').slice(0, 24)}`;
            return `ip:${req.ip}`;
          },
        };
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    DevicesModule,
    StorageModule,
    PictogramsModule,
    CategoriesModule,
    VocabularyModule,
    CatalogsModule,
    ProfilesModule,
    PatientsModule,
    SyncModule,
    VoicesModule,
    SettingsModule,
    AuditModule,
    SessionsModule,
    NotesModule,
    HomeworkModule,
    FamilyModule,
    DataRequestsModule,
    JobsModule,
    InstitutionsModule,
    NotificationsModule,
    LimitsModule,
    AppointmentsModule,
    DashboardModule,
    HealthModule,
    CenterModule,
    TreatmentsModule,
    SubscriptionsModule,
  ],
  providers: [
    // Order: rate limit → authentication → role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: UserRoleGuard },
    // Each request runs inside the institution the guards left (spec 113).
    { provide: APP_INTERCEPTOR, useClass: TenancyInterceptor },
  ],
})
export class AppModule {}
