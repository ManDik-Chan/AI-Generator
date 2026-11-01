import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthForm } from "./auth-form";

const action = async () => ({});
const render = (mode: "login" | "signup") => renderToStaticMarkup(createElement(AuthForm, { action, mode }));
const input = (html: string, name: string) => html.match(new RegExp(`<input\\b[^>]*\\bname="${name}"[^>]*>`))?.[0] ?? "";

describe("password manager form compatibility", () => {
  it("identifies the login account and existing password with stable native fields", () => {
    const html = render("login");
    const email = input(html, "email");
    const password = input(html, "password");
    expect(html).toMatch(/<form\b[^>]*autoComplete="on"/);
    expect(email).toContain('type="email"');
    expect(email).toContain('autoComplete="username"');
    expect(email).toContain('id="email"');
    expect(password).toContain('type="password"');
    expect(password).toContain('autoComplete="current-password"');
    expect(password).not.toMatch(/value=|minLength=/);
    expect(html).toContain('<label class="text-label" for="email">');
    expect(html).toContain('<label class="text-label" for="password">');
    expect(html).toMatch(/<button\b[^>]*type="submit"[^>]*>登录<\/button>/);
  });

  it("distinguishes password creation from login and keeps signup length validation", () => {
    const html = render("signup");
    expect(input(html, "email")).toContain('autoComplete="username"');
    expect(input(html, "password")).toContain('autoComplete="new-password"');
    expect(input(html, "password")).toContain('minLength="8"');
    expect(input(html, "password")).toContain('aria-describedby="password-description"');
    expect(input(html, "displayName")).toContain('autoComplete="name"');
    expect(html).not.toContain('name="rememberMe"');
  });

  it("offers an unchecked, submitted persistence preference with shared-device guidance", () => {
    const html = render("login");
    const remember = input(html, "rememberMe");
    expect(remember).toContain('type="checkbox"');
    expect(remember).toContain('value="on"');
    expect(remember).toContain('aria-describedby="rememberMe-description"');
    expect(remember).not.toContain("checked");
    expect(html).toContain('for="rememberMe"');
    expect(html).toContain("共享设备使用后请退出登录。");
  });

  it("keeps the password visibility control out of form submission", () => {
    expect(render("login")).toMatch(/<button\b[^>]*aria-label="显示密码"[^>]*type="button"/);
  });
});
