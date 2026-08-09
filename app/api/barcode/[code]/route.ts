export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!/^\d{6,14}$/.test(code)) {
    return Response.json({ error: "Invalid barcode" }, { status: 400 });
  }

  // Verified against the product label supplied by the user. Open Food Facts
  // identifies this product but currently has no macros for it.
  if (code === "5056307359315") {
    return Response.json({
      code,
      status: 1,
      product: {
        code,
        product_name: "Weight Gainer Blend",
        brands: "MYPROTEIN",
        serving_size: "100 g (3 1/3 scoops)",
        serving_quantity: 100,
        nutrition_data_per: "100g",
        nutriments: {
          "energy-kcal_100g": 392,
          proteins_100g: 31,
          carbohydrates_100g: 50,
          fat_100g: 6.2,
        },
      },
    });
  }

  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=code,product_name,brands,serving_size,serving_quantity,nutrition_data_per,nutriments`,
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
