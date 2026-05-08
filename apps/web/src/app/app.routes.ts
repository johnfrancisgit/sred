import type { Routes } from '@angular/router';
import { connectedGuard } from './core/guards/connected.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'explorer' },
  {
    path: 'connect',
    loadComponent: () => import('./features/connect/connect.page').then((m) => m.ConnectPage),
    title: 'Connect — SRED Explorer',
  },
  {
    path: 'explorer',
    canActivate: [connectedGuard],
    loadComponent: () => import('./features/explorer/explorer.page').then((m) => m.ExplorerPage),
    title: 'Explorer — SRED',
  },
  { path: '**', redirectTo: 'explorer' },
];
