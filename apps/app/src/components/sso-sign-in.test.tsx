import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignInSso = vi.fn();
vi.mock('@/utils/auth-client', () => ({
  authClient: { signIn: { sso: (...args: unknown[]) => mockSignInSso(...args) } },
}));

const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
}));

import { SsoSignIn } from './sso-sign-in';

describe('SsoSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInSso.mockResolvedValue({
      data: { url: 'https://idp.example.com', redirect: true },
      error: null,
    });
  });

  it('reveals the email form only after the user opts into single sign-on', () => {
    render(<SsoSignIn />);

    expect(screen.queryByPlaceholderText('name@company.com')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /continue with single sign-on/i }));
    expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument();
  });

  it('starts SSO for the entered email with app-rooted callback URLs', async () => {
    render(<SsoSignIn redirectTo="/org_1/policies" />);
    fireEvent.click(screen.getByRole('button', { name: /continue with single sign-on/i }));

    fireEvent.change(screen.getByPlaceholderText('name@company.com'), {
      target: { value: 'bob@acme.com' },
    });
    fireEvent.submit(screen.getByRole('form', { name: /single sign-on/i }));

    await waitFor(() => expect(mockSignInSso).toHaveBeenCalledTimes(1));
    const call = mockSignInSso.mock.calls[0][0] as {
      email: string;
      callbackURL: string;
      errorCallbackURL: string;
    };
    expect(call.email).toBe('bob@acme.com');
    // Absolute URLs rooted at the app so the API (a different origin) can
    // redirect back to the right place — and to /auth on failure, never to the API.
    expect(call.callbackURL).toBe(`${window.location.origin}/org_1/policies`);
    expect(call.errorCallbackURL).toBe(`${window.location.origin}/auth`);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('explains when no provider exists for the email domain', async () => {
    mockSignInSso.mockResolvedValue({
      data: null,
      error: { status: 404, message: 'No provider found for the issuer' },
    });
    render(<SsoSignIn />);
    fireEvent.click(screen.getByRole('button', { name: /continue with single sign-on/i }));

    fireEvent.change(screen.getByPlaceholderText('name@company.com'), {
      target: { value: 'bob@nowhere.com' },
    });
    fireEvent.submit(screen.getByRole('form', { name: /single sign-on/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));
    expect(mockToastError.mock.calls[0][0]).toMatch(/No single sign-on provider is set up/);
  });

  it('starts sign-in immediately for a provider deep link without asking for an email', async () => {
    render(<SsoSignIn providerId="windborne" />);

    expect(screen.getByText(/redirecting to your identity provider/i)).toBeInTheDocument();
    await waitFor(() => expect(mockSignInSso).toHaveBeenCalledTimes(1));
    const call = mockSignInSso.mock.calls[0][0] as { providerId?: string; email?: string };
    expect(call.providerId).toBe('windborne');
    expect(call.email).toBeUndefined();
    expect(screen.queryByPlaceholderText('name@company.com')).not.toBeInTheDocument();
  });

  it('falls back to the email form when the deep-linked provider cannot be used', async () => {
    mockSignInSso.mockResolvedValue({
      data: null,
      error: { status: 401, message: 'Provider domain has not been verified' },
    });
    render(<SsoSignIn providerId="windborne" />);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));
    expect(mockToastError.mock.calls[0][0]).toMatch(/not been verified/);
    expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument();
  });
});
