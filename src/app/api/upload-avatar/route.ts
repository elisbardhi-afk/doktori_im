import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const role = (formData.get("role") as string) ?? "patient"; // "doctor" | "patient"

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/avatar.${ext}`;
  const bytes = await file.arrayBuffer();

  const service = createServiceClient();

  // Upload (upsert) to the avatars bucket
  const { error: uploadError } = await service.storage
    .from("avatars")
    .upload(path, bytes, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get the public URL
  const { data: urlData } = service.storage.from("avatars").getPublicUrl(path);
  // Bust cache by appending a timestamp query param
  const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  // Persist to the right table
  if (role === "doctor") {
    const { error: dbError } = await service
      .from("doctor_profiles")
      .update({ photo_url: publicUrl })
      .eq("user_id", user.id);
    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }
  } else {
    const { error: dbError } = await service
      .from("users")
      .update({ avatar_url: publicUrl })
      .eq("id", user.id);
    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ url: publicUrl });
}
