// Single tenant id for every stored token, cookie jar, and socket which
// is associated under this fixed ID. In a multitenant use case, we'd change
// the callers to reference the ID associated with a session.
export const SINGLETON_TENANT_ID = 'default';
