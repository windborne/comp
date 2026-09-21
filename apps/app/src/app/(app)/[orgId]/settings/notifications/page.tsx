import { EMPTY_ZULIP_SETTINGS, type ZulipSettings as ZulipSettingsData } from '@/hooks/use-zulip-integration';
import { serverApi } from '@/lib/api-server';
import { Stack } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { RoleNotificationSettings } from './components/RoleNotificationSettings';
import { ZulipSettings } from './components/ZulipSettings';
import type { RoleNotificationConfig } from './data/getRoleNotificationSettings';

export default async function NotificationsSettings({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  const [roleRes, zulipRes] = await Promise.all([
    serverApi.get<{ data: RoleNotificationConfig[] }>('/v1/organization/role-notifications'),
    serverApi.get<ZulipSettingsData>('/v1/organization/zulip'),
  ]);

  const settings = roleRes.data?.data ?? [];
  const zulipSettings = zulipRes.data ?? EMPTY_ZULIP_SETTINGS;

  return (
    <Stack gap="lg">
      <RoleNotificationSettings initialSettings={settings} />
      <ZulipSettings initialSettings={zulipSettings} />
    </Stack>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Notification Settings',
  };
}
