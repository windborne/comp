import { env } from '@/env.mjs';
import type { SsoProvider } from '@/hooks/use-sso-providers';
import { serverApi } from '@/lib/api-server';
import { requireRoutePermission } from '@/lib/permissions.server';
import type { Metadata } from 'next';
import { SsoSettings } from './components/SsoSettings';

export default async function SsoSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  await requireRoutePermission('settings/sso', orgId);

  const res = await serverApi.get<{ data: SsoProvider[] }>('/v1/organization/sso-providers');

  return (
    <SsoSettings initialProviders={res.data?.data ?? []} portalUrl={env.NEXT_PUBLIC_PORTAL_URL} />
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Single sign-on',
  };
}
