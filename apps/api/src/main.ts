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

  app.setGlobalPrefix('api');

  await app.register(fastifyCors as unknown as Parameters<typeof app.register>[0], {
    origin: config.API_CORS_ORIGINS,
    credentials: true,
  });
  await app.register(fastifyCookie as unknown as Parameters<typeof app.register>[0], {
    secret: config.SESSION_SECRET,
  });

  // Root route handled directly on the Fastify instance (outside NestJS router)
  // so it is reachable even though all NestJS routes are prefixed with /api.
  const fastify = app.getHttpAdapter().getInstance();
  fastify.get('/', (_req, reply) => {
    void reply.redirect('/api/health', 302);
  });

  const shutdown = async (signal: string) => {
    app.getHttpAdapter().getInstance().log.info({ signal }, 'api.shutdown.begin');
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  const port = config.PORT ?? config.API_PORT;
  await app.listen(port, '0.0.0.0');
  app.getHttpAdapter().getInstance().log.info({ port }, 'api.ready');
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('api fatal error', error);
  process.exit(1);
});
