export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return Response.json({
    openapi: "3.1.0",
    info: { title: "Eats", version: "1.0.0", description: "Log a meal only after the user has explicitly approved the proposed nutrition estimate." },
    servers: [{ url: origin }],
    paths: {
      "/api/gpt/log-meal": {
        post: {
          operationId: "logReviewedMeal", summary: "Log a user-approved meal in Eats",
          description: "Call this only after showing the user the meal name, nutrition estimate, and meal category and receiving a clear approval to save it.",
          security: [{ EatsOAuth: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false, required: ["name", "calories", "protein", "carbohydrates", "fat"], properties: { name: { type: "string" }, calories: { type: "number" }, protein: { type: "number" }, carbohydrates: { type: "number" }, fat: { type: "number" }, meal: { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Snack"] }, date: { type: "string", description: "YYYY-MM-DD; defaults to today in Melbourne" } } } } } },
          responses: { "200": { description: "Meal added" }, "400": { description: "Invalid meal" }, "401": { description: "Eats account must be connected" } },
        },
      },
    },
    components: {
      // ChatGPT's Action importer requires this object to exist, even when
      // request schemas are declared inline below each operation.
      schemas: {},
      securitySchemes: {
        EatsOAuth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/oauth/authorize`,
              tokenUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/oauth/token`,
              scopes: {},
            },
          },
        },
      },
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
