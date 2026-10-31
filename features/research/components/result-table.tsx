import { Check, CircleCheck, CircleX } from "lucide-react";

import { formatResult, type Comparison, type ReplayOutcome, type ResultCheck } from "@/features/research/replays";
import { cn } from "@/lib/utils";

/*
 * Result display shared by the server-rendered reference result and the browser replay.
 * No hooks and no environment reads, so it renders the same on both sides.
 */

export function ResultTable({ outcome, comparison, caption }: { outcome: ReplayOutcome; comparison?: Comparison; caption: string }) {
  return (
    <div>
      <div className="scroll-x">
        <table className="w-full min-w-[34rem] border-collapse text-left text-[.8125rem]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border/20 text-[.75rem] text-muted-foreground">
              <th className="whitespace-nowrap py-2 pr-4 font-medium" scope="col">{outcome.rowHeader}</th>
              {outcome.columns.map((column) => (
                <th className="whitespace-nowrap py-2 pl-4 text-right font-medium" key={column.key} scope="col">
                  {column.label}{column.unit ? <span className="font-normal">（{column.unit}）</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outcome.rows.map((row) => (
              <tr className="border-b border-border/12 last:border-0" key={row.key}>
                <th className="whitespace-nowrap py-3 pr-4 font-medium" scope="row">{row.label}</th>
                {outcome.columns.map((column) => {
                  const agree = comparison?.comparable ? comparison.cells[`${row.key}:${column.key}`] : undefined;
                  return (
                    <td className="py-3 pl-4 text-right font-code tabular-nums" key={column.key}>
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {formatResult(row.values[column.key], column)}
                        {agree === undefined ? null : agree
                          ? <Check aria-label="与参考一致" className="size-3 text-success" role="img" />
                          : <span aria-label="与参考不一致" className="font-sans text-[.75rem] font-medium text-destructive" role="img">≠</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-caption min-[700px]:hidden">表格可左右滑动，查看全部 {outcome.columns.length + 1} 列。</p>
    </div>
  );
}

export function CheckList({ checks, className }: { checks: ResultCheck[]; className?: string }) {
  return (
    <ul className={cn("space-y-2", className)}>
      {checks.map((check) => (
        <li className="flex items-start gap-2.5 text-[.8125rem] leading-5" key={check.key}>
          {check.pass
            ? <CircleCheck aria-hidden="true" className="mt-px size-4 shrink-0 text-success" />
            : <CircleX aria-hidden="true" className="mt-px size-4 shrink-0 text-destructive" />}
          <span>
            <span className="sr-only">{check.pass ? "通过：" : "未通过："}</span>
            {check.label}
            <span className={cn("ml-2 text-[.75rem] font-medium", check.pass ? "text-success-foreground" : "text-destructive-foreground")} aria-hidden="true">{check.pass ? "通过" : "未通过"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
