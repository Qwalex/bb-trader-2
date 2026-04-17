import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient, User, Session } from '@repo/shared-prisma';
import { TelegramLoginPayload } from '@repo/shared-ts';
import { APP_CONFIG } from '../config.module.js';
import { PRISMA } from '../prisma.module.js';
import type { AppConfig } from '../config.js';
import { verifyTelegramLogin } from './telegram-login.js';

export interface AuthenticatedUser {
  user: User;
  session: Session;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async loginWithTelegram(rawPayload: unknown): Promise<AuthenticatedUser> {
    const parsed = TelegramLoginPayload.safeParse(rawPayload);
    if (!parsed.success) {
      throw new Error('Invalid Telegram login payload');
    }
    const verdict = verifyTelegramLogin(parsed.data, {
      botToken: this.config.TELEGRAM_BOT_TOKEN,
    });
    if (!verdict.valid) {
      throw new Error(`Telegram login verification failed: ${verdict.reason}`);
    }

    const telegramUserId = String(parsed.data.id);
    const displayName =
      [parsed.data.first_name, parsed.data.last_name].filter(Boolean).join(' ') || null;

    const existing = await this.prisma.user.findUnique({ where: { telegramUserId } });
    let user: User;
    if (existing) {
      user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          telegramUsername: parsed.data.username ?? existing.telegramUsername,
          displayName: displayName ?? existing.displayName,
          photoUrl: parsed.data.photo_url ?? existing.photoUrl,
        },
      });
      if (!user.enabled) {
        throw new Error('User is disabled');
      }
    } else {
      const isBootstrapAdmin =
        this.config.INITIAL_ADMIN_TELEGRAM_ID &&
        this.config.INITIAL_ADMIN_TELEGRAM_ID === telegramUserId;

      if (!isBootstrapAdmin) {
        const signupSetting = await this.prisma.globalSetting.findUnique({
          where: { key: 'PUBLIC_SIGNUP_ENABLED' },
        });
        const signupEnabled = signupSetting?.value === 'true';
        if (!signupEnabled) {
          const anyAdmin = await this.prisma.user.count({ where: { role: 'admin' } });
          if (anyAdmin === 0) {
            throw new Error(
              'No admin is configured yet. Set INITIAL_ADMIN_TELEGRAM_ID env to bootstrap.',
            );
          }
          throw new Error('Public signup is disabled');
        }
      }

      user = await this.prisma.user.create({
        data: {
          telegramUserId,
          telegramUsername: parsed.data.username ?? null,
          displayName,
          photoUrl: parsed.data.photo_url ?? null,
          role: isBootstrapAdmin ? 'admin' : 'user',
        },
      });
      this.logger.log(`Bootstrap user created: ${user.id} role=${user.role}`);
    }

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + this.config.SESSION_TTL_DAYS * 86_400_000),
        issuedVia: 'telegram_login',
      },
    });

    return { user, session };
  }

  async findSession(sessionId: string): Promise<AuthenticatedUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() < Date.now()) return null;
    if (!session.user.enabled) return null;
    return { session, user: session.user };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async setActiveCabinet(sessionId: string, cabinetId: string | null): Promise<void> {
    if (cabinetId) {
      const sess = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      });
      if (!sess) throw new Error('session not found');
      const cabinet = await this.prisma.cabinet.findFirst({
        where: { id: cabinetId, ownerUserId: sess.userId },
      });
      if (!cabinet) throw new Error('cabinet not owned by user');
    }
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { activeCabinetId: cabinetId },
    });
  }
}
