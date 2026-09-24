import { handleAIRequest } from './_gateway.js';

export function POST(request: Request) {
  return handleAIRequest(request);
}
