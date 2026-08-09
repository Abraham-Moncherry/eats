export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!/^\d{6,14}$/.test(code)) {
    return Response.json({ error: "Invalid barcode" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=code,product_name,brands,serving_size,nutriments`,
      {
        cache: "no-store",
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
    return Response.json(body);
  } catch {
    return Response.json({ error: "Food database is unavailable" }, { status: 502 });
  }
}
