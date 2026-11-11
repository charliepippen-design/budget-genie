// Deliberate redirects: guessed or legacy URLs go to the real page instead of a 404.
export const ROUTE_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  { from: '/dashboard', to: '/app' },
  { from: '/planner', to: '/app' },
  { from: '/demo', to: '/app' },
  { from: '/refund', to: '/refund-policy' },
  { from: '/sign-in', to: '/auth' },
  { from: '/signin', to: '/auth' },
  { from: '/login', to: '/auth' },
  { from: '/signup', to: '/sign-up' },
  { from: '/register', to: '/sign-up' },
];
