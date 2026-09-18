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
import { useCallback, useEffect, useRef, useState } from 'react';
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
  /**
   * Start sign-in with this provider immediately (`/auth?sso=<provider-id>`),
   * the entry point for identity-provider launcher tiles.
   */
  providerId?: string;
  /**
   * Whether the email form is showing. Omit to let the component manage it;
   * pass it together with `onOpenChange` when the parent has to react, e.g.
   * to hide a neighbouring email field while this form is open.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Called when the `providerId` deep link starts sign-in. A parent that
   * unmounts and remounts this component uses it to stop passing `providerId`,
   * so the deep link runs once per page load rather than once per mount.
   */
  onAutoStart?: () => void;
}

/**
 * "Continue with single sign-on": asks for the user's work email, lets the
 * API resolve the organization's identity provider from the email domain, and
 * hands the browser to that provider. Errors on the way back land on /auth
 * as `?error=` and are rendered by the login form.
 */
export function SsoSignIn({
  inviteCode,
  redirectTo,
  providerId,
  open,
  onOpenChange,
  onAutoStart,
}: SsoSignInProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  // A deep link starts redirecting as soon as the component mounts.
  const [isLoading, setIsLoading] = useState(Boolean(providerId));
  const autoStarted = useRef(false);

  const form = useForm<SsoFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  });

  const setIsOpen = useCallback(
    (next: boolean) => {
      setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const startSignIn = useCallback(
    async (target: { email: string } | { providerId: string }) => {
      setIsLoading(true);

      const { error } = await authClient.signIn.sso({
        ...target,
        callbackURL: buildAuthCallbackUrl({ inviteCode, redirectTo }),
        errorCallbackURL: `${window.location.origin}/auth`,
      });

      if (error) {
        toast.error(getSsoSignInErrorMessage(error));
        setIsLoading(false);
        // Let the user retry by email if the deep link's provider is unusable.
        setIsOpen(true);
      }
      // On success better-auth redirects the browser to the identity provider.
    },
    [inviteCode, redirectTo, setIsOpen],
  );

  useEffect(() => {
    if (!providerId || autoStarted.current) return;
    autoStarted.current = true;
    onAutoStart?.();
    void startSignIn({ providerId });
  }, [providerId, startSignIn, onAutoStart]);

  const handleSubmit = ({ email }: SsoFormValues) => startSignIn({ email });
  const handleOpen = () => setIsOpen(true);

  if (isLoading && !isOpen) {
    return (
      <Button type="button" className="w-full h-11 font-medium" variant="default" disabled>
        <Spinner size="sm" />
        Redirecting to your identity provider…
      </Button>
    );
  }

  if (!isOpen) {
    return (
      <Button
        type="button"
        onClick={handleOpen}
        className="w-full h-11 font-medium"
        variant="default"
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
          variant="default"
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
