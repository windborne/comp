import type { ZulipSettings as ZulipSettingsData } from '@/hooks/use-zulip-integration';
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

vi.mock('@/hooks/use-zulip-integration', () => ({
  useZulipIntegration: (options?: { initialData?: ZulipSettingsData }) => ({
    settings: options?.initialData,
    isLoading: false,
    error: null,
    mutate: vi.fn(),
    saveSettings: vi.fn(),
    removeSettings: vi.fn(),
    sendTestMessage: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@trycompai/design-system', () => ({
  Button: ({ children, disabled, onClick, loading, type, ...props }: any) => (
    <button type={type} disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Field: ({ children }: any) => <div>{children}</div>,
  FieldDescription: ({ children }: any) => <p>{children}</p>,
  FieldError: ({ children }: any) => (children ? <p role="alert">{children}</p> : null),
  FieldLabel: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
  HStack: ({ children }: any) => <div>{children}</div>,
  Input: (props: any) => <input {...props} />,
  Section: ({ title, description, actions, children }: any) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      {actions}
      {children}
    </section>
  ),
  Stack: ({ children }: any) => <div>{children}</div>,
  Switch: ({ checked, disabled, onCheckedChange, id }: any) => (
    <input
      id={id}
      type="checkbox"
      role="switch"
      checked={checked}
      disabled={disabled}
      onChange={(e: any) => onCheckedChange(e.target.checked)}
    />
  ),
  Text: ({ children }: any) => <p>{children}</p>,
}));

import { ZulipSettings } from './ZulipSettings';

const notConfigured: ZulipSettingsData = {
  configured: false,
  enabled: false,
  siteUrl: null,
  botEmail: null,
  updatedAt: null,
};

const configured: ZulipSettingsData = {
  configured: true,
  enabled: true,
  siteUrl: 'https://chat.example.com',
  botEmail: 'comp-bot@chat.example.com',
  updatedAt: '2026-09-21T00:00:00.000Z',
};

describe('ZulipSettings permission gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets an admin connect Zulip', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    render(<ZulipSettings initialSettings={notConfigured} />);

    expect(screen.getByText(/not connected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect zulip/i })).toBeEnabled();
    expect(screen.getByLabelText(/zulip server url/i)).toBeEnabled();
    expect(screen.getByLabelText(/bot api key/i)).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('button', { name: /test message/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /disconnect/i })).not.toBeInTheDocument();
  });

  it('shows the connection and lets an admin test or disconnect it', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    render(<ZulipSettings initialSettings={configured} />);

    expect(screen.getByText(/connected to https:\/\/chat\.example\.com/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/zulip server url/i)).toHaveValue('https://chat.example.com');
    expect(screen.getByLabelText(/bot email/i)).toHaveValue('comp-bot@chat.example.com');
    expect(screen.getByLabelText(/bot api key/i)).toHaveValue('');
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /test message/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeEnabled();
  });

  it('is read-only for a user without organization:update', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    render(<ZulipSettings initialSettings={configured} />);

    expect(screen.getByLabelText(/zulip server url/i)).toBeDisabled();
    expect(screen.getByLabelText(/bot email/i)).toBeDisabled();
    expect(screen.getByLabelText(/bot api key/i)).toBeDisabled();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /test message/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /disconnect/i })).not.toBeInTheDocument();
  });
});
