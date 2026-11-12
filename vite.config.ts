import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { visualizer } from 'rollup-plugin-visualizer';

// Serves api/ai-gateway locally so `npm run dev` works without `vercel dev`.
// Server-only env (GEMINI_API_KEY) is read from .env.local and never exposed to the bundle.
function aiGatewayDev(mode: string): Plugin {
  return {
    name: 'ai-gateway-dev',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '');
      // process.env stringifies undefined, so only copy keys that exist
      for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'VITE_CLERK_PUBLISHABLE_KEY', 'ALLOW_ANON']) {
        if (env[key] && !process.env[key]) process.env[key] = env[key];
      }

      server.middlewares.use('/api/ai-gateway', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const { handleAIRequest } = await server.ssrLoadModule('/api/_gateway.ts');
        const response: Response = await handleAIRequest(
          new Request('http://localhost/api/ai-gateway', {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          })
        );
        res.statusCode = response.status;
        res.setHeader('Content-Type', response.headers.get('Content-Type') ?? 'application/json');
        res.end(await response.text());
      });
    },
  };
}

// Build id shown in crash reports: Vercel's commit SHA (system variable, read only) or a local stamp.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA
  ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)
  : `local-${new Date().toISOString()}`;

// Sourcemaps are built hidden and moved out of the output dir, so no .map is ever served as a static
// file. api/client-error.ts reads them from .sourcemaps/ to decode crash stacks.
function moveSourcemaps(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'move-sourcemaps',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      root = config.root;
    },
    closeBundle() {
      const target = path.resolve(root, '.sourcemaps');
      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(target, { recursive: true });
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith('.map')) {
            fs.copyFileSync(full, path.join(target, entry.name));
            fs.rmSync(full);
          }
        }
      };
      if (fs.existsSync(outDir)) walk(outDir);
    },
  };
}

// MOCK_CLERK=1 only: a stand-in for api/projects.ts and api/share.ts, so cloud save and share links
// can be seen locally without a login or the real Blob store. One fake account; data is kept in
// node_modules/.cache so links survive a restart. Never part of a build.
function localCloudDev(): Plugin {
  const file = path.resolve(process.cwd(), 'node_modules/.cache/mediaplanner-local-cloud.json');
  type Store = { doc: { projects: unknown[]; deleted: unknown[]; updatedAt: string | null }; rev: number; shares: Record<string, Record<string, unknown>> };
  let store: Store = { doc: { projects: [], deleted: [], updatedAt: null }, rev: 0, shares: {} };
  try {
    store = JSON.parse(fs.readFileSync(file, 'utf8')) as Store;
  } catch {
    // first run: start empty
  }
  const persist = () => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(store));
    } catch {
      // read-only disk: keep it in memory
    }
  };
  const etag = () => (store.rev > 0 ? `"local-${store.rev}"` : null);
  const readBody = async (req: AsyncIterable<unknown>) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  return {
    name: 'local-cloud-dev',
    configureServer(server) {
      server.middlewares.use('/api/projects', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method === 'GET') return send(200, { version: 1, ...store.doc, etag: etag() });
        if (req.method !== 'PUT') return send(405, { error: 'Method not allowed.' });
        const ifMatch = req.headers['if-match'];
        if (ifMatch && ifMatch !== etag()) return send(409, { error: 'Your projects changed on another device. Sync again.' });
        const body = await readBody(req);
        if (!body || !Array.isArray(body.projects)) return send(400, { error: 'Invalid projects document.' });
        store.doc = { projects: body.projects, deleted: Array.isArray(body.deleted) ? body.deleted : [], updatedAt: new Date().toISOString() };
        store.rev += 1;
        persist();
        return send(200, { ok: true, updatedAt: store.doc.updatedAt, etag: etag() });
      });

      server.middlewares.use('/api/share', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        const id = new URL(req.url ?? '', 'http://localhost').searchParams.get('id') ?? '';
        const missing = { error: 'This shared plan does not exist or was removed.' };
        if (req.method === 'POST') {
          const body = await readBody(req);
          if (!body || typeof body.mediaPlanState !== 'object' || !body.mediaPlanState) return send(400, { error: 'Invalid plan.' });
          const newId = crypto.randomBytes(16).toString('base64url');
          const plan = body.mediaPlanState as Record<string, unknown>;
          store.shares[newId] = {
            version: 1,
            id: newId,
            createdAt: new Date().toISOString(),
            name: typeof body.name === 'string' ? body.name : 'Media plan',
            mediaPlanState: plan,
            currency: typeof body.currency === 'string' ? body.currency : 'EUR',
            vertical: body.vertical ?? plan.onboardingVertical ?? null,
          };
          persist();
          return send(200, { id: newId });
        }
        if (req.method === 'GET') return store.shares[id] ? send(200, store.shares[id]) : send(404, missing);
        if (req.method === 'DELETE') {
          if (!store.shares[id]) return send(404, missing);
          delete store.shares[id];
          persist();
          return send(200, { ok: true });
        }
        return send(405, { error: 'Method not allowed.' });
      });
    },
  };
}

// MOCK_CLERK=1 npm run dev: local QA with a fake signed-in superuser (dev server only).
// `vite build --mode qa` with MOCK_CLERK=1 also uses it, for the prod-build e2e (test:e2e:prod).
// A normal `npm run build` never does.
const mockClerk = process.env.MOCK_CLERK === '1';
const useClerkMock = (command: string, mode: string) =>
  process.env.MOCK_CLERK === '1' && (command === 'serve' || (command === 'build' && mode === 'qa'));
if (mockClerk) process.env.ALLOW_ANON = 'true';

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => ({
  plugins: [
    react(),
    aiGatewayDev(mode),
    mockClerk && command === 'serve' && localCloudDev(),
    moveSourcemaps(),
    mode === 'analyze' &&
      visualizer({
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
        open: false,
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...(useClerkMock(command, mode)
        ? { '@clerk/clerk-react': path.resolve(__dirname, './src/dev/clerk-mock.tsx') }
        : {}),
    },
  },
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    ...(useClerkMock(command, mode)
      ? { 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify('pk_test_qa_mock') }
      : {}),
  },
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // Only React itself gets a manual vendor chunk (every page needs it). Rollup pulls the
        // unassigned dependencies of a manual chunk into it, so the previous charts/ui/data groups
        // dragged shared helpers (e.g. clsx) along and made the landing page download recharts.
        // Everything else is left to Rollup, which keeps charts and other heavy libraries in the
        // lazily loaded chunks that actually use them.
        manualChunks(id) {
          if (/\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id))
            return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
}));
