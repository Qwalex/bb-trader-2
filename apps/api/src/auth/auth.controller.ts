import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { CurrentUserDto } from '@repo/shared-ts';
import { APP_CONFIG } from '../config.module.js';
import type { AppConfig } from '../config.js';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE_NAME, SessionGuard, type RequestWithUser } from './session.guard.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('telegram-login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: FastifyReply) {
    try {
      const { user, session } = await this.auth.loginWithTelegram(body);
      res.setCookie(SESSION_COOKIE_NAME, session.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        expires: session.expiresAt,
        signed: true,
      });
      return {
        id: user.id,
        telegramUserId: user.telegramUserId,
        role: user.role,
        displayName: user.displayName,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'telegram-login failed',
      );
    }
  }

  @Get('me')
  @UseGuards(SessionGuard)
  async me(@Req() req: RequestWithUser): Promise<CurrentUserDto> {
    const auth = await this.auth.findSession(req.authSessionId!);
    if (!auth) throw new UnauthorizedException('session invalid');
    return {
      id: auth.user.id,
      telegramUserId: auth.user.telegramUserId,
      telegramUsername: auth.user.telegramUsername,
      displayName: auth.user.displayName,
      photoUrl: auth.user.photoUrl,
      role: auth.user.role as 'user' | 'admin',
      enabled: auth.user.enabled,
      activeCabinetId: auth.session.activeCabinetId,
    };
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  async logout(@Req() req: RequestWithUser, @Res({ passthrough: true }) res: FastifyReply) {
    if (req.authSessionId) await this.auth.logout(req.authSessionId);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  @Post('active-cabinet')
  @UseGuards(SessionGuard)
  async setActiveCabinet(
    @Req() req: RequestWithUser,
    @Body() body: { cabinetId: string | null },
  ) {
    if (!req.authSessionId) throw new UnauthorizedException();
    await this.auth.setActiveCabinet(req.authSessionId, body.cabinetId);
    return { ok: true };
  }
}
