import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from "path"

// Serves api/ai-gateway locally so `npm run dev` works without `vercel dev`.
// Server-only env (GEMINI_API_KEY) is read from .env.local and never exposed to the bundle.
function aiGatewayDev(mode: string): Plugin {
    return {
        name: 'ai-gateway-dev',
        configureServer(server) {
            const env = loadEnv(mode, process.cwd(), '')
            // process.env stringifies undefined, so only copy keys that exist
            for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'VITE_CLERK_PUBLISHABLE_KEY']) {
                if (env[key] && !process.env[key]) process.env[key] = env[key]
            }
            // Local dev has no real sign-in unless a Clerk key is set
            if (!/^pk_(live|test)_/.test(env.VITE_CLERK_PUBLISHABLE_KEY ?? '')) process.env.ALLOW_ANON = 'true'

            server.middlewares.use('/api/ai-gateway', async (req, res) => {
                const chunks: Buffer[] = []
                for await (const chunk of req) chunks.push(chunk as Buffer)
                const { handleAIRequest } = await server.ssrLoadModule('/api/_gateway.ts')
                const response: Response = await handleAIRequest(new Request('http://localhost/api/ai-gateway', {
                    method: req.method,
                    headers: req.headers as Record<string, string>,
                    body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
                }))
                res.statusCode = response.status
                res.setHeader('Content-Type', response.headers.get('Content-Type') ?? 'application/json')
                res.end(await response.text())
            })
        },
    }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
    server: {
        host: true, // binds to 0.0.0.0
    },
    plugins: [react(), aiGatewayDev(mode)],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
}))
