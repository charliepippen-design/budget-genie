import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
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

// MOCK_CLERK=1 npm run dev: local QA with a fake signed-in superuser (dev server only).
const mockClerk = process.env.MOCK_CLERK === '1';
if (mockClerk) process.env.ALLOW_ANON = 'true';

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => ({
  plugins: [
    react(),
    aiGatewayDev(mode),
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
      ...(mockClerk && command === 'serve'
        ? { '@clerk/clerk-react': path.resolve(__dirname, './src/dev/clerk-mock.tsx') }
        : {}),
    },
  },
  define:
    mockClerk && command === 'serve'
      ? { 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify('pk_test_qa_mock') }
      : {},
  build: {
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
