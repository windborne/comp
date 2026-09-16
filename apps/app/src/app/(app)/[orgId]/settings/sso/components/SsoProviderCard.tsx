'use client';

import { useSsoProviders, type SsoProvider } from '@/hooks/use-sso-providers';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  SettingsCard,
  Stack,
  Text,
} from '@trycompai/design-system';
import { TrashCan } from '@trycompai/design-system/icons';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CopyValue } from './CopyValue';
import { DomainVerificationPanel } from './DomainVerificationPanel';

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 md:grid-cols-[180px_minmax(0,1fr)] md:gap-6">
      <Text size="sm" variant="muted">
        {label}
      </Text>
      <div className="min-w-0 break-all">{children}</div>
    </div>
  );
}

interface SsoProviderCardProps {
  provider: SsoProvider;
  canManage: boolean;
}

export function SsoProviderCard({ provider, canManage }: SsoProviderCardProps) {
  const { deleteProvider } = useSsoProviders();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteProvider(provider.providerId);
      setDeleteOpen(false);
      toast.success('Single sign-on provider removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove provider');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SettingsCard
      title={provider.domain}
      description={`Provider ID: ${provider.providerId}`}
      hint={
        <Badge variant={provider.domainVerified ? 'accent' : 'outline'}>
          {provider.domainVerified ? 'Active' : 'Pending domain verification'}
        </Badge>
      }
      action={
        canManage ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
            <TrashCan size={14} />
            Remove
          </Button>
        ) : undefined
      }
    >
      <Stack gap="md">
        <Stack gap="sm">
          <DetailRow label="Issuer">
            <Text size="sm">{provider.issuer}</Text>
          </DetailRow>
          <DetailRow label="Client ID">
            <Text size="sm" font="mono">
              {provider.clientId ?? '—'}
            </Text>
          </DetailRow>
          <DetailRow label="Scopes">
            <Text size="sm">{provider.scopes.length > 0 ? provider.scopes.join(' ') : '—'}</Text>
          </DetailRow>
          <DetailRow label="PKCE">
            <Text size="sm">{provider.pkce ? 'Enabled' : 'Disabled'}</Text>
          </DetailRow>
          <DetailRow label="Redirect URI">
            <CopyValue value={provider.redirectUri} label="Redirect URI" />
          </DetailRow>
        </Stack>

        {!provider.domainVerified && (
          <DomainVerificationPanel provider={provider} canManage={canManage} />
        )}
      </Stack>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove single sign-on provider</AlertDialogTitle>
            <AlertDialogDescription>
              People will no longer be able to sign in through {provider.domain} with single
              sign-on. Their Comp AI accounts and memberships are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}
