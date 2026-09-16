'use client';

import { apiClient } from '@/lib/api-client';
import useSWR from 'swr';

export interface SsoProvider {
  id: string;
  providerId: string;
  issuer: string;
  /** Comma-separated email domains the provider signs in. */
  domain: string;
  domainVerified: boolean;
  clientId: string | null;
  scopes: string[];
  pkce: boolean;
  discoveryEndpoint: string | null;
  /** Redirect/callback URI to register with the identity provider. */
  redirectUri: string;
  createdAt: string;
  updatedAt: string;
}

export interface SsoDomainVerification {
  recordType: 'TXT';
  /** Record name relative to the domain, e.g. `_compai-sso-acme`. */
  recordName: string;
  recordValue: string;
}

export interface CreateSsoProviderInput {
  providerId: string;
  issuer: string;
  domain: string;
  clientId: string;
  clientSecret: string;
  discoveryEndpoint?: string;
  scopes?: string[];
  pkce?: boolean;
}

export type SsoProviderCreated = SsoProvider & { domainVerification: SsoDomainVerification };

const SSO_PROVIDERS_ENDPOINT = '/v1/organization/sso-providers';

export const ssoProvidersKey = () => [SSO_PROVIDERS_ENDPOINT] as const;

interface UseSsoProvidersOptions {
  initialData?: SsoProvider[];
}

export function useSsoProviders(options?: UseSsoProvidersOptions) {
  const { initialData } = options ?? {};

  const { data, error, isLoading, mutate } = useSWR(
    ssoProvidersKey(),
    async () => {
      const response = await apiClient.get<{ data: SsoProvider[] }>(SSO_PROVIDERS_ENDPOINT);
      if (response.error) throw new Error(response.error);
      return response.data?.data ?? [];
    },
    {
      fallbackData: initialData,
      revalidateOnMount: !initialData,
      revalidateOnFocus: false,
    },
  );

  const providers = Array.isArray(data) ? data : [];

  const createProvider = async (input: CreateSsoProviderInput): Promise<SsoProviderCreated> => {
    const response = await apiClient.post<SsoProviderCreated>(SSO_PROVIDERS_ENDPOINT, input);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('The API returned an empty response');
    await mutate();
    return response.data;
  };

  const deleteProvider = async (providerId: string): Promise<void> => {
    const previous = providers;
    await mutate(
      providers.filter((provider) => provider.providerId !== providerId),
      false,
    );
    try {
      const response = await apiClient.delete(`${SSO_PROVIDERS_ENDPOINT}/${providerId}`);
      if (response.error) throw new Error(response.error);
      await mutate();
    } catch (err) {
      await mutate(previous, false);
      throw err;
    }
  };

  const requestDomainVerification = async (providerId: string): Promise<SsoDomainVerification> => {
    const response = await apiClient.post<SsoDomainVerification>(
      `${SSO_PROVIDERS_ENDPOINT}/${providerId}/domain-verification`,
    );
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('The API returned an empty response');
    return response.data;
  };

  const verifyDomain = async (providerId: string): Promise<SsoProvider> => {
    const response = await apiClient.post<SsoProvider>(
      `${SSO_PROVIDERS_ENDPOINT}/${providerId}/verify-domain`,
    );
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('The API returned an empty response');
    await mutate();
    return response.data;
  };

  return {
    providers,
    isLoading: isLoading && !data,
    error,
    mutate,
    createProvider,
    deleteProvider,
    requestDomainVerification,
    verifyDomain,
  };
}
