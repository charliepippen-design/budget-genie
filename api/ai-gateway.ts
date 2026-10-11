import { handleAIRequest } from './_gateway.js';
import { withQuotaGuard } from './_quota.js';

const guarded = withQuotaGuard(handleAIRequest);

export function POST(request: Request) {
  return guarded(request);
}
