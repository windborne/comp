'use client';

import { usePermissions } from '@/hooks/use-permissions';
import {
  EMPTY_ZULIP_SETTINGS,
  useZulipIntegration,
  type ZulipSettings as ZulipSettingsData,
} from '@/hooks/use-zulip-integration';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  HStack,
  Input,
  Section,
  Stack,
  Switch,
  Text,
} from '@trycompai/design-system';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  buildZulipSettingsFormSchema,
  toSaveZulipSettingsInput,
  zulipSettingsToFormValues,
  type ZulipSettingsFormValues,
} from './zulip-settings-form';

interface ZulipSettingsProps {
  initialSettings: ZulipSettingsData;
}

export function ZulipSettings({ initialSettings }: ZulipSettingsProps) {
  const { settings, saveSettings, removeSettings, sendTestMessage } = useZulipIntegration({
    initialData: initialSettings,
  });
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('organization', 'update');
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const form = useForm<ZulipSettingsFormValues>({
    resolver: zodResolver(buildZulipSettingsFormSchema({ requireApiKey: !settings.configured })),
    defaultValues: zulipSettingsToFormValues(initialSettings),
  });
  const saving = form.formState.isSubmitting;
  const busy = saving || testing || removing;

  const handleSave = async (values: ZulipSettingsFormValues) => {
    try {
      const saved = await saveSettings(toSaveZulipSettingsInput(values));
      form.reset(zulipSettingsToFormValues(saved));
      toast.success('Zulip settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Zulip settings');
    }
  };

  const handleSendTest = async () => {
    setTesting(true);
    try {
      const result = await sendTestMessage();
      if (result.sent) {
        toast.success('Test message sent. Check your Zulip direct messages.');
      } else {
        toast.error(`Zulip did not accept the message: ${result.reason}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send the test message');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    setRemoving(true);
    try {
      await removeSettings();
      form.reset(zulipSettingsToFormValues(EMPTY_ZULIP_SETTINGS));
      toast.success('Zulip disconnected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect Zulip');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(handleSave)}>
      <Section
        title="Zulip direct messages"
        description="Deliver the notifications members receive by email as Zulip direct messages too. A Zulip bot sends them, and members are matched by email address, so their Zulip and Comp AI addresses must be the same."
        actions={
          <Button size="lg" type="submit" disabled={busy || !canManage} loading={saving}>
            {settings.configured ? 'Save changes' : 'Connect Zulip'}
          </Button>
        }
      >
        <Stack gap="md">
          <Text size="sm" variant="muted">
            {settings.configured
              ? `Connected to ${settings.siteUrl} as ${settings.botEmail}.`
              : 'Not connected. Create a generic bot in Zulip (Personal settings → Bots) and enter its email and API key below.'}
          </Text>

          <Controller
            control={form.control}
            name="siteUrl"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="zulip-site-url">Zulip server URL</FieldLabel>
                <Input
                  id="zulip-site-url"
                  type="url"
                  placeholder="https://chat.example.com"
                  autoComplete="off"
                  disabled={!canManage}
                  {...field}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="botEmail"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="zulip-bot-email">Bot email</FieldLabel>
                <Input
                  id="zulip-bot-email"
                  type="email"
                  placeholder="comp-bot@chat.example.com"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!canManage}
                  {...field}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="botApiKey"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="zulip-bot-api-key">Bot API key</FieldLabel>
                <Input
                  id="zulip-bot-api-key"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  disabled={!canManage}
                  {...field}
                />
                <FieldDescription>
                  {settings.configured
                    ? 'Leave blank to keep the saved key. Stored encrypted and never shown again.'
                    : 'Stored encrypted and never shown again.'}
                </FieldDescription>
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <Field orientation="horizontal">
                <div className="min-w-0 flex-1">
                  <FieldLabel htmlFor="zulip-enabled">Send direct messages</FieldLabel>
                  <FieldDescription>
                    Turn off to pause Zulip delivery without removing the connection.
                  </FieldDescription>
                </div>
                <Switch
                  id="zulip-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={!canManage}
                />
              </Field>
            )}
          />

          {settings.configured && canManage && (
            <HStack gap="2" wrap="wrap">
              <Button
                type="button"
                variant="outline"
                onClick={handleSendTest}
                disabled={busy}
                loading={testing}
              >
                Send me a test message
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDisconnect}
                disabled={busy}
                loading={removing}
              >
                Disconnect
              </Button>
            </HStack>
          )}
        </Stack>
      </Section>
    </form>
  );
}
