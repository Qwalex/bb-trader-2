import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import { disconnectPrisma } from '@repo/shared-prisma';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const adapter = new FastifyAdapter({
    logger: { level: config.LOG_LEVEL, base: { service: 'api' } },
    trustProxy: true,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  await app.register(fastifyCors as unknown as Parameters<typeof app.register>[0], {
    origin: config.API_CORS_ORIGINS,
    credentials: true,
  });
  await app.register(fastifyCookie as unknown as Parameters<typeof app.register>[0], {
    secret: config.SESSION_SECRET,
  });

  const shutdown = async (signal: string) => {
    app.getHttpAdapter().getInstance().log.info({ signal }, 'api.shutdown.begin');
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen(config.API_PORT, '0.0.0.0');
  app.getHttpAdapter().getInstance().log.info({ port: config.API_PORT }, 'api.ready');
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('api fatal error', error);
  process.exit(1);
});
