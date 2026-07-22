import { PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="mx-auto min-h-[var(--app-height)] w-full max-w-5xl px-4 py-8 sm:px-6 md:px-8"><PageSkeleton /></div>;
}
