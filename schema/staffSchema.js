import { z } from "zod";

export const createStaffSchema = z.object({
  firstName: z
    .string()
    .min(1, { message: "First name is required" })
    .max(50, { message: "First name is too long" })
    .trim(),
  lastName: z
    .string()
    .min(1, { message: "Last name is required" })
    .max(50, { message: "Last name is too long" })
    .trim(),
  email: z
    .string()
    .email({ message: "Invalid email address" })
    .min(1, { message: "Email is required" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" }),
  role: z.enum(["ADMIN", "STAFF"], {
    errorMap: () => ({ message: "Role is required" }),
  }),
});

export const updateStaffSchema = createStaffSchema.extend({
  email: z
    .string()
    .email({ message: "Invalid email address" })
    .min(1, { message: "Email is required" })
    .optional(),
  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters long" })
    .optional(),
});
