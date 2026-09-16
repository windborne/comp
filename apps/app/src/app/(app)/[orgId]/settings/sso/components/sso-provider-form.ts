import { z } from 'zod';

/** Mirrors the API's CreateSsoProviderDto validation so errors show inline. */
export const ssoProviderFormSchema = z.object({
  providerId: z
    .string()
    .min(2, 'Use at least 2 characters')
    .max(40, 'Use at most 40 characters')
    .regex(
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
      'Lowercase letters, digits and hyphens only (e.g. acme)',
    ),
  issuer: z.string().url('Enter the issuer URL, e.g. https://login.example.com'),
  domain: z
    .string()
    .min(3, 'Enter your email domain, e.g. acme.com')
    .regex(/^[a-z0-9.-]+(?:\s*,\s*[a-z0-9.-]+)*$/i, 'Enter one or more domains such as acme.com'),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client secret is required'),
  scopes: z.string().min(1, 'At least one scope is required'),
  pkce: z.boolean(),
});

export type SsoProviderFormValues = z.infer<typeof ssoProviderFormSchema>;

export const SSO_PROVIDER_FORM_DEFAULTS: SsoProviderFormValues = {
  providerId: '',
  issuer: '',
  domain: '',
  clientId: '',
  clientSecret: '',
  scopes: 'openid profile email',
  pkce: true,
};

/** Scopes are typed as free text; the API wants an array. */
export function parseScopes(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

/** Preview of the callback URL an admin registers with the IdP before saving. */
export function buildRedirectUriPreview({
  apiBaseUrl,
  providerId,
}: {
  apiBaseUrl: string;
  providerId: string;
}): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  return `${base}/api/auth/sso/callback/${providerId || '<provider-id>'}`;
}
