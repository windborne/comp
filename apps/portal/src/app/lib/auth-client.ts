import { ssoClient } from '@better-auth/sso/client';
import {
  emailOTPClient,
  multiSessionClient,
  organizationClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { ac, allRoles } from '@trycompai/auth';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333',
  plugins: [
    organizationClient({ ac, roles: allRoles }),
    emailOTPClient(),
    multiSessionClient(),
    // OIDC single sign-on (`authClient.signIn.sso`), configured per org in the app.
    ssoClient(),
  ],
});

export const {
  signIn,
  signOut,
  useSession,
  useActiveOrganization,
  organization,
  useListOrganizations,
  useActiveMember,
} = authClient;
