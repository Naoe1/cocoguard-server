import { z } from "zod";

export const createProductSchema = z.object({
  inventoryItemId: z
    .string()
    .min(1, { message: "Please select a product from inventory" }),
  description: z.string().optional().nullable(),
  price: z.coerce
    .number({ invalid_type_error: "Price must be a number" })
    .positive({ message: "Price must be positive" }),
  amountToSell: z.coerce
    .number({ invalid_type_error: "Stock must be a number" })
    .int({ message: "Stock must be a whole number" })
    .nonnegative({ message: "Stock cannot be negative" }),
  image: z
    .string()
    .url({ message: "Please enter a valid URL" })
    .optional()
    .or(z.literal("")),
});

export const updateProductSchema = createProductSchema.partial();
