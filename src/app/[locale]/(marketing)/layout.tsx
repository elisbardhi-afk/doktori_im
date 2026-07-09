import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";

export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border/60 py-8">
        <div className="container text-center text-sm text-muted-foreground">
          © 2026 Doktori Im — Shqipëri
        </div>
      </footer>
    </div>
  );
}
