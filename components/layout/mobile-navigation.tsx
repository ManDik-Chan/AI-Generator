import Link from "next/link";
import { CircleUserRound, Home, MessageCircle, PenLine, Wrench } from "lucide-react";

const navigation = [
  { label: "首页", href: "/", icon: Home, active: true },
  { label: "AI助手", href: "/personas", icon: MessageCircle },
  { label: "创作", href: "/create", icon: PenLine },
  { label: "工具", href: "/tools", icon: Wrench },
  { label: "我的", href: "/settings", icon: CircleUserRound },
];

export function MobileNavigation() {
  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-2xl border bg-card/90 px-1 pb-[max(.3rem,env(safe-area-inset-bottom))] pt-1 shadow-soft backdrop-blur-xl md:hidden"
      aria-label="移动端主导航"
    >
      {navigation.map((item) => (
        <Link
          className={
            item.active
              ? "flex min-w-0 flex-col items-center gap-1 rounded-xl bg-muted px-1 py-2 text-[11px] font-medium text-foreground"
              : "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] text-muted-foreground"
          }
          href={item.href}
          key={item.href}
        >
          <item.icon className="size-5" aria-hidden="true" />
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
