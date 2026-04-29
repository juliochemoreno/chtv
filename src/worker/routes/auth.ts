import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { hashPassword, verifyPassword, signJwt, verifyJwt } from '../lib/auth';

export const authRouter = new Hono<{ Bindings: Env }>({ strict: false });

authRouter.post('/register', async (c) => {
  const body = await c.req.json<{ email: string; username: string; password: string }>();
  if (!body.email || !body.username || !body.password) {
    return c.json({ error: 'email, username, password required' }, 400);
  }
  const existing = await c.env.DB
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .bind(body.username, body.email)
    .first();
  if (existing) return c.json({ error: 'Username or email already registered' }, 400);

  const password_hash = await hashPassword(body.password);
  const result = await c.env.DB
    .prepare('INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)')
    .bind(body.email, body.username, password_hash).run();
  const userId = result.meta.last_row_id;
  const user = await c.env.DB
    .prepare('SELECT id, email, username, is_active, created_at FROM users WHERE id = ?')
    .bind(userId).first();
  const token = await signJwt({ sub: body.username }, c.env.JWT_SECRET);
  return c.json({ access_token: token, token_type: 'bearer', user });
});

authRouter.post('/login', async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  if (!body.username || !body.password) return c.json({ error: 'username, password required' }, 400);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(body.username).first<User>();
  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  const token = await signJwt({ sub: user.username }, c.env.JWT_SECRET);
  const { password_hash, ...safeUser } = user;
  return c.json({ access_token: token, token_type: 'bearer', user: safeUser });
});

authRouter.get('/me', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Missing bearer token' }, 401);
  const payload = await verifyJwt(auth.slice('Bearer '.length).trim(), c.env.JWT_SECRET);
  if (!payload?.sub) return c.json({ error: 'Invalid token' }, 401);
  const user = await c.env.DB
    .prepare('SELECT id, email, username, is_active, created_at FROM users WHERE username = ?')
    .bind(payload.sub).first();
  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json(user);
});
