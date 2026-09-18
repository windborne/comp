import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignInSso = vi.fn();
vi.mock('@/utils/auth-client', () => ({
  authClient: {
    signIn: {
      sso: (...args: unknown[]) => mockSignInSso(...args),
      magicLink: vi.fn(),
      social: vi.fn(),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { LoginForm } from './login-form';

const allProviders = { showGoogle: true, showGithub: true, showMicrosoft: true };
const noProviders = { showGoogle: false, showGithub: false, showMicrosoft: false };

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
const emailInput = () => screen.getByPlaceholderText('name@example.com');
const emailButton = () => screen.getByRole('button', { name: /continue with email/i });
const moreOptions = () => screen.getByRole('button', { name: /more options/i });

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInSso.mockResolvedValue({
      data: { url: 'https://idp.example.com', redirect: true },
      error: null,
    });
  });

  it('offers single sign-on first, email second and social providers under "More options"', () => {
    render(<LoginForm {...allProviders} />);

    expectInDocumentOrder(ssoButton(), emailInput(), emailButton(), moreOptions());
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument();

    fireEvent.click(moreOptions());

    expectInDocumentOrder(
      moreOptions(),
      screen.getByRole('button', { name: /continue with google/i }),
      screen.getByRole('button', { name: /continue with microsoft/i }),
      screen.getByRole('button', { name: /continue with github/i }),
    );
  });

  it('drops "More options" when no social provider is configured', () => {
    render(<LoginForm {...noProviders} />);

    expectInDocumentOrder(ssoButton(), emailInput(), emailButton());
    expect(screen.queryByRole('button', { name: /more options/i })).not.toBeInTheDocument();
  });

  it('shows only the single sign-on form while it is open, with a way back', () => {
    render(<LoginForm {...allProviders} />);
    fireEvent.click(ssoButton());

    // One email field at a time.
    expect(ssoEmailInput()).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('name@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more options/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /use another method/i }));

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
    expect(screen.queryByPlaceholderText('name@example.com')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /use another method/i }));

    // Not stuck on "Redirecting…": the idle button is back above the email form.
    expect(screen.queryByText(/redirecting to your identity provider/i)).not.toBeInTheDocument();
    expectInDocumentOrder(ssoButton(), emailInput(), moreOptions());
  });

  it('reports a failed sign-in above the options', () => {
    render(
      <LoginForm {...allProviders} errorMessage="Your identity provider rejected the sign-in." />,
    );

    expectInDocumentOrder(screen.getByText('Sign-in failed'), ssoButton());
  });
});
