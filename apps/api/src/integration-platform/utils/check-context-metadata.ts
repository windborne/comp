/**
 * A connection's JSON metadata as check-context metadata. Checks read
 * provider-specific state from it (e.g. the Checkr candidates the background-
 * check sync linked to employees).
 */
export function checkContextMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return undefined;
  return Object.fromEntries(Object.entries(metadata));
}
