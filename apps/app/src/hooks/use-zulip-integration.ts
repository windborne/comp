'use client';

import { apiClient } from '@/lib/api-client';
import useSWR from 'swr';

export interface ZulipSettings {
  configured: boolean;
  enabled: boolean;
  siteUrl: string | null;
  botEmail: string | null;
  updatedAt: string | null;
}

export interface SaveZulipSettingsInput {
  siteUrl: string;
  botEmail: string;
  /** Omit to keep the stored key. */
  botApiKey?: string;
  enabled: boolean;
}

export type ZulipTestResult = { sent: true } | { sent: false; reason: string };

const ZULIP_ENDPOINT = '/v1/organization/zulip';

export const zulipSettingsKey = () => [ZULIP_ENDPOINT] as const;

export const EMPTY_ZULIP_SETTINGS: ZulipSettings = {
  configured: false,
  enabled: false,
  siteUrl: null,
  botEmail: null,
  updatedAt: null,
};

interface UseZulipIntegrationOptions {
  initialData?: ZulipSettings;
}

export function useZulipIntegration(options?: UseZulipIntegrationOptions) {
  const { initialData } = options ?? {};

  const { data, error, isLoading, mutate } = useSWR(
    zulipSettingsKey(),
    async () => {
      const response = await apiClient.get<ZulipSettings>(ZULIP_ENDPOINT);
      if (response.error) throw new Error(response.error);
      return response.data ?? EMPTY_ZULIP_SETTINGS;
    },
    {
      fallbackData: initialData,
      revalidateOnMount: !initialData,
      revalidateOnFocus: false,
    },
  );

  const settings = data ?? EMPTY_ZULIP_SETTINGS;

  const saveSettings = async (input: SaveZulipSettingsInput): Promise<ZulipSettings> => {
    const response = await apiClient.put<ZulipSettings>(ZULIP_ENDPOINT, input);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('The API returned an empty response');
    await mutate(response.data, false);
    await mutate();
    return response.data;
  };

  const removeSettings = async (): Promise<void> => {
    const response = await apiClient.delete(ZULIP_ENDPOINT);
    if (response.error) throw new Error(response.error);
    await mutate(EMPTY_ZULIP_SETTINGS, false);
    await mutate();
  };

  const sendTestMessage = async (): Promise<ZulipTestResult> => {
    const response = await apiClient.post<ZulipTestResult>(`${ZULIP_ENDPOINT}/test`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('The API returned an empty response');
    return response.data;
  };

  return {
    settings,
    isLoading: isLoading && !data,
    error,
    mutate,
    saveSettings,
    removeSettings,
    sendTestMessage,
  };
}
