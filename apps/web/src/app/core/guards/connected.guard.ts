import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { IntegrationsApi } from '../api/integrations.api';

// Blocks the explorer route until an Airtable integration is connected
export const connectedGuard: CanActivateFn = async () => {
  const api = inject(IntegrationsApi);
  const router = inject(Router);

  const { integrations } = await api.list();
  if (integrations[0]?.status === 'connected') return true;
  return router.parseUrl('/connect');
};
