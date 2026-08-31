import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const categories = new Set(["Breakfast", "Lunch", "Dinner", "Snack"]);

function defaultMeal() {
  const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", hour: "2-digit", hour12: false }).format());
  return hour < 11 ? "Breakfast" : hour < 16 ? "Lunch" : hour < 22 ? "Dinner" : "Snack";
}

function today() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const numeric = (value: unknown, max: number, integer = false) => {
  const result = Math.min(max, Math.max(0, Number(value) || 0));
  return integer ? Math.round(result) : Math.round(result * 10) / 10;
};

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ error: "Eats is not configured." }, { status: 503 });
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Connect your Eats account to continue." }, { status: 401 });

  const db = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) return Response.json({ error: "Your Eats connection has expired. Please reconnect it." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (!name) return Response.json({ error: "A meal name is required." }, { status: 400 });
  const entryDate = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today();
  const meal = typeof body?.meal === "string" && categories.has(body.meal) ? body.meal : defaultMeal();
  const entry = {
    user_id: user.id, name, meal, entry_date: entryDate,
    calories: numeric(body?.calories, 20_000, true), protein: numeric(body?.protein, 2_000),
    carbohydrates: numeric(body?.carbohydrates, 3_000), fat: numeric(body?.fat, 2_000),
    snapshot: { source: "chatgpt", nutrition_estimated: true, reviewed_by_user: true },
  };
  const { data, error } = await db.from("food_entries").insert(entry).select("id,name,meal,entry_date,calories,protein,carbohydrates,fat").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ added: true, entry: data });
}
