export type AppShellVariant = "reading" | "standard" | "wide" | "full";

export const appShellWidthClasses: Record<AppShellVariant, string> = {
  reading: "max-w-[52rem]",
  standard: "max-w-[84rem]",
  wide: "max-w-[100rem]",
  full: "max-w-none",
};
