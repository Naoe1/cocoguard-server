import { z } from "zod";

export const createNutrientSchema = z.object({
  treeCode: z.string().min(1, { message: "Tree ID is required" }),
  dateApplied: z.coerce
    .date({ errorMap: () => ({ message: "Please enter a valid date" }) })
    .refine((date) => date instanceof Date && !isNaN(date), {
      message: "Date is required",
    })
    .refine((date) => date <= new Date(), {
      message: "Applied date cannot be in the future",
    }),
  product: z.string().min(1, { message: "Product is required" }),
  amount: z.coerce
    .number()
    .min(1, { message: "This should be greater than 1" }),
  applicationMethod: z
    .string()
    .trim()
    .max(20, "Too long")
    .optional()
    .nullable(),
  unit: z.string().trim().max(20, "Too long").min(1, "Required"),
});
