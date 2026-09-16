import { describe, expect, it } from 'vitest';
import { getAuthErrorMessage, getSsoSignInErrorMessage } from './auth-errors';

describe('getAuthErrorMessage', () => {
  it('returns null when no error is present', () => {
    expect(getAuthErrorMessage(undefined)).toBeNull();
    expect(getAuthErrorMessage('')).toBeNull();
    expect(getAuthErrorMessage('   ')).toBeNull();
  });

  it('maps better-auth codes regardless of separators and case', () => {
    // better-auth reports this one with spaces ("account not linked").
    expect(getAuthErrorMessage('account not linked')).toMatch(/cannot be linked/);
    expect(getAuthErrorMessage('ACCOUNT_NOT_LINKED')).toMatch(/cannot be linked/);
    expect(getAuthErrorMessage(['invalid_state'])).toMatch(/session expired/);
    expect(getAuthErrorMessage('access_denied')).toMatch(/cancelled/);
  });

  it('recognises the domain fence errors raised by the API hooks', () => {
    expect(
      getAuthErrorMessage(
        "Single sign-on identities must use an email address under the provider's verified domain (acme.com)",
      ),
    ).toMatch(/outside your organization's verified domain/);
    expect(getAuthErrorMessage('Provider domain has not been verified')).toMatch(
      /not been verified/,
    );
  });

  it('never echoes unknown (attacker-controlled) text back to the page', () => {
    const message = getAuthErrorMessage('Call 555-0100 to unlock your account');
    expect(message).toBe('Sign-in failed. Please try again.');
    expect(message).not.toContain('555');
  });
});

describe('getSsoSignInErrorMessage', () => {
  it('explains a missing provider and an unverified domain', () => {
    expect(getSsoSignInErrorMessage({ status: 404 })).toMatch(/No single sign-on provider/);
    expect(getSsoSignInErrorMessage({ status: 401 })).toMatch(/not been verified/);
  });

  it('shows validation messages and falls back generically otherwise', () => {
    expect(getSsoSignInErrorMessage({ status: 400, message: 'callbackURL is required' })).toBe(
      'callbackURL is required',
    );
    expect(getSsoSignInErrorMessage({ status: 500 })).toMatch(/Could not start single sign-on/);
    expect(getSsoSignInErrorMessage(null)).toMatch(/Could not start single sign-on/);
  });
});
