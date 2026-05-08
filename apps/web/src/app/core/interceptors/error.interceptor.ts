import type { HttpInterceptorFn } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

// Surfaces backend errors as snackbars
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err) => {
      if (err instanceof HttpErrorResponse) {
        const apiError = err.error?.error;
        const message = apiError?.message ?? err.message ?? 'Request failed';

        if (err.status === 401) {
          router.navigate(['/connect']);
        } else if (err.status >= 400) {
          snackBar.open(message, 'Dismiss', { duration: 4000, panelClass: 'snack-error' });
        }
      }
      return throwError(() => err);
    }),
  );
};
