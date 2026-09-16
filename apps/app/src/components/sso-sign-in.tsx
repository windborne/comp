'use client';

import { getSsoSignInErrorMessage } from '@/lib/auth-errors';
import { buildAuthCallbackUrl } from '@/utils/auth-callback';
import { authClient } from '@/utils/auth-client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Spinner } from '@trycompai/design-system';
import { Enterprise } from '@trycompai/design-system/icons';
import { Button } from '@trycompai/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@trycompai/ui/form';
import { Input } from '@trycompai/ui/input';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  email: z.string().email('Enter your work email address'),
});

type SsoFormValues = z.infer<typeof formSchema>;

interface SsoSignInProps {
  inviteCode?: string;
  redirectTo?: string;
}

/**
 * "Continue with single sign-on": asks for the user's work email, lets the
 * API resolve the organization's identity provider from the email domain, and
 * hands the browser to that provider. Errors on the way back land on /auth
 * as `?error=` and are rendered by the login form.
 */
export function SsoSignIn({ inviteCode, redirectTo }: SsoSignInProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<SsoFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  });

  const handleSubmit = async ({ email }: SsoFormValues) => {
    setIsLoading(true);

    const { error } = await authClient.signIn.sso({
      email,
      callbackURL: buildAuthCallbackUrl({ inviteCode, redirectTo }),
      errorCallbackURL: `${window.location.origin}/auth`,
    });

    if (error) {
      toast.error(getSsoSignInErrorMessage(error));
      setIsLoading(false);
    }
    // On success better-auth redirects the browser to the identity provider.
  };

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
