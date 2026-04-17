import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';

export const SESSION_COOKIE_NAME = 'bb_session';

export interface RequestWithUser extends FastifyRequest {
  authUserId?: string;
  authSessionId?: string;
  authRole?: string;
  activeCabinetId?: string | null;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const sessionId = (req as unknown as { cookies?: Record<string, string> }).cookies?.[
      SESSION_COOKIE_NAME
    ];
    if (!sessionId) throw new UnauthorizedException('no session cookie');
    const auth = await this.auth.findSession(sessionId);
    if (!auth) throw new UnauthorizedException('invalid session');
    req.authUserId = auth.user.id;
    req.authSessionId = auth.session.id;
    req.authRole = auth.user.role;
    req.activeCabinetId = auth.session.activeCabinetId;
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    if (req.authRole !== 'admin') {
      throw new UnauthorizedException('admin required');
    }
    return true;
  }
}
