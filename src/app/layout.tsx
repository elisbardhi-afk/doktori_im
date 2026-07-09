import type { ReactNode } from "react";

// Root layout is intentionally minimal — the <html>/<body> tags live in the
// [locale] layout so `lang` can reflect the active locale.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
