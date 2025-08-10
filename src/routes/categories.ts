import { FastifyInstance } from "fastify";
import { createUserSupabaseClient } from "../supabase";

export async function categoryRoutes(app: FastifyInstance) {
  app.get("/v1/categories", async (req, reply) => {
    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const { type, includeInactive } = (req.query as any);
    let query = supabase.from("categories").select("id,user_id,name,category_type,color,icon,is_active,created_at,updated_at");

    if (type) query = query.eq("category_type", type);
    const includeInactiveBool = includeInactive === "true";
    if (!includeInactiveBool) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(200).send({ categories: data });
  });

  // POST /v1/categories
  app.post("/v1/categories", async (req, reply) => {
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const { name, category_type, color, icon, is_active = true } = (req.body as any) || {};
    if (!name || !category_type) return reply.code(400).send({ error: "INVALID_PAYLOAD" });

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const { data, error } = await supabase
      .from('categories')
      .insert([{ user_id: userIdFromToken, name, category_type, color, icon, is_active }])
      .select('*')
      .single();
    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(201).send({ category: data });
  });

  // PUT /v1/categories/:id
  app.put("/v1/categories/:id", async (req, reply) => {
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const body = (req.body as any) || {};
    const allowed: any = {};
    if (typeof body.name === 'string') allowed.name = body.name;
    if (typeof body.category_type === 'string') allowed.category_type = body.category_type;
    if (typeof body.color === 'string') allowed.color = body.color;
    if (typeof body.icon === 'string') allowed.icon = body.icon;
    if (typeof body.is_active === 'boolean') allowed.is_active = body.is_active;
    if (Object.keys(allowed).length === 0) return reply.code(400).send({ error: "NOTHING_TO_UPDATE" });

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const { data, error } = await supabase
      .from('categories')
      .update(allowed)
      .eq('id', (req.params as any).id)
      .eq('user_id', userIdFromToken)
      .select('*')
      .single();
    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(200).send({ category: data });
  });

  // DELETE /v1/categories/:id
  app.delete("/v1/categories/:id", async (req, reply) => {
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const { data, error } = await supabase
      .from('categories')
      .delete()
      .eq('id', (req.params as any).id)
      .eq('user_id', userIdFromToken)
      .select('*')
      .maybeSingle();
    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(200).send({ category: data });
  });
}


