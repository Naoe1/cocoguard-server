import { z } from "zod";

export const createHarvestSchema = z.object({
  treeCode: z.string().min(1, { message: "Tree ID is required" }).trim(),
  coconutCount: z.coerce.number().optional().nullable(),
  totalWeight: z.coerce
    .number()
    .min(1, { message: "Total weight is required" }),
  harvestDate: z.coerce
    .date({ errorMap: () => ({ message: "Invalid date format" }) })
    .refine(
      (date) => {
        const minDate = new Date();
        minDate.setFullYear(minDate.getFullYear() - 100);
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() + 50);
        return date >= minDate && date <= maxDate;
      },
      {
        message:
          "Date must be within last 100 years and not more than 50 years in future",
      }
    ),
});
