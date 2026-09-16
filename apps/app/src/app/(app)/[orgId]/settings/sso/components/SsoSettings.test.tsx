import type { SsoProvider } from '@/hooks/use-sso-providers';
import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    permissions: {},
    hasPermission: mockHasPermission,
  }),
}));

vi.mock('@/hooks/use-sso-providers', () => ({
  useSsoProviders: (options?: { initialData?: unknown[] }) => ({
    providers: options?.initialData ?? [],
    isLoading: false,
    error: null,
    mutate: vi.fn(),
    createProvider: vi.fn(),
    deleteProvider: vi.fn(),
    requestDomainVerification: vi.fn(),
    verifyDomain: vi.fn(),
  }),
}));

vi.mock('./AddSsoProviderSheet', () => ({
  AddSsoProviderSheet: () => <div data-testid="add-sso-provider-sheet" />,
}));

vi.mock('./DomainVerificationPanel', () => ({
  DomainVerificationPanel: () => <div data-testid="domain-verification-panel" />,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { SsoSettings } from './SsoSettings';

const verifiedProvider: SsoProvider = {
  id: 'sso_1',
  providerId: 'acme',
  issuer: 'https://login.acme.com',
  domain: 'acme.com',
  domainVerified: true,
  clientId: 'client-123',
  scopes: ['openid', 'profile', 'email'],
  pkce: true,
  discoveryEndpoint: null,
  redirectUri: 'https://api.trycomp.ai/api/auth/sso/callback/acme',
  createdAt: '2026-09-15T00:00:00.000Z',
  updatedAt: '2026-09-15T00:00:00.000Z',
};

describe('SsoSettings permission gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets an admin add and remove providers', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    render(<SsoSettings initialProviders={[verifiedProvider]} />);

    expect(screen.getByRole('button', { name: /add provider/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
    expect(screen.getByText('acme.com')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('hides mutations from a read-only user but still shows the provider', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    render(<SsoSettings initialProviders={[verifiedProvider]} />);

    expect(screen.queryByRole('button', { name: /add provider/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.getByText('acme.com')).toBeInTheDocument();
  });

  it('shows the pending state and verification panel for an unverified domain', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    render(<SsoSettings initialProviders={[{ ...verifiedProvider, domainVerified: false }]} />);

    expect(screen.getByText('Pending domain verification')).toBeInTheDocument();
    expect(screen.getByTestId('domain-verification-panel')).toBeInTheDocument();
  });

  it('renders an empty state without an add button for users who cannot manage SSO', () => {
    setMockPermissions({});
    render(<SsoSettings initialProviders={[]} />);

    expect(screen.getByText('No identity provider connected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add provider/i })).not.toBeInTheDocument();
  });
});
