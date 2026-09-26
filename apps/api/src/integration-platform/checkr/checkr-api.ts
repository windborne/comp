import { BadGatewayException, BadRequestException } from '@nestjs/common';
import {
  checkrAuthHeader,
  checkrEnvironment,
  CHECKR_API_BASE_URLS,
  type CheckrGet,
} from '@trycompai/integration-platform';

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/**
 * A GET function for the Checkr API using a connection's stored credentials.
 * Absolute URLs (Checkr's `next_href`) are only followed on Checkr's own host,
 * so the secret key is never sent anywhere else.
 */
export function createCheckrGet(
  credentials: Record<string, string | string[]> | null,
  fetchImpl: (url: URL, init: RequestInit) => Promise<Response> = fetch,
): CheckrGet {
  const apiKey = first(credentials?.api_key);
  if (!apiKey) {
    throw new BadRequestException('The Checkr connection has no API key. Reconnect Checkr.');
  }
  const base = new URL(CHECKR_API_BASE_URLS[checkrEnvironment(credentials?.environment)]);
  const authorization = checkrAuthHeader(apiKey);

  return async <T>(pathOrUrl: string): Promise<T> => {
    const url = new URL(pathOrUrl, base);
    if (url.origin !== base.origin) {
      throw new BadGatewayException(`Refusing to follow a Checkr link to ${url.origin}`);
    }
    const response = await fetchImpl(url, {
      headers: { Authorization: authorization, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 401) {
      throw new BadRequestException(
        'Checkr rejected the API key. Check it is a current secret key for this environment and reconnect.',
      );
    }
    if (!response.ok) {
      throw new BadGatewayException(`Checkr API ${url.pathname} returned ${response.status}`);
    }
    return (await response.json()) as T;
  };
}
