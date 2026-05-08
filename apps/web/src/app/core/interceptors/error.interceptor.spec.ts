import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  type HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let snackBar: { open: jasmine.Spy };
  let router: Router;

  beforeEach(() => {
    snackBar = { open: jasmine.createSpy('open') };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('routes 401 responses to /connect and does not surface a snackbar', (done) => {
    const navigateSpy = spyOn(router, 'navigate').and.resolveTo(true);

    http.get('/api/test').subscribe({
      next: () => done.fail('should have errored'),
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(401);
        expect(navigateSpy).toHaveBeenCalledWith(['/connect']);
        expect(snackBar.open).not.toHaveBeenCalled();
        done();
      },
    });

    httpMock
      .expectOne('/api/test')
      .flush(
        { error: { code: 'UNAUTHENTICATED', message: 'Session expired' } },
        { status: 401, statusText: 'Unauthorized' },
      );
  });

  it('shows a snackbar with the safeMessage from the body for non-401 errors', (done) => {
    http.get('/api/test').subscribe({
      next: () => done.fail('should have errored'),
      error: () => {
        expect(snackBar.open).toHaveBeenCalled();
        const [message, action] = snackBar.open.calls.mostRecent().args as [string, string];
        expect(message).toBe('Sync failed: rate limit');
        expect(action).toBe('Dismiss');
        done();
      },
    });

    httpMock
      .expectOne('/api/test')
      .flush(
        { error: { code: 'INTEGRATION', message: 'Sync failed: rate limit' } },
        { status: 502, statusText: 'Bad Gateway' },
      );
  });

  it('falls back to the HttpErrorResponse message when the body has no error envelope', (done) => {
    http.get('/api/test').subscribe({
      next: () => done.fail('should have errored'),
      error: () => {
        expect(snackBar.open).toHaveBeenCalled();
        const args = snackBar.open.calls.mostRecent().args as [string, string, unknown];
        expect(args[0]).toBeTruthy();
        done();
      },
    });

    httpMock.expectOne('/api/test').flush('plain-text-error', {
      status: 500,
      statusText: 'Server Error',
    });
  });
});
