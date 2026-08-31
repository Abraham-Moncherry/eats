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

function mealSnapshotIngredients(meal: MealRow) {
  return meal.meal_ingredients.map((item) => ({ amount: item.amount, unit: item.unit, ingredient: item.ingredients }));
}

function success(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function failure(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional().describe("Date in YYYY-MM-DD format; defaults to today in Melbourne");
const mealInput = z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]).optional().describe("Meal category; defaults from the current time in Melbourne");

function melbourneMeal() {
  const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", hour: "2-digit", hour12: false }).format(new Date()));
  return hour < 11 ? "Breakfast" : hour < 16 ? "Lunch" : hour < 22 ? "Dinner" : "Snack";
}

export function createEatsMcpServer(db: SupabaseClient, userId: string) {
  const server = new McpServer({ name: "eats", version: "0.1.0" });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const writeOnly = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

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

  server.registerTool("log_food", {
    title: "Log a food or described meal",
    description: "Add a food entry after the user has confirmed its name and estimated nutrition. Use this for food identified from a photo or a natural-language description.",
    inputSchema: {
      name: z.string().trim().min(1).max(200).describe("Short, recognisable food or meal name"),
      calories: z.number().int().min(0).max(20000),
      protein: z.number().min(0).max(2000).default(0).describe("Protein in grams"),
      carbohydrates: z.number().min(0).max(3000).default(0).describe("Carbohydrates in grams"),
      fat: z.number().min(0).max(2000).default(0).describe("Fat in grams"),
      meal: mealInput,
      date: dateInput,
    },
    annotations: writeOnly,
  }, async ({ name, calories, protein, carbohydrates, fat, meal, date }) => {
    const entryDate = date ?? melbourneToday();
    const category = meal ?? melbourneMeal();
    const nutrition = roundMacros({ calories, protein, carbohydrates, fat });
    const { data, error } = await db.from("food_entries").insert({
      user_id: userId,
      name,
      meal: category,
      entry_date: entryDate,
      calories: Math.round(nutrition.calories),
      protein: Math.round(nutrition.protein),
      carbohydrates: nutrition.carbohydrates,
      fat: nutrition.fat,
      snapshot: { source: "chatgpt", nutrition_estimated: true },
    }).select("id,name,meal,entry_date,calories,protein,carbohydrates,fat").single();
    if (error) return failure(`Could not log the food: ${error.message}`);
    return success({ added: true, entry: data });
  });

  server.registerTool("log_saved_meal", {
    title: "Log a saved meal",
    description: "Add one of the user's saved Eats meals to their food log. Call list_meals first to find the exact meal ID.",
    inputSchema: {
      meal_id: z.string().uuid().describe("Exact saved meal ID returned by list_meals"),
      quantity: z.number().positive().max(20).default(1),
      meal: mealInput,
      date: dateInput,
    },
    annotations: writeOnly,
  }, async ({ meal_id, quantity, meal, date }) => {
    const { data, error } = await db.from("meals").select("id,name,notes,meal_ingredients(id,amount,unit,ingredients(name,brand,serving_amount,serving_unit,calories,protein,carbohydrates,fat))").eq("id", meal_id).maybeSingle();
    if (error) return failure(`Could not load the saved meal: ${error.message}`);
    if (!data) return failure("That saved meal was not found in this Eats account.");
    const savedMeal = data as unknown as MealRow;
    const baseNutrition = mealMacros(savedMeal);
    const nutrition = roundMacros(Object.fromEntries(Object.entries(baseNutrition).map(([key, value]) => [key, value * quantity])) as Macros);
    const entryDate = date ?? melbourneToday();
    const category = meal ?? melbourneMeal();
    const { data: entry, error: insertError } = await db.from("food_entries").insert({
      user_id: userId,
      name: savedMeal.name,
      meal: category,
      meal_name: savedMeal.name,
      entry_date: entryDate,
      calories: Math.round(nutrition.calories),
      protein: Math.round(nutrition.protein),
      carbohydrates: nutrition.carbohydrates,
      fat: nutrition.fat,
      snapshot: { meal: savedMeal.name, quantity, ingredients: mealSnapshotIngredients(savedMeal) },
    }).select("id,name,meal,entry_date,calories,protein,carbohydrates,fat").single();
    if (insertError) return failure(`Could not log the saved meal: ${insertError.message}`);
    return success({ added: true, quantity, entry });
  });

  server.registerTool("log_saved_routine", {
    title: "Log a saved routine",
    description: "Add every meal in one of the user's saved Eats routines. Call list_routines first to find the exact routine ID.",
    inputSchema: {
      routine_id: z.string().uuid().describe("Exact saved routine ID returned by list_routines"),
      date: dateInput,
    },
    annotations: writeOnly,
  }, async ({ routine_id, date }) => {
    const { data, error } = await db.from("routines").select("id,name,suggested_period,routine_meals(id,quantity,meals(id,name,notes,meal_ingredients(id,amount,unit,ingredients(name,brand,serving_amount,serving_unit,calories,protein,carbohydrates,fat))))").eq("id", routine_id).maybeSingle();
    if (error) return failure(`Could not load the saved routine: ${error.message}`);
    if (!data) return failure("That saved routine was not found in this Eats account.");
    const entryDate = date ?? melbourneToday();
    const category = data.suggested_period === "morning" ? "Breakfast" : data.suggested_period === "midday" ? "Lunch" : data.suggested_period === "evening" ? "Dinner" : melbourneMeal();
    const routineMeals = (data.routine_meals ?? []) as any[];
    if (!routineMeals.length) return failure("That routine does not contain any meals.");
    const rows = routineMeals.map((item) => {
      const savedMeal = item.meals as MealRow;
      const quantity = Number(item.quantity);
      const baseNutrition = mealMacros(savedMeal);
      const nutrition = roundMacros(Object.fromEntries(Object.entries(baseNutrition).map(([key, value]) => [key, value * quantity])) as Macros);
      return {
        user_id: userId,
        name: savedMeal.name,
        meal: category,
        meal_name: savedMeal.name,
        routine_name: data.name,
        entry_date: entryDate,
        calories: Math.round(nutrition.calories),
        protein: Math.round(nutrition.protein),
        carbohydrates: nutrition.carbohydrates,
        fat: nutrition.fat,
        snapshot: { routine: data.name, meal: savedMeal.name, quantity, ingredients: mealSnapshotIngredients(savedMeal) },
      };
    });
    const { data: entries, error: insertError } = await db.from("food_entries").insert(rows).select("id,name,meal,entry_date,calories,protein,carbohydrates,fat");
    if (insertError) return failure(`Could not log the saved routine: ${insertError.message}`);
    return success({ added: true, routine: data.name, date: entryDate, entries: entries ?? [] });
  });

  return server;
}
