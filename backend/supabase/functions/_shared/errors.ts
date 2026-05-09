/**
 * Domain error type. Every Edge Function should throw `AppError` (or let one
 * bubble up); the top-level handler in each function catches it and turns it
 * into a JSON `fail()` response with the right HTTP status.
 *
 * Why a class instead of plain throws? So the wrapper can distinguish
 * expected business errors (return 4xx) from programming bugs (return 500).
 */

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Err = {
  badRequest:    (code: string, msg: string, details?: unknown) => new AppError(400, code, msg, details),
  unauthorized:  (msg = 'Authentication required')              => new AppError(401, 'unauthorized', msg),
  forbidden:     (msg = 'Forbidden')                            => new AppError(403, 'forbidden', msg),
  notFound:      (msg = 'Not found')                            => new AppError(404, 'not_found', msg),
  conflict:      (code: string, msg: string)                    => new AppError(409, code, msg),
  unprocessable: (code: string, msg: string, details?: unknown) => new AppError(422, code, msg, details),
  rateLimited:   (msg = 'Too many requests')                    => new AppError(429, 'rate_limited', msg),
  internal:      (msg = 'Internal error')                       => new AppError(500, 'internal_error', msg),
};
