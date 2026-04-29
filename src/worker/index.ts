import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { channelsRouter } from './routes/channels';
import { categoriesRouter } from './routes/categories';
import { streamsRouter } from './routes/streams';
import { authRouter } from './routes/auth';
import { proxyRouter } from './routes/proxy';
import { logosRouter } from './routes/logos';
import { playlistsRouter } from './routes/playlists';
import { scrapeRouter } from './routes/scrape';
import type { Env } from './lib/types';

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.use(
  '/api/*',
  cors({
    origin: (origin) => origin ?? '*',
    allowHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
);

app.get('/api/health', (c) => c.json({ status: 'ok' }));
app.get('/api/', (c) => c.json({ message: 'tv-stream API v1.0' }));

app.route('/api/channels', channelsRouter);
app.route('/api/categories', categoriesRouter);
app.route('/api/streams', streamsRouter);
app.route('/api/auth', authRouter);
app.route('/api/p', proxyRouter);
app.route('/api/logos', logosRouter);
app.route('/api/playlists', playlistsRouter);
app.route('/api/import/scrape', scrapeRouter);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
