import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/** Adds the access token to API calls and, when it has expired, refreshes it once and retries. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  if (!request.url.startsWith(environment.apiUrl) || auth.isPublicUrl(request.url)) {
    return next(request);
  }

  const send = () => {
    const token = auth.accessToken;
    return next(token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request);
  };

  return send().pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return from(auth.refresh()).pipe(switchMap((ok) => (ok ? send() : throwError(() => error))));
    }),
  );
};
