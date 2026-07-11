import { Sparkles } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="AI-Generator">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      {!compact && (
        <span>
          <span className="block text-sm font-semibold tracking-tight">AI-Generator</span>
          <span className="block text-xs text-muted-foreground">Your private AI space</span>
        </span>
      )}
    </div>
  );
}
