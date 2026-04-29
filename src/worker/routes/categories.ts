import { Hono } from 'hono';
import type { Env, Category } from '../lib/types';

export const categoriesRouter = new Hono<{ Bindings: Env }>({ strict: false });

categoriesRouter.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM categories ORDER BY name').all<Category>();
  // Categories are seeded once and rarely change — aggressive cache.
  c.header(
    'Cache-Control',
    'public, max-age=300, stale-while-revalidate=3600',
  );
  return c.json(results ?? []);
});
