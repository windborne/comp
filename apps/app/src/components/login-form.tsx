'use client';

import { GithubSignIn } from '@/components/github-sign-in';
import { GoogleSignIn } from '@/components/google-sign-in';
import { MagicLinkSignIn } from '@/components/magic-link';
import { MicrosoftSignIn } from '@/components/microsoft-sign-in';
import { SsoSignIn } from '@/components/sso-sign-in';
import { Alert } from '@trycompai/design-system';
import { CheckmarkFilled, ChevronDown, ChevronUp } from '@trycompai/design-system/icons';
import { Button } from '@trycompai/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@trycompai/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@trycompai/ui/collapsible';
import { type ReactElement, useState } from 'react';

interface LoginFormProps {
  inviteCode?: string;
  redirectTo?: string;
  showGoogle: boolean;
  showGithub: boolean;
  showMicrosoft: boolean;
  /** Mapped copy for an `?error=` code reported by better-auth (see lib/auth-errors). */
  errorMessage?: string | null;
  /** `/auth?sso=<provider-id>`: start single sign-on with this provider right away. */
  ssoProviderId?: string;
}

/**
 * Sign-in options, most to least preferred: single sign-on (configured per
 * organization under Settings → Single sign-on; the API resolves the provider
 * from the email domain), then email, then the configured social providers
 * tucked under "More options".
 */
export function LoginForm({
  inviteCode,
  redirectTo,
  showGoogle,
  showGithub,
  showMicrosoft,
  errorMessage,
  ssoProviderId,
}: LoginFormProps) {
  const [isSsoOpen, setIsSsoOpen] = useState(false);
  // A launcher deep link starts sign-in once per page load. SsoSignIn is
  // unmounted while the "magic link sent" card shows, so the flag lives here.
  const [deepLinkProviderId, setDeepLinkProviderId] = useState(ssoProviderId);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [magicLinkState, setMagicLinkState] = useState({ sent: false, email: '' });

  const handleMagicLinkSent = (email: string) => {
    setMagicLinkState({ sent: true, email });
  };

  const handleUseAnotherMethod = () => setIsSsoOpen(false);
  const handleDeepLinkStarted = () => setDeepLinkProviderId(undefined);

  if (magicLinkState.sent) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center text-center space-y-6 py-16 px-6">
          <CheckmarkFilled size={64} className="text-primary" />
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold text-card-foreground">
              Magic link sent
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Check your inbox at{' '}
              <span className="font-semibold text-foreground">{magicLinkState.email}</span> for a
              magic link to sign in.
            </CardDescription>
          </div>
          <Button variant="link" onClick={() => setMagicLinkState({ sent: false, email: '' })}>
            Use another method
          </Button>
        </CardContent>
      </Card>
    );
  }

  const moreOptionsList: ReactElement[] = [];
  if (showGoogle) {
    moreOptionsList.push(
      <GoogleSignIn key="google" inviteCode={inviteCode} redirectTo={redirectTo} />,
    );
  }
  if (showMicrosoft) {
    moreOptionsList.push(
      <MicrosoftSignIn key="microsoft" inviteCode={inviteCode} redirectTo={redirectTo} />,
    );
  }
  if (showGithub) {
    moreOptionsList.push(
      <GithubSignIn key="github" inviteCode={inviteCode} redirectTo={redirectTo} />,
    );
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <Alert variant="destructive" title="Sign-in failed" description={errorMessage} />
      )}

      <SsoSignIn
        inviteCode={inviteCode}
        redirectTo={redirectTo}
        providerId={deepLinkProviderId}
        onAutoStart={handleDeepLinkStarted}
        open={isSsoOpen}
        onOpenChange={setIsSsoOpen}
      />

      {isSsoOpen ? (
        // One email field at a time: while the single sign-on form is open it
        // stands in for the other options until the user backs out.
        <Button variant="link" className="w-full h-11" onClick={handleUseAnotherMethod}>
          Use another method
        </Button>
      ) : (
        <>
          <MagicLinkSignIn
            inviteCode={inviteCode}
            redirectTo={redirectTo}
            onMagicLinkSubmit={handleMagicLinkSent}
          />

          {moreOptionsList.length > 0 && (
            <Collapsible open={isOptionsOpen} onOpenChange={setIsOptionsOpen} className="w-full">
              <div className="relative flex items-center justify-center py-2">
                <div className="absolute inset-x-0 top-1/2 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    className="relative h-10 px-4 text-sm text-muted-foreground bg-background hover:bg-muted"
                  >
                    More options
                    {isOptionsOpen ? (
                      <ChevronUp size={16} className="ml-1 transition-transform duration-200" />
                    ) : (
                      <ChevronDown size={16} className="ml-1 transition-transform duration-200" />
                    )}
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent className="space-y-4 pt-4 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                {moreOptionsList}
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
    </div>
  );
}
