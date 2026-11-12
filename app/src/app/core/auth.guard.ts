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
