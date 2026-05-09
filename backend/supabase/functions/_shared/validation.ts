/**
 * Hand-rolled validation helpers. No schema library on either side of the
 * boundary (see ADR-001). Each helper returns either the parsed value or
 * an `Invalid` sentinel; the Validator collects sentinels into a field-level
 * details payload and throws `AppError(422, ...)` when the builder runs.
 */

import { Err } from './errors.ts';

type Issues = Record<string, string>;

/**
 * Sentinel returned by check functions when validation fails. We use a class
 * (instead of bare strings) so checks whose success type IS string can be
 * distinguished from checks that errored.
 */
export class Invalid {
  constructor(public readonly message: string) {}
}

const fail = (message: string): Invalid => new Invalid(message);

class Validator {
  private issues: Issues = {};

  field<T>(name: string, value: unknown, check: (v: unknown) => T | Invalid): T | undefined {
    const result = check(value);
    if (result instanceof Invalid) {
      this.issues[name] = result.message;
      return undefined;
    }
    return result;
  }

  done<T>(builder: () => T): T {
    if (Object.keys(this.issues).length > 0) {
      throw Err.unprocessable('validation_failed', 'Invalid input', this.issues);
    }
    return builder();
  }
}

export function validator(): Validator {
  return new Validator();
}

// ── reusable field checks ─────────────────────────────────────────────────────
export const check = {
  string: (opts: { min?: number; max?: number; required?: boolean } = {}) =>
    (v: unknown): string | Invalid => {
      if (v === undefined || v === null || v === '') {
        return opts.required ? fail('required') : '';
      }
      if (typeof v !== 'string') return fail('must be a string');
      if (opts.min !== undefined && v.length < opts.min) return fail(`min length ${opts.min}`);
      if (opts.max !== undefined && v.length > opts.max) return fail(`max length ${opts.max}`);
      return v;
    },

  uuid: (opts: { required?: boolean } = {}) =>
    (v: unknown): string | Invalid => {
      if (v === undefined || v === null || v === '') {
        return opts.required ? fail('required') : '';
      }
      if (typeof v !== 'string') return fail('must be a uuid');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
        return fail('must be a uuid');
      }
      return v;
    },

  email: () =>
    (v: unknown): string | Invalid => {
      if (typeof v !== 'string') return fail('required');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return fail('must be an email');
      return v.toLowerCase();
    },

  enum: <T extends string>(values: readonly T[]) =>
    (v: unknown): T | Invalid => {
      if (typeof v !== 'string' || !values.includes(v as T)) {
        return fail(`must be one of: ${values.join(', ')}`);
      }
      return v as T;
    },

  number: (opts: { min?: number; max?: number; integer?: boolean } = {}) =>
    (v: unknown): number | Invalid => {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
      if (!Number.isFinite(n)) return fail('must be a number');
      if (opts.integer && !Number.isInteger(n)) return fail('must be an integer');
      if (opts.min !== undefined && n < opts.min) return fail(`min ${opts.min}`);
      if (opts.max !== undefined && n > opts.max) return fail(`max ${opts.max}`);
      return n;
    },

  /** numeric(12,2) — Indian rupees with paise. Stored as JS number; backend will round at write-time. */
  money: () =>
    (v: unknown): number | Invalid => {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
      if (!Number.isFinite(n)) return fail('must be a number');
      if (n < 0) return fail('must be ≥ 0');
      if (n > 9_999_999_999.99) return fail('exceeds numeric(12,2) range');
      // Round to paise to defend against float imprecision before it hits Postgres.
      return Math.round(n * 100) / 100;
    },

  /** Indian GSTIN — 15 chars, format: 22AAAAA0000A1Z5 */
  gstin: (opts: { required?: boolean } = {}) =>
    (v: unknown): string | Invalid => {
      if (v === undefined || v === null || v === '') {
        return opts.required ? fail('required') : '';
      }
      if (typeof v !== 'string') return fail('must be a string');
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v)) {
        return fail('invalid GSTIN format');
      }
      return v;
    },

  array: <T>(itemCheck: (v: unknown) => T | Invalid, opts: { min?: number; max?: number } = {}) =>
    (v: unknown): T[] | Invalid => {
      if (!Array.isArray(v)) return fail('must be an array');
      if (opts.min !== undefined && v.length < opts.min) return fail(`min ${opts.min} items`);
      if (opts.max !== undefined && v.length > opts.max) return fail(`max ${opts.max} items`);
      const out: T[] = [];
      for (let i = 0; i < v.length; i++) {
        const r = itemCheck(v[i]);
        if (r instanceof Invalid) return fail(`item[${i}]: ${r.message}`);
        out.push(r);
      }
      return out;
    },
};

/** Parse JSON body safely — returns 400 if not valid JSON. */
export async function parseJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw Err.badRequest('invalid_json', 'Request body must be valid JSON');
  }
}
