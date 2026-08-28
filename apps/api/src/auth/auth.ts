import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth';
import { organization as organizationPlugin } from 'better-auth/plugins';
import * as schema from '@campaign-iq/database/schema';
import { env } from '../config/env.js';
import { databaseConnection } from '../database/database.js';

export function createCampaignIqAuth(allowSignUp = false) {
  return betterAuth({
    appName: 'CampaignIQ',
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(databaseConnection.db, {
      provider: 'pg',
      schema,
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowSignUp,
      minPasswordLength: 12,
      autoSignIn: false,
    },
    plugins: [
      organizationPlugin({
        allowUserToCreateOrganization: false,
      }),
    ],
    trustedOrigins: [env.WEB_ORIGIN],
    advanced: {
      cookiePrefix: 'campaign-iq',
      useSecureCookies: env.BETTER_AUTH_URL.startsWith('https://'),
      database: {
        generateId: 'uuid',
      },
    },
  });
}

export const auth = createCampaignIqAuth();
export type CampaignIqAuth = typeof auth;
