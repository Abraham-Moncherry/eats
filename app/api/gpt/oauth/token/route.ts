export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return Response.json({ error: "Eats is not configured." }, { status: 503 });

  const body = new URLSearchParams(await request.text());
  const redirectUri = body.get("redirect_uri");
  if (redirectUri) {
    const callback = new URL(redirectUri);
    if (callback.hostname === "chat.openai.com" && /^\/aip\/g-[a-z0-9]+\/oauth\/callback$/.test(callback.pathname)) {
      callback.hostname = "chatgpt.com";
      body.set("redirect_uri", callback.toString());
    }
  }
  const response = await fetch(new URL("/auth/v1/oauth/token", supabaseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
