import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);
// The session is kept in local storage and its access token is refreshed in the
// background, so a signed-in device stays signed in until it explicitly signs out.
export const supabase = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
    })
  : null;

export async function getCurrentSession(timeoutMs = 6000) {
  if (!supabase) return null;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("The sign-in check took too long. Please try again.")), timeoutMs);
  });

  try {
    const { data, error } = await Promise.race([supabase.auth.getSession(), timeout]);
    if (error) throw error;
    return data.session;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL;
  const value = (typeof window !== "undefined" ? window.location.origin : undefined) || configured || vercel || "http://localhost:3000";
  return value.startsWith("http") ? value : `https://${value}`;
}
