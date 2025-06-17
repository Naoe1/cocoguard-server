import { z } from "zod";

export const createCoconutSchema = z.object({
  treeCode: z
    .string()
    .min(1, "Tree code is required")
    .max(20, "Max length is 20 characters")
    .trim(),
  plantingDate: z.preprocess(
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
          message:
            "Date must be within last 100 years and not more than 50 years in future",
        }
      )
      .optional()
      .nullable()
  ),
  height: z.coerce.number().optional(),
  trunkDiameter: z.coerce.number().optional(),
  status: z.enum(["Healthy", "Diseased"]),
});
