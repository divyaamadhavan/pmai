import { Response } from 'express';

export interface ApiSuccess<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    message: string;
    code: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data, error: null } satisfies ApiSuccess<T>);
}

export function fail(
  res: Response,
  message: string,
  code = 'INTERNAL_ERROR',
  status = 500
): void {
  res.status(status).json({ data: null, error: { message, code } } satisfies ApiError);
}

export function notFound(res: Response, message = 'Resource not found'): void {
  fail(res, message, 'NOT_FOUND', 404);
}

export function badRequest(res: Response, message: string): void {
  fail(res, message, 'BAD_REQUEST', 400);
}

export function unauthorized(res: Response, message = 'Unauthorized'): void {
  fail(res, message, 'UNAUTHORIZED', 401);
}

export function forbidden(res: Response, message = 'Forbidden'): void {
  fail(res, message, 'FORBIDDEN', 403);
}
