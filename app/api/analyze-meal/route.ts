import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "calories", "protein", "carbohydrates", "fat", "meal", "confidence", "note"],
  properties: {
    name: { type: "string" },
    calories: { type: "number" },
    protein: { type: "number" },
    carbohydrates: { type: "number" },
    fat: { type: "number" },
    meal: { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Snack"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    note: { type: "string" },
  },
};

function suggestedMeal() {
  const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", hour: "2-digit", hour12: false }).format());
  return hour < 11 ? "Breakfast" : hour < 16 ? "Lunch" : hour < 22 ? "Dinner" : "Snack";
}

function number(value: unknown, max: number) {
  return Math.min(max, Math.max(0, Math.round(Number(value) || 0)));
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!apiKey) return Response.json({ error: "Meal analysis is not configured yet. Add OPENAI_API_KEY to the server environment, then try again." }, { status: 503 });
  if (!url || !key) return Response.json({ error: "Supabase is not configured." }, { status: 503 });

  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Please sign in before analysing a meal." }, { status: 401 });
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: { user }, error: authError } = await auth.auth.getUser(token);
  if (authError || !user) return Response.json({ error: "Your sign-in session has expired. Please sign in again." }, { status: 401 });

  let body: { description?: unknown; imageDataUrl?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Please send a valid meal description or image." }, { status: 400 }); }
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) : "";
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  if (!description && !imageDataUrl) return Response.json({ error: "Add a photo or describe what you ate first." }, { status: 400 });
  if (imageDataUrl && (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl) || imageDataUrl.length > 8_000_000)) return Response.json({ error: "Use a JPG, PNG, or WebP image under 6 MB." }, { status: 400 });

  const content: Array<Record<string, string>> = [{ type: "input_text", text: `Estimate one edible meal from this ${imageDataUrl ? "food photo" : "description"}. ${description ? `The person says: ${description}` : ""} Return an honest single-serving estimate. Never present nutrition as certain. Use the likely Melbourne-time meal category as a weak hint only: ${suggestedMeal()}.` }];
  if (imageDataUrl) content.push({ type: "input_image", image_url: imageDataUrl, detail: "low" });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MEAL_MODEL ?? "gpt-5-mini",
      instructions: "You are Eats' careful nutrition estimator. Identify the food and estimate calories and macros for the visible or described portion. Return only the requested JSON. If uncertain, choose low confidence and explain the assumption briefly in note.",
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "meal_estimate", strict: true, schema: MEAL_SCHEMA } },
    }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    return Response.json({ error: detail?.error?.message ?? "Meal analysis could not be completed." }, { status: response.status });
  }
  const result = await response.json() as { output_text?: string };
  try {
    const estimate = JSON.parse(result.output_text ?? "{}");
    return Response.json({
      name: String(estimate.name ?? "Meal").slice(0, 200),
      calories: number(estimate.calories, 20_000), protein: number(estimate.protein, 2_000),
      carbohydrates: number(estimate.carbohydrates, 3_000), fat: number(estimate.fat, 2_000),
      meal: ["Breakfast", "Lunch", "Dinner", "Snack"].includes(estimate.meal) ? estimate.meal : suggestedMeal(),
      confidence: ["low", "medium", "high"].includes(estimate.confidence) ? estimate.confidence : "low",
      note: String(estimate.note ?? "Estimate only — review the values before adding.").slice(0, 300),
    });
  } catch {
    return Response.json({ error: "The meal estimate was incomplete. Please try again." }, { status: 502 });
  }
}
