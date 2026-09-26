import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

type Macros = { calories: number; protein: number; carbohydrates: number; fat: number };
type IngredientRow = { id: string; name: string; brand: string | null; barcode?: string | null; serving_amount: number; serving_unit: string; calories: number; protein: number; carbohydrates: number; fat: number; source?: string };
type MealIngredientRow = { id?: string; amount: number; unit: string; ingredients: IngredientRow | null };
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
const unitInput = z.enum(["g", "ml", "item", "scoop", "tsp", "tbsp", "serving"]);
const macroInput = z.number().min(0).max(3_000);
const ingredientItemInput = z.object({
  ingredient_id: z.string().uuid().describe("Ingredient ID returned by list_ingredients or create_ingredient"),
  amount: z.number().positive().max(100_000).describe("Amount used in the meal"),
  unit: unitInput.describe("Unit for the amount"),
});

function melbourneMeal() {
  const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", hour: "2-digit", hour12: false }).format(new Date()));
  return hour < 11 ? "Breakfast" : hour < 16 ? "Lunch" : hour < 22 ? "Dinner" : "Snack";
}

export function createEatsMcpServer(db: SupabaseClient, userId: string) {
  const server = new McpServer({ name: "eats", version: "0.1.0" });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const writeOnly = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
  const destructiveWrite = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

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

  server.registerTool("get_daily_progress", {
    title: "Get daily calorie and protein goal progress",
    description: "Show the user's calorie and protein targets alongside nutrition logged for a date. Use this when asked how much is left or whether a goal has been met.",
    inputSchema: { date: dateInput },
    annotations: readOnly,
  }, async ({ date }) => {
    const selectedDate = date ?? melbourneToday();
    const [{ data: profile, error: profileError }, { data: entries, error: entriesError }] = await Promise.all([
      db.from("profiles").select("calorie_goal,protein_goal").eq("user_id", userId).maybeSingle(),
      db.from("food_entries").select("calories,protein,carbohydrates,fat").eq("entry_date", selectedDate),
    ]);
    if (profileError) return failure(`Could not load nutrition goals: ${profileError.message}`);
    if (entriesError) return failure(`Could not load daily progress: ${entriesError.message}`);
    const consumed = (entries ?? []).reduce((sum, row) => ({
      calories: sum.calories + Number(row.calories || 0), protein: sum.protein + Number(row.protein || 0),
      carbohydrates: sum.carbohydrates + Number(row.carbohydrates || 0), fat: sum.fat + Number(row.fat || 0),
    }), emptyMacros());
    const goals = { calories: Number(profile?.calorie_goal ?? 2200), protein: Number(profile?.protein_goal ?? 150) };
    const totals = roundMacros(consumed);
    return success({
      date: selectedDate,
      goals,
      consumed: totals,
      remaining: { calories: Math.max(goals.calories - totals.calories, 0), protein: Math.max(goals.protein - totals.protein, 0) },
      goal_met: { calories: totals.calories >= goals.calories, protein: totals.protein >= goals.protein },
    });
  });

  server.registerTool("set_nutrition_goals", {
    title: "Set daily calorie and protein goals",
    description: "Update one or both of the user's daily calorie and protein targets. Confirm the requested targets before changing them.",
    inputSchema: {
      calorie_goal: z.number().int().min(1).max(20_000).optional().describe("Daily calorie target"),
      protein_goal: z.number().min(1).max(2_000).optional().describe("Daily protein target in grams"),
    },
    annotations: writeOnly,
  }, async ({ calorie_goal, protein_goal }) => {
    if (calorie_goal === undefined && protein_goal === undefined) return failure("Provide a calorie goal, a protein goal, or both.");
    const { data: existing, error: loadError } = await db.from("profiles").select("calorie_goal,protein_goal").eq("user_id", userId).maybeSingle();
    if (loadError) return failure(`Could not load nutrition goals: ${loadError.message}`);
    const goals = {
      calorie_goal: calorie_goal ?? Number(existing?.calorie_goal ?? 2200),
      protein_goal: protein_goal ?? Number(existing?.protein_goal ?? 150),
    };
    const { data, error } = await db.from("profiles").upsert({ user_id: userId, ...goals, updated_at: new Date().toISOString() }).select("calorie_goal,protein_goal").single();
    if (error) return failure(`Could not save nutrition goals: ${error.message}`);
    return success({ updated: true, goals: { calories: data.calorie_goal, protein: data.protein_goal } });
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

  server.registerTool("update_food_log_entry", {
    title: "Edit a logged food entry",
    description: "Change a previously logged food or meal's name, meal category, date, or nutrition. Call get_food_log first to obtain the exact entry ID, and confirm the requested changes before editing.",
    inputSchema: {
      entry_id: z.string().uuid().describe("Exact food-log entry ID returned by get_food_log"),
      name: z.string().trim().min(1).max(200).optional().describe("Replacement food or meal name"),
      meal: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]).optional().describe("Replacement meal category"),
      date: dateInput.describe("Replacement log date"),
      calories: z.number().int().min(0).max(20_000).optional().describe("Replacement calories"),
      protein: z.number().min(0).max(2_000).optional().describe("Replacement protein in grams"),
      carbohydrates: z.number().min(0).max(3_000).optional().describe("Replacement carbohydrates in grams"),
      fat: z.number().min(0).max(2_000).optional().describe("Replacement fat in grams"),
    },
    annotations: writeOnly,
  }, async ({ entry_id, name, meal, date, calories, protein, carbohydrates, fat }) => {
    const changes: Record<string, string | number> = {};
    if (name !== undefined) changes.name = name;
    if (meal !== undefined) changes.meal = meal;
    if (date !== undefined) changes.entry_date = date;
    if (calories !== undefined) changes.calories = Math.round(calories);
    if (protein !== undefined) changes.protein = rounded(protein);
    if (carbohydrates !== undefined) changes.carbohydrates = rounded(carbohydrates);
    if (fat !== undefined) changes.fat = rounded(fat);
    if (!Object.keys(changes).length) return failure("Provide at least one value to update.");
    const { data, error } = await db.from("food_entries")
      .update(changes)
      .eq("id", entry_id)
      .eq("user_id", userId)
      .select("id,name,meal,meal_name,routine_name,entry_date,calories,protein,carbohydrates,fat,created_at,snapshot")
      .maybeSingle();
    if (error) return failure(`Could not update food-log entry: ${error.message}`);
    if (!data) return failure("That food-log entry was not found in this Eats account.");
    return success({ updated: true, entry: data });
  });

  server.registerTool("delete_food_log_entry", {
    title: "Delete a logged food entry",
    description: "Permanently remove one food-log entry. Call get_food_log first to identify the exact entry, then ask the user to confirm deletion before calling this tool.",
    inputSchema: { entry_id: z.string().uuid().describe("Exact food-log entry ID returned by get_food_log") },
    annotations: destructiveWrite,
  }, async ({ entry_id }) => {
    const { data, error } = await db.from("food_entries")
      .delete()
      .eq("id", entry_id)
      .eq("user_id", userId)
      .select("id,name,meal,entry_date,calories,protein,carbohydrates,fat")
      .maybeSingle();
    if (error) return failure(`Could not delete food-log entry: ${error.message}`);
    if (!data) return failure("That food-log entry was not found in this Eats account.");
    return success({ deleted: true, entry: data });
  });

  server.registerTool("list_meals", {
    title: "List saved meals",
    description: "List reusable Eats meals with ingredients, measurements, and calculated nutrition.",
    inputSchema: { search: z.string().trim().max(100).optional().describe("Optional meal-name search") },
    annotations: readOnly,
  }, async ({ search }) => {
    let query = db.from("meals").select("id,name,notes,meal_ingredients(id,amount,unit,ingredients(id,name,brand,serving_amount,serving_unit,calories,protein,carbohydrates,fat))").order("name");
    if (search) query = query.ilike("name", `%${search}%`);
    const { data, error } = await query;
    if (error) return failure(`Could not load meals: ${error.message}`);
    const meals = ((data ?? []) as unknown as MealRow[]).map((meal) => ({ ...meal, nutrition: mealMacros(meal) }));
    return success({ count: meals.length, meals });
  });

  server.registerTool("update_saved_meal_ingredient", {
    title: "Edit an ingredient in a saved meal",
    description: "Change an ingredient amount or unit in one saved meal. Call list_meals first to obtain the exact meal ID and meal-ingredient ID, then confirm the requested change before editing. Use this to change a Protein Shake from 500 ml to 400 ml of milk for future logs.",
    inputSchema: {
      meal_id: z.string().uuid().describe("Exact saved meal ID returned by list_meals"),
      meal_ingredient_id: z.string().uuid().describe("Exact meal-ingredient ID returned inside list_meals"),
      amount: z.number().positive().max(100_000).optional().describe("Replacement ingredient amount"),
      unit: unitInput.optional().describe("Replacement unit"),
    },
    annotations: writeOnly,
  }, async ({ meal_id, meal_ingredient_id, amount, unit }) => {
    if (amount === undefined && unit === undefined) return failure("Provide a replacement amount, unit, or both.");
    const { data: existing, error: lookupError } = await db.from("meal_ingredients")
      .select("id,meal_id")
      .eq("id", meal_ingredient_id)
      .eq("meal_id", meal_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (lookupError) return failure(`Could not load saved-meal ingredient: ${lookupError.message}`);
    if (!existing) return failure("That ingredient was not found in this saved meal.");
    const changes: Record<string, string | number> = {};
    if (amount !== undefined) changes.amount = amount;
    if (unit !== undefined) changes.unit = unit;
    const { error: updateError } = await db.from("meal_ingredients")
      .update(changes)
      .eq("id", meal_ingredient_id)
      .eq("meal_id", meal_id)
      .eq("user_id", userId);
    if (updateError) return failure(`Could not update saved-meal ingredient: ${updateError.message}`);
    const { data: meal, error: mealError } = await db.from("meals")
      .select("id,name,notes,meal_ingredients(id,amount,unit,ingredients(id,name,brand,serving_amount,serving_unit,calories,protein,carbohydrates,fat))")
      .eq("id", meal_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (mealError || !meal) return failure(`Ingredient updated, but could not load the saved meal: ${mealError?.message ?? "Meal not found"}`);
    const updatedMeal = meal as unknown as MealRow;
    return success({ updated: true, meal: { ...updatedMeal, nutrition: mealMacros(updatedMeal) } });
  });

  server.registerTool("list_ingredients", {
    title: "List saved ingredients",
    description: "List the user's reusable ingredient library, including serving size and nutrition. Search before creating a new ingredient to avoid duplicates.",
    inputSchema: { search: z.string().trim().max(100).optional().describe("Optional ingredient-name search") },
    annotations: readOnly,
  }, async ({ search }) => {
    let query = db.from("ingredients").select("id,name,brand,barcode,serving_amount,serving_unit,calories,protein,carbohydrates,fat,source").order("name");
    if (search) query = query.ilike("name", `%${search}%`);
    const { data, error } = await query;
    if (error) return failure(`Could not load ingredients: ${error.message}`);
    return success({ count: data?.length ?? 0, ingredients: data ?? [] });
  });

  server.registerTool("create_ingredient", {
    title: "Create a library ingredient",
    description: "Save a reusable ingredient with nutrition per serving. Confirm all nutrition values with the user before creating it.",
    inputSchema: {
      name: z.string().trim().min(1).max(200),
      brand: z.string().trim().max(200).optional(),
      barcode: z.string().trim().min(1).max(100).optional(),
      serving_amount: z.number().positive().max(100_000).default(100),
      serving_unit: unitInput.default("g"),
      calories: z.number().min(0).max(20_000),
      protein: macroInput.default(0).describe("Protein grams per serving"),
      carbohydrates: macroInput.default(0).describe("Carbohydrate grams per serving"),
      fat: macroInput.default(0).describe("Fat grams per serving"),
    },
    annotations: writeOnly,
  }, async ({ name, brand, barcode, serving_amount, serving_unit, calories, protein, carbohydrates, fat }) => {
    const { data, error } = await db.from("ingredients").insert({
      user_id: userId, name, brand: brand || null, barcode: barcode || null, serving_amount, serving_unit,
      calories, protein, carbohydrates, fat, source: "manual",
    }).select("id,name,brand,barcode,serving_amount,serving_unit,calories,protein,carbohydrates,fat,source").single();
    if (error) return failure(`Could not create ingredient: ${error.message}`);
    return success({ created: true, ingredient: data });
  });

  server.registerTool("create_meal", {
    title: "Create a library meal",
    description: "Save a reusable meal from ingredients already in the user's library. Call list_ingredients first and confirm the ingredient amounts before creating it.",
    inputSchema: {
      name: z.string().trim().min(1).max(200),
      notes: z.string().trim().max(2_000).optional(),
      ingredients: z.array(ingredientItemInput).min(1).max(50).describe("Ingredients and amounts, in display order"),
    },
    annotations: writeOnly,
  }, async ({ name, notes, ingredients }) => {
    const ids = ingredients.map((item) => item.ingredient_id);
    if (new Set(ids).size !== ids.length) return failure("Use each ingredient only once in a meal; combine duplicate amounts first.");
    const { data: found, error: ingredientError } = await db.from("ingredients").select("id,name,brand,serving_amount,serving_unit,calories,protein,carbohydrates,fat").in("id", ids);
    if (ingredientError) return failure(`Could not validate meal ingredients: ${ingredientError.message}`);
    if ((found?.length ?? 0) !== ids.length) return failure("One or more ingredients were not found in this Eats account.");
    const { data: meal, error: mealError } = await db.from("meals").insert({ user_id: userId, name, notes: notes || null }).select("id,name,notes").single();
    if (mealError || !meal) return failure(`Could not create meal: ${mealError?.message ?? "No meal was returned"}`);
    const { error: linkError } = await db.from("meal_ingredients").insert(ingredients.map((item, position) => ({ user_id: userId, meal_id: meal.id, ingredient_id: item.ingredient_id, amount: item.amount, unit: item.unit, position })));
    if (linkError) {
      await db.from("meals").delete().eq("id", meal.id);
      return failure(`Could not add ingredients to meal: ${linkError.message}`);
    }
    const ingredientById = new Map(((found ?? []) as IngredientRow[]).map((ingredient) => [ingredient.id, ingredient]));
    const savedMeal: MealRow = { ...meal, meal_ingredients: ingredients.map((item) => ({ amount: item.amount, unit: item.unit, ingredients: ingredientById.get(item.ingredient_id) ?? null })) };
    return success({ created: true, meal: { ...savedMeal, nutrition: mealMacros(savedMeal) } });
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

  server.registerTool("create_routine", {
    title: "Create a library routine",
    description: "Save a reusable routine from meals already in the user's library. Call list_meals first and confirm the included meals and quantities before creating it.",
    inputSchema: {
      name: z.string().trim().min(1).max(200),
      suggested_period: z.enum(["morning", "midday", "evening", "anytime"]).default("anytime").describe("When this routine is usually eaten"),
      meals: z.array(z.object({
        meal_id: z.string().uuid().describe("Meal ID returned by list_meals"),
        quantity: z.number().positive().max(20).default(1),
      })).min(1).max(30).describe("Meals and quantities, in display order"),
    },
    annotations: writeOnly,
  }, async ({ name, suggested_period, meals }) => {
    const ids = meals.map((item) => item.meal_id);
    if (new Set(ids).size !== ids.length) return failure("Use each meal only once in a routine; increase its quantity instead.");
    const { data: found, error: lookupError } = await db.from("meals").select("id,name").in("id", ids);
    if (lookupError) return failure(`Could not validate routine meals: ${lookupError.message}`);
    if ((found?.length ?? 0) !== ids.length) return failure("One or more meals were not found in this Eats account.");
    const { data: routine, error: routineError } = await db.from("routines").insert({ user_id: userId, name, suggested_period }).select("id,name,suggested_period").single();
    if (routineError || !routine) return failure(`Could not create routine: ${routineError?.message ?? "No routine was returned"}`);
    const { error: linkError } = await db.from("routine_meals").insert(meals.map((item, position) => ({ user_id: userId, routine_id: routine.id, meal_id: item.meal_id, quantity: item.quantity, position })));
    if (linkError) {
      await db.from("routines").delete().eq("id", routine.id);
      return failure(`Could not add meals to routine: ${linkError.message}`);
    }
    const mealNames = new Map((found ?? []).map((meal) => [meal.id, meal.name]));
    return success({ created: true, routine: { ...routine, meals: meals.map((item) => ({ ...item, name: mealNames.get(item.meal_id) })) } });
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
