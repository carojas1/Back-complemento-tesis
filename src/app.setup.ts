import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

// Common HTTP configuration for main.ts and the e2e tests.
export function setupApp(app: NestExpressApplication) {
  // Behind Nginx: req.ip must be the client IP (used by rate limiting and the audit).
  // A number of hops, or a list such as "uniquelocal" when the portal runs beside the API. Without it, every person behind the portal shares one bucket.
  const trusted = process.env.TRUST_PROXY_HOPS ?? '1';
  app.set('trust proxy', /^\d+$/.test(trusted) ? Number(trusted) : trusted);
  app.use(helmet());
  app.use(cookieParser());
  // A form on another site can post to the API without a preflight; the API only takes JSON and uploads, so the sign-in cannot be forged.
  app.use('/auth', (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'POST' && req.is(['application/x-www-form-urlencoded', 'text/plain'])) return void res.status(415).end();
    next();
  });

  app.useGlobalFilters(new GlobalExceptionFilter());
  // Native WebSocket on /ws (spec 106): the tablet uses React Native's WebSocket, no socket.io.
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // The web sends the refresh cookie: CORS with credentials and explicit origins.
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim()),
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['Content-Disposition'], // the web reads the file name (audit CSV)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });
  return app;
}
