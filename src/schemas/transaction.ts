import { z } from "zod";

export const CreateTransactionSchema = z.object({
  userId: z.string().uuid().optional(),
  transaction_type: z.enum(["income", "expense", "transfer"]),
  origin_account_id: z.string().uuid(),
  destination_account_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  description: z.string().max(200).nullable().optional(),
  transaction_date: z.string(), // YYYY-MM-DD
});

export const UpdateTransactionSchema = z.object({
  userId: z.string().uuid().optional(),
  transaction_type: z.enum(["income", "expense", "transfer"]),
  origin_account_id: z.string().uuid(),
  destination_account_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  description: z.string().max(200).nullable().optional(),
  transaction_date: z.string(), // YYYY-MM-DD
});