-- Migration 0001: initial schema for CHTV.
--
-- This is the single source of truth for the database. It bundles what was
-- previously split across 0001/0002/0003/0004. No channels are seeded — the
-- app is BYOM3U: users import playlists at runtime.
--
-- Schema summary:
--   categories  — taxonomy aligned to the iptv-org standard (display names ES)
--   playlists   — optional grouping for channels imported as a batch
--   channels    — playable streams; may belong to a playlist or stay manual
--   users       — single-admin auth metadata (the API key lives in a Worker secret)

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT
);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- 31 categories: 30 standard iptv-org slugs (in English to match group-title
-- imports) + display names in Spanish, plus our non-standard "reality".
INSERT INTO categories (name, slug, icon) VALUES
  ('Deportes',        'sports',        'fa-futbol'),
  ('Reality',         'reality',       'fa-tv'),
  ('Noticias',        'news',          'fa-newspaper'),
  ('Películas',       'movies',        'fa-film'),
  ('Música',          'music',         'fa-music'),
  ('Niños',           'kids',          'fa-child'),
  ('Entretenimiento', 'entertainment', 'fa-tv'),
  ('Documentales',    'documentary',   'fa-video'),
  ('Series',          'series',        'fa-clapperboard'),
  ('General',         'general',       'fa-globe'),
  ('Cocina',          'cooking',       'fa-utensils'),
  ('Religión',        'religious',     'fa-place-of-worship'),
  ('Educación',       'education',     'fa-graduation-cap'),
  ('Cultura',         'culture',       'fa-landmark'),
  ('Negocios',        'business',      'fa-briefcase'),
  ('Estilo de vida',  'lifestyle',     'fa-spa'),
  ('Animación',       'animation',     'fa-pen-nib'),
  ('Comedia',         'comedy',        'fa-face-laugh'),
  ('Ciencia',         'science',       'fa-flask'),
  ('Aire libre',      'outdoor',       'fa-tree'),
  ('Viajes',          'travel',        'fa-plane'),
  ('Clima',           'weather',       'fa-cloud-sun'),
  ('Pública',         'public',        'fa-building-columns'),
  ('Familia',         'family',        'fa-people-roof'),
  ('Auto',            'auto',          'fa-car'),
  ('Clásicos',        'classic',       'fa-clock-rotate-left'),
  ('Interactivos',    'interactive',   'fa-hand-pointer'),
  ('Legislativo',     'legislative',   'fa-scale-balanced'),
  ('Relax',           'relax',         'fa-leaf'),
  ('Compras',         'shop',          'fa-bag-shopping'),
  ('Adultos',         'xxx',           'fa-eye-slash');

-- ---------------------------------------------------------------------------
-- Playlists (hybrid model — optional grouping for batch-imported channels)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'm3u',
  is_direct INTEGER NOT NULL DEFAULT 1,
  default_category_id INTEGER,
  default_country TEXT,
  channel_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT,
  last_sync_status TEXT,
  auto_sync INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (default_category_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_playlists_source ON playlists(source);
CREATE INDEX IF NOT EXISTS idx_playlists_auto_sync ON playlists(auto_sync);

-- ---------------------------------------------------------------------------
-- Channels
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  stream_url TEXT NOT NULL,
  logo_url TEXT,
  category_id INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Multi-source import metadata (was 0003)
  source TEXT NOT NULL DEFAULT 'manual',
  is_direct INTEGER NOT NULL DEFAULT 0,
  country TEXT,
  language TEXT,
  tvg_id TEXT,
  group_title TEXT,
  tags TEXT,
  -- Hybrid model links (was 0004)
  playlist_id INTEGER,
  iptv_org_id TEXT,
  -- Error tracking: bumped by /api/channels/:id/report-error from the public
  -- player when a manifest fails. When it reaches a threshold the channel is
  -- auto-deactivated so dead streams stop being recommended.
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_channels_slug ON channels(slug);
CREATE INDEX IF NOT EXISTS idx_channels_category ON channels(category_id);
CREATE INDEX IF NOT EXISTS idx_channels_active ON channels(is_active);
CREATE INDEX IF NOT EXISTS idx_channels_source ON channels(source);
CREATE INDEX IF NOT EXISTS idx_channels_country ON channels(country);
CREATE INDEX IF NOT EXISTS idx_channels_language ON channels(language);
CREATE INDEX IF NOT EXISTS idx_channels_playlist ON channels(playlist_id);
CREATE INDEX IF NOT EXISTS idx_channels_iptv_org ON channels(iptv_org_id);

-- ---------------------------------------------------------------------------
-- Users (single-admin metadata; the actual API key is a Worker secret)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
