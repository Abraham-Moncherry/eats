export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return Response.json({ error: "Eats is not configured." }, { status: 503 });

  const requestUrl = new URL(request.url);
  const authorizationUrl = new URL("/auth/v1/oauth/authorize", supabaseUrl);
  authorizationUrl.search = requestUrl.search;
  const redirectUri = authorizationUrl.searchParams.get("redirect_uri");
  if (redirectUri) {
    const callback = new URL(redirectUri);
    if (callback.hostname === "chat.openai.com" && /^\/aip\/g-[a-z0-9]+\/oauth\/callback$/.test(callback.pathname)) {
      callback.hostname = "chatgpt.com";
      authorizationUrl.searchParams.set("redirect_uri", callback.toString());
    }
  }
  return Response.redirect(authorizationUrl, 302);
}
