import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const layout = readFileSync(path.join(root, "client/src/components/admin/layout.tsx"), "utf8");
const html = readFileSync(path.join(root, "client/index.html"), "utf8");

test("header mobile do admin recua o relógio/Dynamic Island do iPhone", () => {
  assert.match(layout, /pt-\[calc\(0\.75rem\+env\(safe-area-inset-top,0px\)\)\]/);
  assert.match(layout, /data-testid="button-toggle-sidebar"/);
  assert.match(layout, /min-h-11 min-w-11/);
  const headerBlock = layout.slice(layout.indexOf("button-toggle-sidebar") - 400, layout.indexOf("button-toggle-sidebar") + 200);
  assert.doesNotMatch(headerBlock, /\bpy-3\b/);
});

test("drawer do admin também respeita safe-area e fecha ao navegar", () => {
  assert.match(layout, /pt-\[calc\(1rem\+env\(safe-area-inset-top,0px\)\)\]/);
  assert.match(layout, /pb-\[calc\(1rem\+env\(safe-area-inset-bottom,0px\)\)\]/);
  assert.match(layout, /setSidebarOpen\(false\)/);
  assert.match(layout, /data-testid="button-close-sidebar"/);
});

test("PWA iPhone continua viewport-fit=cover; o recuo é no header, não no meta", () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
});

test("recorte do Ricardo e do Moacir permanece no layout", () => {
  assert.match(layout, /isRicardoSemFinanceiro/);
  assert.match(layout, /isMoacirRestrito/);
});
