import type { Request } from 'express';

export interface RequestAuth {
  user: {
    id: string;
    name: string;
    email: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  role: string;
}

export type AuthenticatedRequest = Request & { auth: RequestAuth };
