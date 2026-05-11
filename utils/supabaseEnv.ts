/** Supabase 项目 URL（Vite 注入） */
export function getSupabaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL || '';
}

/**
 * 前端可用的「可公开」密钥：新版 `sb_publishable_...` 或旧版 JWT `anon`（eyJ...）
 * 见 https://supabase.com/docs/guides/api/api-keys
 */
export function getSupabasePublishableKey(): string {
  return (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    ''
  );
}

export function hasSupabaseClientConfig(): boolean {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}
