import {
  ConflictException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import { fromNodeHeaders } from 'better-auth/node';
import { member, organization } from '@campaign-iq/database/schema';
import { auth } from './auth.js';
import { IS_PUBLIC } from './public.decorator.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { InjectDatabase, type Database } from '../database/database.module.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDatabase() private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authSession = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!authSession) throw new UnauthorizedException('Authentication required');

    const activeOrganizationId = authSession.session.activeOrganizationId;
    const memberships = await this.db
      .select({
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(
        activeOrganizationId
          ? and(
              eq(member.userId, authSession.user.id),
              eq(member.organizationId, activeOrganizationId),
            )
          : eq(member.userId, authSession.user.id),
      );

    if (memberships.length !== 1) {
      throw new ConflictException('An active workspace is required');
    }

    const membership = memberships[0];
    request.auth = {
      user: {
        id: authSession.user.id,
        name: authSession.user.name,
        email: authSession.user.email,
      },
      organization: {
        id: membership.organizationId,
        name: membership.organizationName,
        slug: membership.organizationSlug,
      },
      role: membership.role,
    };

    return true;
  }
}
