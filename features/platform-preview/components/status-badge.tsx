import { Badge } from "@/components/ui/badge";
import { DEMO_LABEL, SAMPLE_LABEL, statusMeta, type CapabilityStatus } from "@/features/platform-preview/status";
import { cn } from "@/lib/utils";

const variants = { live: "success", dev: "warning", planned: "info" } as const;

export function StatusBadge({ status, className }: { status: CapabilityStatus; className?: string }) {
  return <Badge className={className} title={statusMeta[status].description} variant={variants[status]}>{statusMeta[status].label}</Badge>;
}

/** Marks a block whose content is invented for the preview. */
export function SampleBadge({ className, label = SAMPLE_LABEL }: { className?: string; label?: string }) {
  return <Badge className={cn("border-dashed border-border/30", className)} variant="neutral">{label}</Badge>;
}

export function DemoBadge({ className }: { className?: string }) {
  return <SampleBadge className={className} label={DEMO_LABEL} />;
}
