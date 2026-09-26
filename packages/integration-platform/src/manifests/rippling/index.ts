/**
 * Rippling Integration Manifest
 *
 * This integration connects to Rippling to sync employee data.
 * It does NOT use the checks system - instead, the People page's employee
 * sync reads Rippling's worker list with the connection's API key.
 */

import type { IntegrationManifest } from '../../types';

export const ripplingManifest: IntegrationManifest = {
  id: 'rippling',
  name: 'Rippling',
  description: 'Sync employees from Rippling to your organization members',
  category: 'HR & People',
  logoUrl: 'https://img.logo.dev/rippling.com?token=pk_AZatYxV5QDSfWpRDaBxzRQ',
  docsUrl: 'https://developer.rippling.com',
  isActive: true,

  // Customer-created API key (no Rippling partner app needed). Rippling's REST
  // API takes it as a Bearer token; the employee sync reads it via
  // getRipplingBearerToken (apps/api), which also accepts legacy OAuth tokens.
  auth: {
    type: 'custom',
    config: {
      description: 'Connect with a Rippling API key.',
      credentialFields: [
        {
          id: 'api_key',
          label: 'API key',
          type: 'password',
          required: true,
          placeholder: 'Rippling API key',
          helpText:
            'Create it as a Rippling admin with read access to Workers. It inherits your permissions plus the scopes you select.',
        },
      ],
      setupInstructions: `To connect Rippling:
1. Sign in to Rippling as an admin who can see every employee.
2. Create an API key for the Rippling REST API (see developer.rippling.com, "API Tokens and Permissions").
3. Give it read access to Workers. Comp only reads the worker list.
4. Paste the key here.
The key inherits the permissions of the admin who created it, so create it from an account that will stay active.`,
    },
  },

  // V2 REST API base URL (different from V1 platform API)
  baseUrl: 'https://rest.ripplingapis.com',
  defaultHeaders: {
    'Content-Type': 'application/json',
  },

  // Sync capability - this integration syncs employee data
  capabilities: ['sync'],

  // Rippling is an HRIS — the authoritative source of truth for who works
  // at the company. Phase 2 deactivation is intentionally allowed: when a
  // worker is offboarded in Rippling they should be deactivated in Comp AI.
  isDirectorySource: true,

  services: [
    { id: 'employee-sync', name: 'Employee Sync', description: 'Sync employees from Rippling to organization members', enabledByDefault: true, implemented: true },
    { id: 'device-management', name: 'Device Management', description: 'Monitor device compliance and enrollment status', implemented: false },
  ],

  // No checks defined - custom UI handles the sync
  checks: [],
};

export default ripplingManifest;

// Re-export types for external use
export * from './types';
