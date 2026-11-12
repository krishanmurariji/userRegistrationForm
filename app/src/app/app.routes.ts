import { Routes } from '@angular/router';
import { signedInGuard, signedOutGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [signedInGuard], loadComponent: () => import('./pages/home').then((m) => m.HomePage) },
  { path: 'login', canActivate: [signedOutGuard], loadComponent: () => import('./pages/login').then((m) => m.LoginPage) },
  { path: 'register', canActivate: [signedOutGuard], loadComponent: () => import('./pages/register').then((m) => m.RegisterPage) },
  { path: 'forgot-password', loadComponent: () => import('./pages/forgot-password').then((m) => m.ForgotPasswordPage) },
  { path: 'reset-password', loadComponent: () => import('./pages/reset-password').then((m) => m.ResetPasswordPage) },
  { path: 'confirm-email', loadComponent: () => import('./pages/confirm-email').then((m) => m.ConfirmEmailPage) },
  { path: '**', redirectTo: '' },
];
