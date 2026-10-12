// Single source of truth for Clerk path routing. Clerk appends sub-paths such as
// /auth/factor-one or /sign-up/verify-email-address, so both routes must be splats.
export const SIGN_IN_PATH = '/auth';
export const SIGN_UP_PATH = '/sign-up';
export const AFTER_AUTH_URL = '/app';

export const AUTH_ROUTE_PATTERNS = [`${SIGN_IN_PATH}/*`, `${SIGN_UP_PATH}/*`] as const;
