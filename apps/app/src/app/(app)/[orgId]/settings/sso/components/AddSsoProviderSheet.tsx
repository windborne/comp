'use client';

import { env } from '@/env.mjs';
import { usePermissions } from '@/hooks/use-permissions';
import { useSsoProviders, type SsoProviderCreated } from '@/hooks/use-sso-providers';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Stack,
  Text,
} from '@trycompai/design-system';
import { Close } from '@trycompai/design-system/icons';
import { useMediaQuery } from '@trycompai/ui/hooks';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { CopyValue } from './CopyValue';
import { SsoProviderFormFields } from './SsoProviderFormFields';
import {
  buildRedirectUriPreview,
  parseScopes,
  SSO_PROVIDER_FORM_DEFAULTS,
  ssoProviderFormSchema,
  type SsoProviderFormValues,
} from './sso-provider-form';

interface AddSsoProviderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TITLE = 'Connect identity provider';
const DESCRIPTION =
  'Add an OpenID Connect provider (Okta, Microsoft Entra ID, Google Workspace, …). Sign-in is enabled once you verify the email domain.';

export function AddSsoProviderSheet({ open, onOpenChange }: AddSsoProviderSheetProps) {
  const { createProvider } = useSsoProviders();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('organization', 'update');
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [created, setCreated] = useState<SsoProviderCreated | null>(null);

  const form = useForm<SsoProviderFormValues>({
    resolver: zodResolver(ssoProviderFormSchema),
    defaultValues: SSO_PROVIDER_FORM_DEFAULTS,
  });
  const { isSubmitting } = form.formState;
  const providerId = useWatch({ control: form.control, name: 'providerId' });
  const redirectUriPreview = buildRedirectUriPreview({
    apiBaseUrl: env.NEXT_PUBLIC_API_URL || 'http://localhost:3333',
    providerId,
  });

  const handleSubmit = async (values: SsoProviderFormValues) => {
    try {
      const result = await createProvider({
        providerId: values.providerId,
        issuer: values.issuer,
        domain: values.domain,
        clientId: values.clientId,
        clientSecret: values.clientSecret,
        scopes: parseScopes(values.scopes),
        pkce: values.pkce,
      });
      setCreated(result);
      toast.success('Identity provider added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add the identity provider');
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    form.reset(SSO_PROVIDER_FORM_DEFAULTS);
    setCreated(null);
    onOpenChange(false);
  };

  const renderForm = () => (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
      <Stack gap="md">
        <SsoProviderFormFields control={form.control} redirectUriPreview={redirectUriPreview} />
        <Button type="submit" width="full" disabled={isSubmitting || !canManage}>
          {isSubmitting ? 'Connecting…' : 'Connect provider'}
        </Button>
      </Stack>
    </form>
  );

  const renderCreated = (result: SsoProviderCreated) => (
    <Stack gap="md">
      <Alert
        variant="success"
        title="Provider connected"
        description="One step left: prove you own the email domain so sign-in can be enabled."
      />
      <Stack gap="xs">
        <Text size="sm" weight="medium">
          Redirect URI
        </Text>
        <CopyValue value={result.redirectUri} label="Redirect URI" />
      </Stack>
      <Stack gap="xs">
        <Text size="sm" weight="medium">
          DNS TXT record
        </Text>
        <CopyValue
          value={`${result.domainVerification.recordName}.${result.domain.split(',')[0]}`}
          label="Record name"
        />
        <CopyValue value={result.domainVerification.recordValue} label="Record value" />
        <Text size="xs" variant="muted">
          Add this record at your DNS provider, then use “Verify domain” on the provider card.
        </Text>
      </Stack>
      <Button type="button" onClick={handleClose} width="full">
        Done
      </Button>
    </Stack>
  );

  const body = created ? renderCreated(created) : renderForm();

  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent>
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>{TITLE}</SheetTitle>
              <Button size="icon" variant="ghost" onClick={handleClose} aria-label="Close">
                <Close size={20} />
              </Button>
            </div>
            <SheetDescription>{DESCRIPTION}</SheetDescription>
          </SheetHeader>
          <SheetBody>{body}</SheetBody>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{TITLE}</DrawerTitle>
          <DrawerDescription>{DESCRIPTION}</DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[70dvh] overflow-y-auto p-4">{body}</div>
      </DrawerContent>
    </Drawer>
  );
}
