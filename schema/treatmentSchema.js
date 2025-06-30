import { z } from "zod";

export const createTreatmentSchema = z.object({
  treeCode: z.string().min(1, { message: "Tree ID is required" }).trim(),
  dateApplied: z.coerce
    .date({ errorMap: () => ({ message: "Please enter a valid date" }) })
    .refine((date) => date instanceof Date && !isNaN(date), {
      message: "Date is required",
    })
    .refine((date) => date <= new Date(), {
      message: "Applied date cannot be in the future",
    }),
  type: z.enum(["Pesticide", "Fungicide", "Others", "Herbicide"]),
  product: z
    .string()
    .min(1, { message: "Product is required" })
    .max(30, { message: "Product name is too long" })
    .trim(),
  endDate: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.coerce
      .date({ errorMap: () => ({ message: "Invalid date format" }) })
      .refine(
        (date) => {
          if (!date) return true;
          const minDate = new Date();
          minDate.setFullYear(minDate.getFullYear() - 100);
          const maxDate = new Date();
          maxDate.setFullYear(maxDate.getFullYear() + 50);
          return date >= minDate && date <= maxDate;
        },
        {
          message: "Date must be a valid date",
        }
      )
      .optional()
      .nullable()
  ),
  inventoryItemId: z.string().trim().optional().nullable(),
  amount: z.coerce
    .number({ invalid_type_error: "Amount must be a number" })
    .positive("Amount must be greater than 0")
    .optional()
    .nullable(),
  unit: z
    .string()
    .min(1, { message: "Unit is required" })
    .max(10, { message: "Unit is too long" })
    .trim(),
});
