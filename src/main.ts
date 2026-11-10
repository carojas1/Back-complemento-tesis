import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { refreshCookieName } from './auth/infrastructure/http/auth.controller';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';

  setupApp(app);

  if (!isProduction) {
    const config = new DocumentBuilder().setTitle('Necon API').setVersion('1.0').addBearerAuth().addCookieAuth(refreshCookieName).build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  // More than what Nginx and the tablets expect to reuse a connection: if Node closes an idle one first
  // (5 s by default) just as a batch arrives, the client gets "connection reset" (k6 test, test/perf/RESULTADOS.md).
  const server = app.getHttpServer();
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`API on port ${port}${isProduction ? '' : ' (docs at /docs)'}`, 'Bootstrap');
}

bootstrap().catch((error) => {
  Logger.error('Could not start the application', error, 'Bootstrap');
  process.exit(1);
});
