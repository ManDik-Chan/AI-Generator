export type AppShellVariant = "reading" | "standard" | "wide" | "full";

export const appShellWidthClasses: Record<AppShellVariant, string> = {
  reading: "max-w-3xl",
  standard: "max-w-5xl",
  wide: "max-w-[90rem]",
  full: "max-w-none",
};
