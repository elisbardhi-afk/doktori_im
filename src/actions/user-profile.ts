"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface UpdateProfileInput {
  firstName: string;
  lastName: string;
  phone: string;
  address?: string;
  city?: string;
  postalCode?: string;
}

export interface UpdateProfileResult {
  success: boolean;
  error?: string;
}

/**
 * Update the signed-in user's profile information (name, phone, address, etc.)
 * Validates all required fields and persists to the database.
 */
export async function updateUserProfile(
  input: UpdateProfileInput
): Promise<UpdateProfileResult> {
  // Verify authentication
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Collect validation errors
  const errors: string[] = [];

  // Validate firstName
  if (!input.firstName || input.firstName.trim() === "") {
    errors.push("First name is required");
  } else if (input.firstName.trim().length > 50) {
    errors.push("First name must not exceed 50 characters");
  }

  // Validate lastName
  if (!input.lastName || input.lastName.trim() === "") {
    errors.push("Last name is required");
  } else if (input.lastName.trim().length > 50) {
    errors.push("Last name must not exceed 50 characters");
  }

  // Validate phone
  if (!input.phone || input.phone.trim() === "") {
    errors.push("Phone is required");
  }

  // Validate address (optional but has max length)
  if (input.address && input.address.length > 150) {
    errors.push("Address must not exceed 150 characters");
  }

  // Validate postalCode (optional but has max length)
  if (input.postalCode && input.postalCode.length > 20) {
    errors.push("Postal code must not exceed 20 characters");
  }

  // If validation failed, return all errors
  if (errors.length > 0) {
    return { success: false, error: errors.join("; ") };
  }

  // Prepare update data
  const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`;
  const updateData = {
    full_name: fullName,
    phone: input.phone.trim(),
    address: input.address?.trim() || null,
    city: input.city || null,
    postal_code: input.postalCode || null,
    updated_at: new Date().toISOString(),
  };

  // Update in database
  const supabase = createClient();
  const { error } = await supabase
    .from("users")
    .update(updateData)
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update user profile:", error);
    return { success: false, error: error.message || "Failed to save profile" };
  }

  // Revalidate the profile page cache
  revalidatePath("/patient/profile");
  revalidatePath("/patient");
  revalidatePath("/");

  return { success: true };
}
