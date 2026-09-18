'use client';

import { authClient } from '@/app/lib/auth-client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Spinner } from '@trycompai/design-system';
import { Email } from '@trycompai/design-system/icons';
import { Button } from '@trycompai/ui/button';
import { Form, FormControl, FormField, FormItem } from '@trycompai/ui/form';
import { Input } from '@trycompai/ui/input';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  email: z.string().email(),
});

type OtpSignInValues = z.infer<typeof formSchema>;

interface OtpSignInProps {
  /** Called once a one time password has been emailed, with the address it went to. */
  onOtpSent: (email: string) => void;
}

/**
 * "Continue with email": emails the user a one time password. The parent
 * takes over from there and renders the code entry step (`OtpForm`).
 */
export function OtpSignIn({ onOtpSent }: OtpSignInProps) {
  const [isLoading, setLoading] = useState(false);

  const form = useForm<OtpSignInValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  });

  async function handleSubmit({ email }: OtpSignInValues) {
    setLoading(true);

    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: 'sign-in',
    });

    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onOtpSent(email);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <div className="flex flex-col space-y-3">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    placeholder="Your work email"
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
                <Email size={16} />
                Continue with email
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
