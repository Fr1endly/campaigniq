import { Controller, Get, Req } from '@nestjs/common';
import type { SessionResponse } from '@campaign-iq/contracts';
import type { AuthenticatedRequest } from './auth.types.js';

@Controller('session')
export class SessionController {
  @Get()
  getSession(@Req() request: AuthenticatedRequest): SessionResponse {
    return {
      user: request.auth.user,
      organization: {
        ...request.auth.organization,
        role: request.auth.role,
      },
    };
  }
}
