'use client';

import { useSsoProviders, type SsoProvider } from '@/hooks/use-sso-providers';
import { Alert, Button, Stack, Text } from '@trycompai/design-system';
import { Renew } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { CopyValue } from './CopyValue';

interface DomainVerificationPanelProps {
  provider: SsoProvider;
  canManage: boolean;
}

/**
 * Shown while a provider's domain is unverified: the DNS TXT record to publish
 * and a button that asks the API to check DNS. Sign-in through the provider is
 * refused until this succeeds.
 */
export function DomainVerificationPanel({ provider, canManage }: DomainVerificationPanelProps) {
  const { requestDomainVerification, verifyDomain } = useSsoProviders();
  const [isVerifying, setIsVerifying] = useState(false);
  const domains = provider.domain.split(',');

  const { data: record, error } = useSWR(
    canManage ? ['sso-domain-verification', provider.providerId] : null,
    () => requestDomainVerification(provider.providerId),
    { revalidateOnFocus: false },
  );

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      await verifyDomain(provider.providerId);
      toast.success('Domain verified. Single sign-on is now active.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Domain verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Alert variant="warning" title="Verify domain ownership">
      <Stack gap="sm">
        <Text size="sm">
          Sign-in stays disabled until you prove you own {domains.join(', ')}. Add this DNS TXT
          record{domains.length > 1 ? ' under each domain' : ''}, then verify. DNS changes can take
          up to an hour to propagate.
        </Text>

        {record ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Stack gap="xs">
              <Text size="xs" weight="medium" variant="muted">
                Record name
              </Text>
              <CopyValue value={`${record.recordName}.${domains[0]}`} label="Record name" />
            </Stack>
            <Stack gap="xs">
              <Text size="xs" weight="medium" variant="muted">
                Record value
              </Text>
              <CopyValue value={record.recordValue} label="Record value" />
            </Stack>
          </div>
        ) : error ? (
          <Text size="sm" variant="destructive">
            Could not load the verification record. Reload the page to try again.
          </Text>
        ) : canManage ? (
          <Text size="sm" variant="muted">
            Loading verification record…
          </Text>
        ) : (
          <Text size="sm" variant="muted">
            An organization admin needs to complete verification.
          </Text>
        )}

        {canManage && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleVerify}
              disabled={isVerifying || !record}
            >
              <Renew size={14} />
              {isVerifying ? 'Verifying…' : 'Verify domain'}
            </Button>
          </div>
        )}
      </Stack>
    </Alert>
  );
}
