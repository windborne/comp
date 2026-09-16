'use client';

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Stack,
  Switch,
  Text,
} from '@trycompai/design-system';
import { Controller, type Control } from 'react-hook-form';
import { CopyValue } from './CopyValue';
import type { SsoProviderFormValues } from './sso-provider-form';

interface SsoProviderFormFieldsProps {
  control: Control<SsoProviderFormValues>;
  redirectUriPreview: string;
}

/** The add-provider form fields; the sheet owns submission and the success state. */
export function SsoProviderFormFields({ control, redirectUriPreview }: SsoProviderFormFieldsProps) {
  return (
    <Stack gap="md">
      <Controller
        control={control}
        name="providerId"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="sso-provider-id">Provider ID</FieldLabel>
            <Input
              id="sso-provider-id"
              placeholder="acme"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              {...field}
            />
            <FieldDescription>
              Short identifier used in the callback URL and DNS record. It cannot be changed later.
            </FieldDescription>
            <FieldError>{fieldState.error?.message}</FieldError>
          </Field>
        )}
      />

      <Stack gap="xs">
        <Text size="sm" weight="medium">
          Redirect URI
        </Text>
        <CopyValue value={redirectUriPreview} label="Redirect URI" />
        <Text size="xs" variant="muted">
          Register this as the sign-in redirect URI in your identity provider.
        </Text>
      </Stack>

      <Controller
        control={control}
        name="issuer"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="sso-issuer">Issuer URL</FieldLabel>
            <Input
              id="sso-issuer"
              type="url"
              placeholder="https://login.microsoftonline.com/<tenant-id>/v2.0"
              autoComplete="off"
              {...field}
            />
            <FieldDescription>
              The OpenID Connect issuer from your provider; its discovery document is fetched when
              you save.
            </FieldDescription>
            <FieldError>{fieldState.error?.message}</FieldError>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="domain"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="sso-domain">Email domain</FieldLabel>
            <Input
              id="sso-domain"
              placeholder="acme.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              {...field}
            />
            <FieldDescription>
              People with this email domain sign in through this provider. Separate several domains
              with commas. Ownership is verified with a DNS record after saving.
            </FieldDescription>
            <FieldError>{fieldState.error?.message}</FieldError>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="clientId"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="sso-client-id">Client ID</FieldLabel>
            <Input id="sso-client-id" autoComplete="off" spellCheck={false} {...field} />
            <FieldError>{fieldState.error?.message}</FieldError>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="clientSecret"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="sso-client-secret">Client secret</FieldLabel>
            <Input
              id="sso-client-secret"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              {...field}
            />
            <FieldDescription>
              Stored for the token exchange and never shown again.
            </FieldDescription>
            <FieldError>{fieldState.error?.message}</FieldError>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="scopes"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="sso-scopes">Scopes</FieldLabel>
            <Input id="sso-scopes" autoComplete="off" spellCheck={false} {...field} />
            <FieldDescription>
              Space-separated. The defaults work for most providers.
            </FieldDescription>
            <FieldError>{fieldState.error?.message}</FieldError>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="pkce"
        render={({ field }) => (
          <Field orientation="horizontal">
            <div className="min-w-0 flex-1">
              <FieldLabel htmlFor="sso-pkce">Use PKCE</FieldLabel>
              <FieldDescription>
                Recommended. Turn off only if your provider rejects PKCE for confidential clients.
              </FieldDescription>
            </div>
            <Switch id="sso-pkce" checked={field.value} onCheckedChange={field.onChange} />
          </Field>
        )}
      />
    </Stack>
  );
}
