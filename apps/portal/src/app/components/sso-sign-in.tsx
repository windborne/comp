'use client';

import { buildSignInCallbackUrls } from '@/app/lib/auth-callback';
import { authClient } from '@/app/lib/auth-client';
import { getSsoSignInErrorMessage } from '@/app/lib/auth-errors';
import { zodResolver } from '@hookform/resolvers/zod';
import { Spinner } from '@trycompai/design-system';
import { Enterprise } from '@trycompai/design-system/icons';
import { Button } from '@trycompai/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@trycompai/ui/form';
import { Input } from '@trycompai/ui/input';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  email: z.string().email('Enter your work email address'),
});

type SsoFormValues = z.infer<typeof formSchema>;

/**
 * "Continue with single sign-on" for the employee portal. The API resolves
 * the organization's identity provider from the email domain (or starts with
 * a specific provider for `/auth?sso=<provider-id>` launcher links) and
 * redirects the browser there; failures come back to /auth as `?error=`.
 */
export function SsoSignIn({
  inviteCode,
  searchParams,
  providerId,
}: {
  inviteCode?: string;
  searchParams?: URLSearchParams;
  providerId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const autoStarted = useRef(false);

  const form = useForm<SsoFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  });

  const startSignIn = useCallback(
    async (target: { email: string } | { providerId: string }) => {
      setIsLoading(true);

      const { callbackURL, errorCallbackURL } = buildSignInCallbackUrls({
        origin: window.location.origin,
        inviteCode,
        searchParams,
      });

      const { error } = await authClient.signIn.sso({
        ...target,
        callbackURL,
        errorCallbackURL,
      });

      if (error) {
        toast.error(getSsoSignInErrorMessage(error));
        setIsLoading(false);
        setIsOpen(true);
      }
      // On success better-auth redirects the browser to the identity provider.
    },
    [inviteCode, searchParams],
  );

  useEffect(() => {
    if (!providerId || autoStarted.current) return;
    autoStarted.current = true;
    void startSignIn({ providerId });
  }, [providerId, startSignIn]);

  const handleSubmit = ({ email }: SsoFormValues) => startSignIn({ email });

  if (providerId && !isOpen) {
    return (
      <Button type="button" className="w-full h-11 font-medium" variant="outline" disabled>
        <Spinner size="sm" />
        Redirecting to your identity provider…
      </Button>
    );
  }

  if (!isOpen) {
    return (
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full h-11 font-medium"
        variant="outline"
      >
        <Enterprise size={16} />
        Continue with single sign-on
      </Button>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col space-y-3"
        aria-label="Single sign-on"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder="name@company.com"
                  type="email"
                  autoComplete="email"
                  {...field}
                  autoFocus
                  className="h-11"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full h-11 font-medium"
          variant="outline"
          disabled={isLoading}
        >
          {isLoading ? (
            <Spinner size="sm" />
          ) : (
            <>
              <Enterprise size={16} />
              Continue with single sign-on
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
