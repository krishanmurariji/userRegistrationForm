import { Routes } from '@angular/router';
import { signedInGuard, signedOutGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [signedInGuard], loadComponent: () => import('./pages/home').then((m) => m.HomePage) },
  { path: 'account', canActivate: [signedInGuard], loadComponent: () => import('./pages/account').then((m) => m.AccountPage) },
  { path: 'shops/new', canActivate: [signedInGuard], loadComponent: () => import('./pages/shop-form').then((m) => m.ShopFormPage) },
  { path: 'shops/:shopId', canActivate: [signedInGuard], loadComponent: () => import('./pages/shop').then((m) => m.ShopPage) },
  { path: 'shops/:shopId/edit', canActivate: [signedInGuard], loadComponent: () => import('./pages/shop-form').then((m) => m.ShopFormPage) },
  { path: 'shops/:shopId/categories', canActivate: [signedInGuard], loadComponent: () => import('./pages/categories').then((m) => m.CategoriesPage) },
  { path: 'shops/:shopId/items/new', canActivate: [signedInGuard], loadComponent: () => import('./pages/item-form').then((m) => m.ItemFormPage) },
  { path: 'shops/:shopId/items/:itemId', canActivate: [signedInGuard], loadComponent: () => import('./pages/item-form').then((m) => m.ItemFormPage) },
  { path: 'login', canActivate: [signedOutGuard], loadComponent: () => import('./pages/login').then((m) => m.LoginPage) },
  { path: 'register', canActivate: [signedOutGuard], loadComponent: () => import('./pages/register').then((m) => m.RegisterPage) },
  { path: 'forgot-password', loadComponent: () => import('./pages/forgot-password').then((m) => m.ForgotPasswordPage) },
  { path: 'reset-password', loadComponent: () => import('./pages/reset-password').then((m) => m.ResetPasswordPage) },
  { path: 'confirm-email', loadComponent: () => import('./pages/confirm-email').then((m) => m.ConfirmEmailPage) },
  { path: '**', redirectTo: '' },
];
