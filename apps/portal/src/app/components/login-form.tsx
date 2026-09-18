'use client';

import { ChevronDown, ChevronUp } from '@trycompai/design-system/icons';
import { Button } from '@trycompai/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@trycompai/ui/collapsible';
import { useSearchParams } from 'next/navigation';
import { type ReactElement, useState } from 'react';
import { GoogleSignIn } from './google-sign-in';
import { MicrosoftSignIn } from './microsoft-sign-in';
import { OtpSignIn } from './otp';
import { OtpForm } from './otp-form';
import { SsoSignIn } from './sso-sign-in';

interface LoginFormProps {
  inviteCode?: string;
  showGoogle: boolean;
  showMicrosoft: boolean;
  showSso: boolean;
  /** `/auth?sso=<provider-id>`: start single sign-on with this provider right away. */
  ssoProviderId?: string;
  /** Device-agent sign-in: where to go once the one time password is verified. */
  deviceAuthRedirect?: string;
}

/**
 * Sign-in options, most to least preferred: single sign-on (configured per
 * organization in the app; the API resolves the provider from the email
 * domain), then a one time password by email, then the social providers
 * tucked under "More options".
 */
export function LoginForm({
  inviteCode,
  showGoogle,
  showMicrosoft,
  showSso,
  ssoProviderId,
  deviceAuthRedirect,
}: LoginFormProps) {
  const searchParams = useSearchParams();
  const [isSsoOpen, setIsSsoOpen] = useState(false);
  // A launcher deep link starts sign-in once per page load. SsoSignIn is
  // unmounted while the code entry step shows, so the flag lives here.
  const [deepLinkProviderId, setDeepLinkProviderId] = useState(ssoProviderId);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);

  const handleUseAnotherMethod = () => {
    setIsSsoOpen(false);
    setOtpEmail(null);
  };
  const handleDeepLinkStarted = () => setDeepLinkProviderId(undefined);

  // Shown whenever one option has taken over the form, to get back to all of them.
  const anotherMethodLink = (
    <Button variant="link" className="w-full h-11" onClick={handleUseAnotherMethod}>
      Use another method
    </Button>
  );

  if (otpEmail) {
    return (
      <div className="space-y-4">
        <OtpForm email={otpEmail} deviceAuthRedirect={deviceAuthRedirect} />
        {anotherMethodLink}
      </div>
    );
  }

  const moreOptionsList: ReactElement[] = [];
  if (showGoogle) {
    moreOptionsList.push(
      <GoogleSignIn key="google" inviteCode={inviteCode} searchParams={searchParams} />,
    );
  }
  if (showMicrosoft) {
    moreOptionsList.push(
      <MicrosoftSignIn key="microsoft" inviteCode={inviteCode} searchParams={searchParams} />,
    );
  }

  return (
    <div className="space-y-4">
      {showSso && (
        <SsoSignIn
          inviteCode={inviteCode}
          searchParams={searchParams}
          providerId={deepLinkProviderId}
          onAutoStart={handleDeepLinkStarted}
          open={isSsoOpen}
          onOpenChange={setIsSsoOpen}
        />
      )}

      {isSsoOpen ? (
        // One email field at a time: while the single sign-on form is open it
        // stands in for the other options until the user backs out.
        anotherMethodLink
      ) : (
        <>
          <OtpSignIn onOtpSent={setOtpEmail} />

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
