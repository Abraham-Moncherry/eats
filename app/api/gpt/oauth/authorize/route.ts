export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return Response.json({ error: "Eats is not configured." }, { status: 503 });

  const authorizationUrl = new URL("/auth/v1/oauth/authorize", supabaseUrl);
  authorizationUrl.search = new URL(request.url).search;
  return Response.redirect(authorizationUrl, 302);
}
