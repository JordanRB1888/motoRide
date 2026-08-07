import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global Prefix & CORS
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  // Global Pipes, Filters & Interceptors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger OpenAPI Setup
  const config = new DocumentBuilder()
    .setTitle('Delivery+58 Backend API')
    .setDescription('Documentación Oficial de la API REST y WebSockets de Delivery+58 (+58express Maracaibo)')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  
  logger.log(`🚀 [+58express NestJS Production API] running on http://localhost:${port}/api/v1`);
  logger.log(`📚 [Swagger Documentation] available at http://localhost:${port}/api/docs`);
  logger.log(`💚 [Health Check] available at http://localhost:${port}/health`);
}
bootstrap();
