'use client';

import { buildAuthCallbackUrl } from '@/utils/auth-callback';
import { authClient } from '@/utils/auth-client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Spinner } from '@trycompai/design-system';
import { Email } from '@trycompai/design-system/icons';
import { Button } from '@trycompai/ui/button';
import { cn } from '@trycompai/ui/cn';
import { Form, FormControl, FormField, FormItem } from '@trycompai/ui/form';
import { Input } from '@trycompai/ui/input';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  email: z.string().email(),
});

interface MagicLinkSignInProps {
  className?: string;
  inviteCode?: string;
  redirectTo?: string;
  onMagicLinkSubmit?: (email: string) => void;
}

export function MagicLinkSignIn({
  className,
  inviteCode,
  redirectTo,
  onMagicLinkSubmit,
}: MagicLinkSignInProps) {
  const [isLoading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
    },
  });

  async function onSubmit({ email }: z.infer<typeof formSchema>) {
    setLoading(true);

    const callbackURL = buildAuthCallbackUrl({ inviteCode, redirectTo });

    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL,
    });

    if (error) {
      toast.error('Error sending email - try again?');
      setLoading(false);
    } else if (onMagicLinkSubmit) {
      onMagicLinkSubmit(email);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className={cn('flex flex-col space-y-3', className)}>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    placeholder="name@example.com"
                    {...field}
                    autoFocus
                    className="h-11"
                    autoCapitalize="false"
                    autoCorrect="false"
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
