export const dynamic = "force-dynamic";

function metadata(request: Request) {
  const origin = new URL(request.url).origin;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return Response.json({ error: "Supabase is not configured" }, { status: 503 });
  return Response.json({ resource: `${origin}/mcp`, authorization_servers: [`${supabaseUrl}/auth/v1`] }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = metadata;
