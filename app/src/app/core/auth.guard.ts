import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Pages for signed-in users. Others are sent to sign in and brought back afterwards. */
export const signedInGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(AuthService).isSignedIn()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Sign-in and sign-up pages. Signed-in users go straight to the home page. */
export const signedOutGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).isSignedIn() ? router.createUrlTree(['/']) : true;
};

/** The admin section. Anyone else is sent to their own home page. */
export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).isAdmin() ? true : router.createUrlTree(['/']);
};

/** Shop management pages, for accounts the admin has made shop owners. */
export const shopOwnerGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).isShopOwner() ? true : router.createUrlTree(['/']);
};

/**
 * Customer pages: browsing, cart, orders. Shop owners and the admin are different kinds of account and have
 * their own home, so they are sent there instead.
 */
export const customerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAdmin()) return router.createUrlTree(['/admin']);
  if (auth.isShopOwner()) return router.createUrlTree(['/my-shops']);
  return true;
};
