"use client";

export default function GlobalError({ reset }: { error: Error; reset(): void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: "#f4f1ea", color: "#151a20", fontFamily: "Inter,system-ui,sans-serif" }}>
        <main style={{ minHeight: "100vh", height: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <div style={{ maxWidth: 480 }}>
            <div aria-hidden="true" style={{ width: 48, height: 48, display: "grid", placeItems: "center", margin: "0 auto 20px", borderRadius: 14, background: "#151a20", color: "#35b893" }}><svg fill="currentColor" height="24" viewBox="0 0 32 32" width="24"><path d="M16 3.5 19.1 11l7.4 3.2-7.4 3.2L16 25l-3.1-7.6-7.4-3.2 7.4-3.2L16 3.5Z" /></svg></div>
            <p style={{ fontWeight: 760, fontSize: 26, letterSpacing: "-.035em", margin: 0 }}>应用暂时无法加载</p>
            <p style={{ color: "#697078", lineHeight: 1.7 }}>请稍后重试。你的数据不会因为刷新页面而被修改。</p>
            <button onClick={reset} style={{ minHeight: 44, border: 0, borderRadius: 14, padding: "0 20px", background: "#151a20", color: "#fffefa", fontWeight: 700, cursor: "pointer", boxShadow: "0 10px 24px rgba(26,31,36,.1)" }}>重新加载</button>
          </div>
        </main>
      </body>
    </html>
  );
}
