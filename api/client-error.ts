import path from 'node:path';
import { decodeStack } from './_decode-stack.js';

const MAX_BODY_BYTES = 32 * 1024;
const FIELDS = ['buildId', 'section', 'message', 'stack', 'componentStack', 'url', 'userAgent', 'ts'] as const;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function handleClientError(request: Request, mapDir = path.join(process.cwd(), '.sourcemaps')) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return json(413, { error: 'Body too large' });

  let text: string;
  try {
    text = await request.text();
  } catch {
    return json(400, { error: 'Unreadable body' });
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { error: 'Body too large' });

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return json(400, { error: 'Invalid shape' });

  const record = data as Record<string, unknown>;
  const report: Record<string, string> = {};
  for (const field of FIELDS) {
    const value = record[field];
    if (typeof value !== 'string') return json(400, { error: `Invalid field: ${field}` });
    report[field] = value;
  }

  const decodedStack = decodeStack(report.stack, mapDir);
  console.error(
    JSON.stringify({
      type: 'client-error',
      ...report,
      ...(decodedStack !== report.stack ? { decodedStack } : {}),
    })
  );
  return new Response(null, { status: 204 });
}

export function POST(request: Request) {
  return handleClientError(request);
}
