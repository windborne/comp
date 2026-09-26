/**
 * Checkr Integration Manifest
 *
 * Background checks. The check below reports on each candidate's current
 * report; the API's daily background-check sync (apps/api, Checkr only) keeps
 * each Comp member's background-check record in step with Checkr.
 *
 * Not a `sync` provider: that capability means employee (roster) sync.
 */

import type { IntegrationManifest } from '../../types';
import { checkrBackgroundChecksCheck } from './checks/background-checks';
import { CHECKR_API_BASE_URLS } from './checkr-reports';

export const checkrManifest: IntegrationManifest = {
  id: 'checkr',
  name: 'Checkr',
  description: "Keep each person's background check in sync with Checkr and flag reports that need attention",
  category: 'HR & People',
  logoUrl: 'https://img.logo.dev/checkr.com?token=pk_AZatYxV5QDSfWpRDaBxzRQ',
  docsUrl: 'https://docs.checkr.com',
  isActive: true,

  baseUrl: CHECKR_API_BASE_URLS.production,
  defaultHeaders: {
    Accept: 'application/json',
  },

  // Checkr uses HTTP Basic auth with the key as username and an empty password,
  // which `basic` auth rejects, so the check and sync build the header themselves.
  auth: {
    type: 'custom',
    config: {
      description: 'Connect with a Checkr secret API key (read-only use).',
      credentialFields: [
        {
          id: 'api_key',
          label: 'Secret API key',
          type: 'password',
          required: true,
          placeholder: 'Checkr secret API key',
          helpText: 'Checkr Dashboard > Account Settings > Developer Settings.',
        },
        {
          id: 'environment',
          label: 'Environment',
          type: 'select',
          required: false,
          helpText: 'Use Staging only for a Checkr test-mode key.',
          options: [
            { value: 'production', label: 'Production' },
            { value: 'staging', label: 'Staging (test mode)' },
          ],
        },
      ],
      setupInstructions: `To connect Checkr:
1. In the Checkr Dashboard, open Account Settings > Developer Settings.
2. Copy the secret API key (a test-mode key works with the Staging environment).
3. Paste it here. Comp only reads candidates and reports; it never orders checks.
After connecting, each person's background check on the People page is kept in step with Checkr daily.`,
    },
  },

  capabilities: ['checks'],
  checks: [checkrBackgroundChecksCheck],
};

export default checkrManifest;

export * from './types';
export * from './checkr-client';
export * from './checkr-reports';
