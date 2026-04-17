import { Global, Module } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@repo/shared-prisma';

export const PRISMA = Symbol('PRISMA');

@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      useFactory: (): PrismaClient => getPrisma(),
    },
  ],
  exports: [PRISMA],
})
export class PrismaModule {}
