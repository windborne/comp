'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { useSsoProviders, type SsoProvider } from '@/hooks/use-sso-providers';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  HStack,
  Stack,
  Text,
} from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { AddSsoProviderSheet } from './AddSsoProviderSheet';
import { SsoProviderCard } from './SsoProviderCard';

interface SsoSettingsProps {
  initialProviders: SsoProvider[];
}

export function SsoSettings({ initialProviders }: SsoSettingsProps) {
  const { providers } = useSsoProviders({ initialData: initialProviders });
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('organization', 'update');
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  return (
    <Stack gap="lg">
      <HStack justify="between" align="start" wrap="wrap" gap="3">
        <div className="max-w-2xl">
          <Text size="sm" variant="muted">
            Let people sign in to Comp AI and the employee portal with your identity provider. Users
            pick “Continue with single sign-on” and enter their work email; new users are added to
            this organization as employees.
          </Text>
        </div>
        {canManage && (
          <Button type="button" onClick={() => setIsSheetOpen(true)}>
            <Add size={16} />
            Add provider
          </Button>
        )}
      </HStack>

      {providers.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No identity provider connected</EmptyTitle>
            <EmptyDescription>
              Connect an OpenID Connect provider such as Okta, Microsoft Entra ID or Google
              Workspace to enable single sign-on for your organization.
            </EmptyDescription>
          </EmptyHeader>
          {canManage && (
            <EmptyContent>
              <Button type="button" variant="outline" onClick={() => setIsSheetOpen(true)}>
                <Add size={16} />
                Add provider
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <Stack gap="md">
          {providers.map((provider) => (
            <SsoProviderCard key={provider.id} provider={provider} canManage={canManage} />
          ))}
        </Stack>
      )}

      <AddSsoProviderSheet open={isSheetOpen} onOpenChange={setIsSheetOpen} />
    </Stack>
  );
}
