import { createBrowserClient } from "@supabase/ssr";

// TODO: re-add <Database> generic once types are generated via
// `supabase gen types typescript --linked > lib/supabase/types.ts`.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
