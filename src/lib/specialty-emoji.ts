/** Emoji per specialty slug — used for the pastel chips / grid. */
export const specialtyEmoji: Record<string, string> = {
  "general-practitioner": "🩺",
  pediatrics: "👶",
  cardiology: "❤️",
  dermatology: "🧴",
  dentistry: "🦷",
  gynecology: "🌸",
  orthopedics: "🦴",
  ophthalmology: "👁️",
  ent: "👂",
  neurology: "🧠",
  psychiatry: "🧩",
  psychology: "💬",
  endocrinology: "⚕️",
  gastroenterology: "💊",
  urology: "💧",
  pulmonology: "🫁",
  rheumatology: "🖐️",
  physiotherapy: "🏋️",
};

export function emojiFor(slug: string): string {
  return specialtyEmoji[slug] ?? "🩺";
}
