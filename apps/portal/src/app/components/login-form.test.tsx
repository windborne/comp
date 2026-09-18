import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignInSso = vi.fn();
const mockSendVerificationOtp = vi.fn();
vi.mock('@/app/lib/auth-client', () => ({
  authClient: {
    signIn: {
      sso: (...args: unknown[]) => mockSignInSso(...args),
      social: vi.fn(),
      emailOtp: vi.fn(),
    },
    emailOtp: {
      sendVerificationOtp: (...args: unknown[]) => mockSendVerificationOtp(...args),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

// The code entry step has its own behaviour; here it only has to appear with the right props.
vi.mock('./otp-form', () => ({
  OtpForm: ({ email, deviceAuthRedirect }: { email: string; deviceAuthRedirect?: string }) => (
    <div data-testid="otp-form">
      code for {email}
      {deviceAuthRedirect ? ` then ${deviceAuthRedirect}` : ''}
    </div>
  ),
}));

import { LoginForm } from './login-form';

const allProviders = { showGoogle: true, showMicrosoft: true, showSso: true };

/** Asserts that the elements appear in the DOM in the given order. */
function expectInDocumentOrder(...elements: HTMLElement[]) {
  elements.slice(1).forEach((element, index) => {
    const previous = elements[index];
    expect(
      previous.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
      `expected "${element.textContent}" to follow "${previous.textContent}"`,
    ).toBeTruthy();
  });
}

const ssoButton = () => screen.getByRole('button', { name: /continue with single sign-on/i });
const ssoEmailInput = () => screen.queryByPlaceholderText('name@company.com');
const emailInput = () => screen.getByPlaceholderText('Your work email');
const emailButton = () => screen.getByRole('button', { name: /continue with email/i });
const moreOptions = () => screen.getByRole('button', { name: /more options/i });
const useAnotherMethod = () => screen.getByRole('button', { name: /use another method/i });

describe('LoginForm (portal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInSso.mockResolvedValue({
      data: { url: 'https://idp.example.com', redirect: true },
      error: null,
    });
    mockSendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('offers single sign-on first, email second and social providers under "More options"', () => {
    render(<LoginForm {...allProviders} />);

    expectInDocumentOrder(ssoButton(), emailInput(), emailButton(), moreOptions());
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument();
    // Touch target: at least 40px tall on mobile.
    expect(moreOptions()).toHaveClass('h-10');

    fireEvent.click(moreOptions());

    expectInDocumentOrder(
      moreOptions(),
      screen.getByRole('button', { name: /continue with google/i }),
      screen.getByRole('button', { name: /continue with microsoft/i }),
    );
  });

  it('starts with the email form when single sign-on is disabled', () => {
    render(<LoginForm {...allProviders} showSso={false} />);

    expect(
      screen.queryByRole('button', { name: /continue with single sign-on/i }),
    ).not.toBeInTheDocument();
    expectInDocumentOrder(emailInput(), emailButton(), moreOptions());
  });

  it('drops "More options" when no social provider is configured', () => {
    render(<LoginForm showGoogle={false} showMicrosoft={false} showSso />);

    expectInDocumentOrder(ssoButton(), emailInput(), emailButton());
    expect(screen.queryByRole('button', { name: /more options/i })).not.toBeInTheDocument();
  });

  it('shows only the single sign-on form while it is open, with a way back', () => {
    render(<LoginForm {...allProviders} />);
    fireEvent.click(ssoButton());

    // One email field at a time.
    expect(ssoEmailInput()).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Your work email')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more options/i })).not.toBeInTheDocument();

    fireEvent.click(useAnotherMethod());

    expect(ssoEmailInput()).not.toBeInTheDocument();
    expectInDocumentOrder(ssoButton(), emailInput(), moreOptions());
  });

  it('shows only the code entry step once a one time password was sent, with a way back', async () => {
    const deviceAuthRedirect = '/auth/device-callback?callback_port=4321&state=abc';
    render(<LoginForm {...allProviders} deviceAuthRedirect={deviceAuthRedirect} />);

    fireEvent.change(emailInput(), { target: { value: 'sam@acme.com' } });
    fireEvent.click(emailButton());

    await waitFor(() =>
      expect(mockSendVerificationOtp).toHaveBeenCalledWith({
        email: 'sam@acme.com',
        type: 'sign-in',
      }),
    );
    const codeStep = await screen.findByTestId('otp-form');
    expect(codeStep).toHaveTextContent(`code for sam@acme.com then ${deviceAuthRedirect}`);
    expect(
      screen.queryByRole('button', { name: /continue with single sign-on/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more options/i })).not.toBeInTheDocument();

    fireEvent.click(useAnotherMethod());

    expect(screen.queryByTestId('otp-form')).not.toBeInTheDocument();
    expectInDocumentOrder(ssoButton(), emailInput(), moreOptions());
  });

  it('starts a deep link once per page load, even after the code entry step is dismissed', async () => {
    mockSignInSso.mockResolvedValue({
      data: null,
      error: { status: 401, message: 'Provider domain has not been verified' },
    });
    render(<LoginForm {...allProviders} ssoProviderId="windborne" />);

    await waitFor(() => expect(ssoEmailInput()).toBeInTheDocument());
    fireEvent.click(useAnotherMethod());

    // Send a code, then come back from the code entry step: SsoSignIn remounts.
    fireEvent.change(emailInput(), { target: { value: 'sam@acme.com' } });
    fireEvent.click(emailButton());
    await screen.findByTestId('otp-form');
    fireEvent.click(useAnotherMethod());

    expect(mockSignInSso).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/redirecting to your identity provider/i)).not.toBeInTheDocument();
    expect(ssoEmailInput()).not.toBeInTheDocument();
    expectInDocumentOrder(ssoButton(), emailInput(), moreOptions());
  });

  it('keeps a provider deep link on top while it redirects', async () => {
    render(<LoginForm {...allProviders} ssoProviderId="windborne" />);

    expectInDocumentOrder(
      screen.getByText(/redirecting to your identity provider/i),
      emailInput(),
      moreOptions(),
    );

    await waitFor(() => expect(mockSignInSso).toHaveBeenCalledTimes(1));
    expect(mockSignInSso.mock.calls[0][0]).toMatchObject({ providerId: 'windborne' });
  });

  it('falls back to the single sign-on form when the deep link fails, and can back out of it', async () => {
    mockSignInSso.mockResolvedValue({
      data: null,
      error: { status: 401, message: 'Provider domain has not been verified' },
    });
    render(<LoginForm {...allProviders} ssoProviderId="windborne" />);

    await waitFor(() => expect(ssoEmailInput()).toBeInTheDocument());
    expect(screen.queryByPlaceholderText('Your work email')).not.toBeInTheDocument();

    fireEvent.click(useAnotherMethod());

    // Not stuck on "Redirecting…": the idle button is back above the email form.
    expect(screen.queryByText(/redirecting to your identity provider/i)).not.toBeInTheDocument();
    expectInDocumentOrder(ssoButton(), emailInput(), moreOptions());
  });
});
