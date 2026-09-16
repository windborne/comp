import { HttpException, HttpStatus } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'http';

/**
 * Forward only the credentials better-auth needs to resolve the caller's
 * session when the NestJS API invokes a better-auth endpoint server-side.
 */
export function toBetterAuthHeaders(headers: IncomingHttpHeaders): Headers {
  const forwarded = new Headers();
  if (typeof headers.cookie === 'string') {
    forwarded.set('cookie', headers.cookie);
  }
  if (typeof headers.authorization === 'string') {
    forwarded.set('authorization', headers.authorization);
  }
  return forwarded;
}

interface BetterAuthApiErrorLike {
  statusCode: number;
  message: string;
  body?: { message?: string; code?: string };
}

/** better-auth throws better-call `APIError`s: an HTTP status plus a JSON body. */
export function isBetterAuthApiError(
  error: unknown,
): error is BetterAuthApiErrorLike {
  if (typeof error !== 'object' || error === null) return false;
  return typeof (error as { statusCode?: unknown }).statusCode === 'number';
}

/**
 * Surface better-auth failures (validation, "providerId already exists",
 * discovery errors, DNS verification failures…) with their own HTTP status and
 * message instead of collapsing everything into a 500.
 */
export function mapBetterAuthError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;

  if (isBetterAuthApiError(error)) {
    const status =
      Number.isInteger(error.statusCode) &&
      error.statusCode >= 400 &&
      error.statusCode < 600
        ? error.statusCode
        : HttpStatus.INTERNAL_SERVER_ERROR;
    return new HttpException(
      {
        statusCode: status,
        message:
          error.body?.message ||
          error.message ||
          'Single sign-on request failed',
        ...(error.body?.code ? { code: error.body.code } : {}),
      },
      status,
    );
  }

  return new HttpException(
    {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Single sign-on request failed',
    },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}

export async function callBetterAuth<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw mapBetterAuthError(error);
  }
}
