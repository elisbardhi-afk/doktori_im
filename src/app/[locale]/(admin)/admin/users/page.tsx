import { getLocale, setRequestLocale } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { UserRow } from "@/lib/database.types";

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = await getLocale();

  const svc = createServiceClient();
  const { data } = await svc
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const users = (data ?? []) as UserRow[];

  const roleVariant = (r: string) =>
    r === "admin" ? "default" : r === "doctor" ? "success" : "secondary";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">
        {activeLocale === "en" ? "Users" : "Përdoruesit"} ({users.length})
      </h1>
      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <Card
            key={u.id}
            className="flex items-center justify-between p-3.5"
          >
            <div>
              <p className="font-semibold text-foreground">{u.full_name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{u.email}</p>
            </div>
            <Badge variant={roleVariant(u.role)}>{u.role}</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
