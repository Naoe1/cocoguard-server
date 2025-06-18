import { z } from "zod";

export const createItemSchema = z.object({
  name: z
    .string()
    .min(1, { message: "Name is required" })
    .max(30, { message: "Name cannot exceed 39 characters" })
    .trim(),
  category: z.string().min(1, { message: "Category is required" }),
  stockQty: z.coerce
    .number()
    .min(1, { message: "This should be greater than 1" }),
  amountPerUnit: z.coerce.number().min(1, {
    message: "This should be greater than 1",
  }),
  unit: z
    .string()
    .min(1, { message: "Unit is required" })
    .max(20, { message: "Unit cannot exceed 20 characters" })
    .trim(),
  stockPrice: z.coerce.number().optional().nullable(),
  lowStockAlert: z.coerce.number().optional().nullable(),
});
