/*
 * Server-renders the create panel and the draft editor from real store snapshots (stateful fake
 * server). Local browser automation is paused (AGENTS.md); this checks content, states and which
 * controls exist, not layout.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CreateProjectView } from "@/features/developer-console/components/registry-create";
import { DraftEditorView, type EditorActions } from "@/features/developer-console/components/registry-draft-editor";
import { RegistryWorkbenchView } from "@/features/developer-console/components/registry-workbench";
import { createRegistryReadClient } from "@/features/developer-console/registry/client";
import { createProjectCreateStore } from "@/features/developer-console/registry/create-store";
import { createDraftEditorStore } from "@/features/developer-console/registry/draft-editor";
import { createOverviewStore } from "@/features/developer-console/registry/store";
import { createRegistryWriteClient } from "@/features/developer-console/registry/write-client";
import { FIXED_NOW, defaultRoutes, err, fakeFetch } from "@/tests/fixtures/registry-console-read";
import { PROJECT, TOKEN, fakeRegistry, validPayload } from "@/tests/fixtures/registry-console-write";

const base = "/developer/registry";
const noop = () => {};
const actions: EditorActions = { onEdit: noop, onSave: noop, onDiscard: noop, onRetry: noop, onVerify: noop, onAbandon: noop, onReload: noop, onResolve: noop };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function stores(server: ReturnType<typeof fakeRegistry>) {
  const getAccessToken = async () => TOKEN;
  const read = createRegistryReadClient({ fetch: server.fetch, getAccessToken });
  const write = createRegistryWriteClient({ fetch: server.fetch, getAccessToken });
  return { editor: createDraftEditorStore(read, write, PROJECT), creator: createProjectCreateStore(write) };
}
const renderEditor = (store: ReturnType<typeof stores>["editor"]) =>
  renderToStaticMarkup(createElement(DraftEditorView, { snapshot: store.getSnapshot(), base, now: FIXED_NOW, actions }));
const renderCreate = (store: ReturnType<typeof stores>["creator"]) =>
  renderToStaticMarkup(createElement(CreateProjectView, { snapshot: store.getSnapshot(), base, now: FIXED_NOW, onSubmit: noop, onRetry: noop, onAbandon: noop, onReset: noop }));

describe("create panel", () => {
  it("is offered only after the server confirmed the account's qualifications", async () => {
    const render = async (routes = defaultRoutes()) => {
      const client = createRegistryReadClient({ fetch: fakeFetch(routes).fetch, getAccessToken: async () => TOKEN });
      const overview = createOverviewStore(client);
      await overview.refresh();
      return renderToStaticMarkup(createElement(RegistryWorkbenchView, { snapshot: overview.getSnapshot(), base, mockHref: "/developer", now: FIXED_NOW, onRefresh: noop, onLoadMore: noop, create: createElement("p", null, "CREATE-PANEL") }));
    };
    expect(await render()).toContain("CREATE-PANEL");
    const failed = await render({ ...defaultRoutes(), qualifications: err("FORBIDDEN", 403) });
    expect(failed).not.toContain("CREATE-PANEL");
    expect(failed).toContain("不提供创建项目入口");
    expect(await render({ ...defaultRoutes(), qualifications: err("DISABLED", 403), projects: err("DISABLED", 403) })).not.toContain("CREATE-PANEL");
  });

  it("says eligibility is decided on submit, and after a refusal shows no form at all", async () => {
    const server = fakeRegistry();
    const { creator } = stores(server);
    const open = renderCreate(creator);
    expect(open).toContain("<form");
    expect(text(open)).toContain("提交后由服务端判定");
    expect(text(open)).toContain("OWNER 角色不包含 EDIT_DRAFT");
    server.state.canCreate = false;
    await creator.submit("denied-project");
    const denied = renderCreate(creator);
    expect(denied).not.toMatch(/<form|<button|<input/);
    expect(text(denied)).toContain("403 FORBIDDEN");
  });

  it("an uncertain result locks the slug and offers only the identical retry or abandoning it", async () => {
    const server = fakeRegistry();
    const { creator } = stores(server);
    server.state.dropAfterCommit = 1;
    await creator.submit("maybe-project");
    const html = renderCreate(creator);
    expect(text(html)).toContain("结果未知");
    expect(html).toContain("用同一请求重试");
    expect(html).not.toContain("创建私有项目");
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*value="maybe-project"|<input[^>]*value="maybe-project"[^>]*disabled=""/);
    expect(text(html)).not.toContain("已创建");
  });
});

describe("draft editor", () => {
  it("without EDIT_DRAFT the form is disabled and says why; OWNER alone is not enough", async () => {
    const server = fakeRegistry({ payload: validPayload() });
    server.state.editGrant = false;
    const { editor } = stores(server);
    await editor.load();
    const html = renderEditor(editor);
    expect(text(html)).toContain("没有 EDIT_DRAFT 资格");
    expect(text(html)).toContain("项目所有者不会自动获得这项资格");
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    const save = [...html.matchAll(/<button([^>]*)>((?:(?!<\/button>)[\s\S])*)<\/button>/g)].find((match) => match[2].includes("保存草稿"));
    expect(save?.[1]).toContain('disabled=""');
  });

  it("separates unsaved edits from what the server confirmed", async () => {
    const server = fakeRegistry({ payload: validPayload() });
    const { editor } = stores(server);
    await editor.load();
    expect(text(renderEditor(editor))).toContain("与服务端一致 · rev 1");
    editor.edit({ ...editor.getSnapshot().working!, manifest: { ...editor.getSnapshot().working!.manifest, summary: "changed" } });
    const dirty = text(renderEditor(editor));
    expect(dirty).toContain("有未保存的修改");
    expect(dirty).toContain("基于服务端 rev 1");
    await editor.save();
    expect(text(renderEditor(editor))).toContain("已由服务端确认保存为 rev 2");
  });

  it("shows an uncertain save as unknown with the identical retry, never as saved", async () => {
    const server = fakeRegistry({ payload: validPayload() });
    const { editor } = stores(server);
    await editor.load();
    editor.edit({ ...editor.getSnapshot().working!, manifest: { ...editor.getSnapshot().working!.manifest, summary: "lost" } });
    server.state.dropBeforeCommit = 1;
    await editor.save();
    const plain = text(renderEditor(editor));
    expect(plain).toContain("结果未知");
    expect(plain).toContain("用同一请求重试");
    expect(plain).not.toContain("已由服务端确认保存");
  });

  it("a 412 conflict lists the differences and offers both explicit choices", async () => {
    const server = fakeRegistry({ payload: validPayload() });
    const { editor } = stores(server);
    await editor.load();
    editor.edit({ ...editor.getSnapshot().working!, manifest: { ...editor.getSnapshot().working!.manifest, summary: "mine" } });
    server.otherWriterSaves(validPayload("1.0.0", "theirs"));
    await editor.save();
    const plain = text(renderEditor(editor));
    expect(plain).toContain("版本冲突 · 没有覆盖任何内容");
    expect(plain).toContain("我的：mine");
    expect(plain).toContain("服务端：theirs");
    expect(plain).toContain("保留我的修改，基于服务端版本继续");
    expect(plain).toContain("采用服务端版本");
  });

  it("renders stored text as text", async () => {
    const payload = validPayload();
    payload.manifest.summary = '<img src=x onerror="alert(1)">';
    const { editor } = stores(fakeRegistry({ payload }));
    await editor.load();
    const html = renderEditor(editor);
    expect(html).not.toContain("<img src=x");
  });
});
