import { getCurrentUser } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      city: user.city,
      phone: user.phone,
      address: user.address,
      postal_code: user.postal_code,
    });
  } catch (err) {
    console.error("Error fetching user profile:", err);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
