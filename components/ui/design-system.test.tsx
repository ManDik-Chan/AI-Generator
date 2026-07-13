import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBanner } from "@/components/ui/status-banner";

describe("shared design primitives", () => {
  it("supports product button states", () => {
    expect(buttonVariants({ variant: "default" })).toContain("bg-primary");
    expect(buttonVariants({ variant: "secondary" })).toContain("bg-secondary");
    expect(buttonVariants({ variant: "destructive" })).toContain("bg-destructive");
    expect(buttonVariants({ size: "icon" })).toContain("size-11");
    expect(buttonVariants()).toContain("disabled:pointer-events-none");
  });

  it("renders an asChild button as one static child", () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <Link href="/chat">开始对话</Link>
      </Button>,
    );

    expect(html).toContain('href="/chat"');
    expect(html).toContain("开始对话");
  });

  it("renders a responsive PageHeader structure", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        description="页面说明"
        primaryAction={<button>主要操作</button>}
        title="页面标题"
      />,
    );

    expect(html).toContain("sm:flex-row");
    expect(html).toContain("页面标题");
    expect(html).toContain("主要操作");
  });

  it("renders reusable empty and status states with semantics", () => {
    const empty = renderToStaticMarkup(
      <EmptyState description="页面说明" title="暂无内容" />,
    );
    const error = renderToStaticMarkup(
      <StatusBanner variant="error">请重试</StatusBanner>,
    );

    expect(empty).toContain("暂无内容");
    expect(error).toContain('role="alert"');
    expect(error).toContain("请重试");
  });
});
