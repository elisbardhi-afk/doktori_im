import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["sq", "en"],
  defaultLocale: "sq",
  // Albanian (majority audience) served at "/", English at "/en/...".
  localePrefix: "as-needed",
});
