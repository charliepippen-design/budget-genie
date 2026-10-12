// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { matchPath } from 'react-router-dom';
import { AUTH_ROUTE_PATTERNS, SIGN_IN_PATH, SIGN_UP_PATH } from './auth-routes';

const matches = (pathname: string) => AUTH_ROUTE_PATTERNS.some((p) => matchPath(p, pathname));

describe('auth route config', () => {
  it('matches the base paths and Clerk multi-step sub-paths', () => {
    for (const p of [
      '/auth',
      '/auth/factor-one',
      '/auth/sso-callback',
      '/sign-up',
      '/sign-up/verify-email-address',
      '/sign-up/continue',
    ]) {
      expect(matches(p), p).toBe(true);
    }
  });

  it('does not swallow unrelated paths', () => {
    expect(matches('/authors')).toBe(false);
    expect(matches('/app')).toBe(false);
  });

  it('keeps sign-in and sign-up on distinct paths', () => {
    expect(SIGN_IN_PATH).not.toBe(SIGN_UP_PATH);
  });
});
