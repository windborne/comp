import { LoginForm } from '@/app/components/login-form';
import { getAuthErrorMessage } from '@/app/lib/auth-errors';
import { parseSsoProviderIdParam } from '@/app/lib/sso-deep-link';
import { Alert } from '@trycompai/design-system';
import { ArrowRight } from '@trycompai/design-system/icons';
import { Button } from '@trycompai/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@trycompai/ui/card';
import { Icons } from '@trycompai/ui/icons';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Login | Comp AI',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const isDeviceAuth = params.device_auth === 'true';
  const callbackPort = typeof params.callback_port === 'string' ? params.callback_port : undefined;
  const state = typeof params.state === 'string' ? params.state : undefined;

  const deviceAuthRedirect =
    isDeviceAuth && callbackPort && state
      ? `/auth/device-callback?callback_port=${encodeURIComponent(callbackPort)}&state=${encodeURIComponent(state)}`
      : undefined;

  // Social providers are configured on the NestJS API.
  // Use optional env vars to explicitly disable them on the portal if needed.
  const showGoogle = process.env.PORTAL_DISABLE_GOOGLE_SIGN_IN !== 'true';
  const showMicrosoft = process.env.PORTAL_DISABLE_MICROSOFT_SIGN_IN !== 'true';
  // Single sign-on is configured per organization in the app; the API resolves
  // the provider from the email domain.
  const showSso = process.env.PORTAL_DISABLE_SSO_SIGN_IN !== 'true';
  // OAuth/SSO callbacks report failures here as ?error=<code>.
  const errorMessage = getAuthErrorMessage(params.error);
  // Identity-provider launcher tiles link here as ?sso=<provider-id>.
  const ssoProviderId = parseSsoProviderIdParam(params.sso);

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center space-y-3 pt-10">
            <Icons.Logo className="h-10 w-10 mx-auto" />
            <CardTitle className="text-2xl tracking-tight text-card-foreground">
              Employee Portal
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground px-4">
              {showSso
                ? "Sign in with your organization's single sign-on, or enter your work email to receive a one time password."
                : 'Enter your email address to receive a one time password.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pb-6">
            {errorMessage && (
              <Alert variant="destructive" title="Sign-in failed" description={errorMessage} />
            )}
            <LoginForm
              showGoogle={showGoogle}
              showMicrosoft={showMicrosoft}
              showSso={showSso}
              ssoProviderId={ssoProviderId}
              deviceAuthRedirect={deviceAuthRedirect}
            />
          </CardContent>
          <CardFooter className="pb-10">
            <div className="from-primary/10 via-primary/5 to-primary/5 rounded-sm bg-gradient-to-r p-4">
              <h3 className="text-sm font-medium">
                Comp AI - AI that handles compliance for you in hours.
              </h3>
              <p className="text-muted-foreground mt-1 text-xs">
                Comp AI makes SOC 2, ISO 27001, HIPAA and GDPR effortless. Eliminate compliance
                busywork, win more deals and accelerate growth.
              </p>
              <Button variant="link" className="mt-2 p-0" asChild>
                <Link
                  href="https://trycomp.ai"
                  target="_blank"
                  className="hover:underline hover:underline-offset-2"
                >
                  <span className="text-primary mt-2 inline-flex items-center gap-2 text-xs font-medium">
                    Learn More
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              </Button>
            </div>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
