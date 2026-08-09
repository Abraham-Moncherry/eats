import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

type Macros = { calories: number; protein: number; carbohydrates: number; fat: number };
type IngredientRow = { name: string; brand: string | null; serving_amount: number; serving_unit: string; calories: number; protein: number; carbohydrates: number; fat: number };
type MealIngredientRow = { amount: number; unit: string; ingredients: IngredientRow | null };
type MealRow = { id: string; name: string; notes: string | null; meal_ingredients: MealIngredientRow[] };

const emptyMacros = (): Macros => ({ calories: 0, protein: 0, carbohydrates: 0, fat: 0 });
const rounded = (value: number) => Math.round(value * 10) / 10;
const roundMacros = (value: Macros) => Object.fromEntries(Object.entries(value).map(([key, amount]) => [key, rounded(amount)])) as Macros;

function melbourneToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function mealMacros(meal: MealRow) {
  return roundMacros(meal.meal_ingredients.reduce((total, item) => {
    const ingredient = item.ingredients;
    if (!ingredient || !ingredient.serving_amount) return total;
    const ratio = Number(item.amount) / Number(ingredient.serving_amount);
    total.calories += Number(ingredient.calories) * ratio;
    total.protein += Number(ingredient.protein) * ratio;
    total.carbohydrates += Number(ingredient.carbohydrates) * ratio;
    total.fat += Number(ingredient.fat) * ratio;
    return total;
  }, emptyMacros()));
}

function success(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function failure(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional().describe("Date in YYYY-MM-DD format; defaults to today in Melbourne");

export function createEatsMcpServer(db: SupabaseClient) {
  const server = new McpServer({ name: "eats", version: "0.1.0" });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  server.registerTool("get_daily_totals", {
    title: "Get daily nutrition totals",
    description: "Calculate calories, protein, carbohydrates, and fat logged on a date.",
    inputSchema: { date: dateInput },
    annotations: readOnly,
  }, async ({ date }) => {
    const selectedDate = date ?? melbourneToday();
    const { data, error } = await db.from("food_entries").select("calories,protein,carbohydrates,fat").eq("entry_date", selectedDate);
    if (error) return failure(`Could not load daily totals: ${error.message}`);
    const totals = (data ?? []).reduce((sum, row) => ({
      calories: sum.calories + Number(row.calories || 0), protein: sum.protein + Number(row.protein || 0),
      carbohydrates: sum.carbohydrates + Number(row.carbohydrates || 0), fat: sum.fat + Number(row.fat || 0),
    }), emptyMacros());
    return success({ date: selectedDate, entries: data?.length ?? 0, totals: roundMacros(totals) });
  });

  server.registerTool("get_food_log", {
    title: "Get food log",
    description: "List the meals and foods logged on a date, including their nutrition.",
    inputSchema: { date: dateInput },
    annotations: readOnly,
  }, async ({ date }) => {
    const selectedDate = date ?? melbourneToday();
    const { data, error } = await db.from("food_entries").select("id,name,meal,meal_name,routine_name,calories,protein,carbohydrates,fat,entry_date,created_at,snapshot").eq("entry_date", selectedDate).order("created_at");
    if (error) return failure(`Could not load the food log: ${error.message}`);
    return success({ date: selectedDate, entries: data ?? [] });
  });

  server.registerTool("list_meals", {
    title: "List saved meals",
    description: "List reusable Eats meals with ingredients, measurements, and calculated nutrition.",
    inputSchema: { search: z.string().trim().max(100).optional().describe("Optional meal-name search") },
    annotations: readOnly,
  }, async ({ search }) => {
    let query = db.from("meals").select("id,name,notes,meal_ingredients(id,amount,unit,ingredients(name,brand,serving_amount,serving_unit,calories,protein,carbohydrates,fat))").order("name");
    if (search) query = query.ilike("name", `%${search}%`);
    const { data, error } = await query;
    if (error) return failure(`Could not load meals: ${error.message}`);
    const meals = ((data ?? []) as unknown as MealRow[]).map((meal) => ({ ...meal, nutrition: mealMacros(meal) }));
    return success({ count: meals.length, meals });
  });

  server.registerTool("list_routines", {
    title: "List saved routines",
    description: "List reusable Eats routines, the meals inside them, and calculated nutrition.",
    inputSchema: { search: z.string().trim().max(100).optional().describe("Optional routine-name search") },
    annotations: readOnly,
  }, async ({ search }) => {
    let query = db.from("routines").select("id,name,suggested_period,routine_meals(id,quantity,meals(id,name,notes,meal_ingredients(id,amount,unit,ingredients(name,brand,serving_amount,serving_unit,calories,protein,carbohydrates,fat))))").order("name");
    if (search) query = query.ilike("name", `%${search}%`);
    const { data, error } = await query;
    if (error) return failure(`Could not load routines: ${error.message}`);
    const routines = (data ?? []).map((routine: any) => {
      const meals = (routine.routine_meals ?? []).map((item: any) => {
        const meal = item.meals as MealRow;
        return { quantity: Number(item.quantity), meal: { ...meal, nutrition: mealMacros(meal) } };
      });
      const nutrition = meals.reduce((sum: Macros, item: any) => {
        for (const key of Object.keys(sum) as (keyof Macros)[]) sum[key] += item.meal.nutrition[key] * item.quantity;
        return sum;
      }, emptyMacros());
      return { id: routine.id, name: routine.name, suggested_period: routine.suggested_period, meals, nutrition: roundMacros(nutrition) };
    });
    return success({ count: routines.length, routines });
  });

  return server;
}
