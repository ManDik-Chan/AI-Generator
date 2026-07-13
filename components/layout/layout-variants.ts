export type AppShellVariant = "reading" | "standard" | "wide" | "full";

export const appShellWidthClasses: Record<AppShellVariant, string> = {
  reading: "max-w-[48rem]",
  standard: "max-w-[65rem]",
  wide: "max-w-[77.75rem]",
  full: "max-w-none",
};
