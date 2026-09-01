import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const upstreamCacheSeconds = 60 * 60;
const upstreamTimeoutMs = 5_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!/^\d{6,14}$/.test(code)) {
    return Response.json({ error: "Invalid barcode" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ error: "Eats is not configured." }, { status: 503 });

  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Sign in to Eats before looking up a barcode." }, { status: 401 });
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) return Response.json({ error: "Your Eats session has expired. Please sign in again." }, { status: 401 });

  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=code,product_name,brands,serving_size,serving_quantity,nutrition_data_per,nutriments`,
      {
        next: { revalidate: upstreamCacheSeconds },
        signal: AbortSignal.timeout(upstreamTimeoutMs),
        headers: { "User-Agent": "eats/0.1 personal nutrition tracker" },
      },
    );
    if (!response.ok) {
      return Response.json({ error: "Food database lookup failed" }, { status: 502 });
    }
    const body = await response.json();
    if (!body.product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }
    const product = body.product as Record<string, unknown>;
    return Response.json({ product: {
      code: product.code,
      product_name: product.product_name,
      brands: product.brands,
      serving_size: product.serving_size,
      serving_quantity: product.serving_quantity,
      nutrition_data_per: product.nutrition_data_per,
      nutriments: product.nutriments,
    } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return Response.json({ error: "Food database lookup timed out" }, { status: 504 });
    }
    return Response.json({ error: "Food database is unavailable" }, { status: 502 });
  }
}
