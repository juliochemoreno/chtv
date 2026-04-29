export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  JWT_SECRET: string;
  ADMIN_API_KEY: string;
};

export type Channel = {
  id: number;
  name: string;
  slug: string;
  stream_url: string;
  logo_url: string | null;
  category_id: number;
  is_active: number;
  created_at: string;
  // Added in migration 0003 (multi-source imports)
  source: string;
  is_direct: number;
  country: string | null;
  language: string | null;
  tvg_id: string | null;
  group_title: string | null;
  tags: string | null;
  // Added in migration 0004 (hybrid model)
  playlist_id: number | null;
  iptv_org_id: string | null;
  // Auto-deactivation tracking (player reports + health checks)
  error_count: number;
  last_error_at: string | null;
};

export type Category = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
};

export type Playlist = {
  id: number;
  name: string;
  url: string;
  source: string;
  is_direct: number;
  default_category_id: number | null;
  default_country: string | null;
  channel_count: number;
  last_synced_at: string | null;
  last_sync_status: string | null;
  auto_sync: number;
  created_at: string;
};

export type PlaylistInput = {
  name?: string;
  url?: string;
  source?: string;
  is_direct?: boolean | number;
  default_category_id?: number | null;
  default_country?: string | null;
  auto_sync?: boolean | number;
};

export type User = {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  is_active: number;
  created_at: string;
};
