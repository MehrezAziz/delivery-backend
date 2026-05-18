import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SanitizePipe } from './common/pipes/sanitize.pipe';
import helmet from 'helmet';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // Increase body size limit for base64 image uploads
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));

  // Serve uploaded images (game banners, prizes, question images, etc.)
  // at /uploads/<filename> for direct consumption by mobile clients.
  app.use(
    '/uploads',
    require('express').static(join(process.cwd(), 'uploads'), {
      maxAge: '1y',
      immutable: true,
    }),
  );

  // Security: HTTP headers (XSS, clickjacking, MIME sniffing protection)
  app.use(helmet({
    contentSecurityPolicy: false, // API-only server, no HTML to protect
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow mobile app requests
  }));

  // Enable CORS
  app.enableCors({
    origin: true, // In production, specify allowed origins
    credentials: true,
  });

  // Enable validation pipes globally
  app.useGlobalPipes(
    new SanitizePipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global prefix for all routes
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`🚀 Application is running on: http://localhost:${port}/api`);
}
bootstrap();
