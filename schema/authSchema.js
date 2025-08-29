import { z } from "zod";

export const registerInputSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email().min(1, "Required"),
  password: z.string().min(6, "Minimum 6 characters"),
  paypal_email: z.string().email().min(1, "Required"),
  street: z.string().min(1, "Street address is required"),
  barangay: z.string().min(1, "Barangay is required"),
  city: z.string().min(1, "City/Municipality is required"),
  province: z.string().min(1, "Province is required"),
  region: z.string().min(1, "Region is required"),
  postal_code: z
    .string()
    .min(1, "Postal code is required")
    .regex(/^\d+$/, "Postal code must contain only digits"),
});
export const loginInputSchema = z.object({
  email: z.string().email().min(1, "Required"),
  password: z.string().min(6, "Minimum 6 characters"),
});
