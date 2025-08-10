import { FastifyInstance } from "fastify";
import { createUserSupabaseClient } from "../supabase";

export async function dashboardRoutes(app: FastifyInstance) {
  // GET /v1/dashboard/summary?year=YYYY
  app.get("/v1/dashboard/summary", async (req, reply) => {
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const year = parseInt(((req.query as any)?.year ?? new Date().getFullYear()).toString(), 10);
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    // 1) Transacciones del año
    const { data: transactions, error: txErr } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userIdFromToken)
      .gte("transaction_date", startDate)
      .lte("transaction_date", endDate);
    if (txErr) return reply.code(400).send({ error: txErr.message });

    // 2) Categorías
    const { data: categories, error: catErr } = await supabase
      .from("categories")
      .select("id,name,category_type")
      .eq("user_id", userIdFromToken);
    if (catErr) return reply.code(400).send({ error: catErr.message });

    const catMap = new Map<string, { name: string; type: string }>();
    categories?.forEach((c: any) => catMap.set(c.id, { name: c.name, type: c.category_type }));

    // 3) Resumen por categoría (solo income/expense)
    const categoryAccumulator = new Map<string, { category_name: string; total_amount_usd: number; category_type: string; color: string }>();
    let totalIncome = 0;
    let totalExpenses = 0;

    (transactions || []).forEach((t: any) => {
      if (t.description && String(t.description).includes('Saldo inicial')) return;
      if (t.transaction_type !== 'income' && t.transaction_type !== 'expense') return;
      const catInfo = t.category_id ? catMap.get(t.category_id) : undefined;
      if (!catInfo) return;
      const key = catInfo.name;
      if (!categoryAccumulator.has(key)) {
        categoryAccumulator.set(key, {
          category_name: key,
          total_amount_usd: 0,
          category_type: catInfo.type,
          color: catInfo.type === 'income' ? '#10B981' : '#EF4444',
        });
      }
      const entry = categoryAccumulator.get(key)!;
      entry.total_amount_usd += t.amount_usd || 0;
      if (catInfo.type === 'income') totalIncome += t.amount_usd || 0;
      if (catInfo.type === 'expense') totalExpenses += t.amount_usd || 0;
    });

    const categoryData = Array.from(categoryAccumulator.values()).sort((a, b) => b.total_amount_usd - a.total_amount_usd);
    const savings = totalIncome - totalExpenses;

    // 4) Agregaciones mensuales via RPC si disponible
    let monthlyAggregations: any[] = [];
    const { data: monthly, error: monthlyErr } = await supabase.rpc('get_monthly_aggregations', {
      p_user_id: userIdFromToken,
      p_year: year,
    });
    if (!monthlyErr && Array.isArray(monthly)) {
      monthlyAggregations = monthly;
    }

    // 5) Cuentas y conversión a USD
    const { data: accounts, error: accErr } = await supabase
      .from('accounts')
      .select('id,name,current_balance,initial_balance,currency,account_type,is_active')
      .eq('user_id', userIdFromToken)
      .eq('is_active', true);
    if (accErr) return reply.code(400).send({ error: accErr.message });

    const today = new Date().toISOString().split('T')[0];
    const { data: rates } = await supabase
      .from('exchange_rates')
      .select('currency_from, rate')
      .eq('currency_to', 'USD')
      .eq('rate_date', today);

    const rateMap = new Map<string, number>();
    (rates || []).forEach((r: any) => rateMap.set(r.currency_from, r.rate));

    const accountsUSD = (accounts || []).map((a: any) => {
      const r = rateMap.get(a.currency) || (a.currency === 'USD' ? 1 : 1);
      return {
        ...a,
        current_balance_usd: (a.current_balance || 0) * r,
        initial_balance_usd: (a.initial_balance || 0) * r,
      };
    });

    const activos = accountsUSD.filter((acc: any) => ['uso diario', 'inversiones', 'rodados', 'inmuebles'].includes(acc.account_type)).reduce((s: number, a: any) => s + (a.current_balance_usd || 0), 0);
    const deudas = accountsUSD.filter((acc: any) => acc.account_type === 'deuda').reduce((s: number, a: any) => s + (a.current_balance_usd || 0), 0);
    const patrimonySnapshot = {
      snapshot_date: today,
      total_balance_usd: activos - deudas,
      net_flow_usd: savings,
    };

    return reply.code(200).send({
      year,
      categoryData,
      totals: { income: totalIncome, expenses: totalExpenses, savings },
      monthlyAggregations,
      accountsUSD,
      patrimonySnapshot,
    });
  });
}


