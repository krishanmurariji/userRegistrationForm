import { HttpErrorResponse } from '@angular/common/http';

export interface ApiError {
  /** Machine-readable code from the API, for example "invalid_credentials". */
  code: string;
  /** Message that can be shown to the user. */
  message: string;
}

/** Turns any failed API call into a code and a message fit to show on screen. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return { code: 'network', message: 'Cannot reach the server. Check your internet connection and try again.' };
    }
    if (error.status === 429) {
      return { code: 'rate_limited', message: 'Too many attempts. Please wait a minute and try again.' };
    }
    if (error.status === 404) {
      return { code: 'not_found', message: 'This is not available. It may have been removed, or you may not have access to it.' };
    }
    const body = error.error;
    if (body && typeof body === 'object') {
      if (typeof body.code === 'string' && typeof body.detail === 'string') {
        return { code: body.code, message: body.detail };
      }
      // Model validation errors: { errors: { Field: ["message", ...] } }
      if (body.errors && typeof body.errors === 'object') {
        const messages = Object.values(body.errors as Record<string, string[]>).flat();
        if (messages.length) return { code: 'validation', message: messages.join(' ') };
      }
    }
  }
  return { code: 'unknown', message: 'Something went wrong. Please try again.' };
}
