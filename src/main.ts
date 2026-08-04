import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Explicit allowlist, not `true`. Credentials stay off - the panel sends a
  // bearer token, not a cookie - so there is no CSRF surface either.
  app.enableCors({
    origin: (process.env.ADMIN_PANEL_ORIGIN ?? 'http://localhost:3001').split(
      ',',
    ),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
