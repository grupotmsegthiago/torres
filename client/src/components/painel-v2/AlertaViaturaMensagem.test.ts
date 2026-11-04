import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertaViaturaMensagem } from "./AlertaViaturaMensagem";

const base = {
  plate: "ABC1D23",
  driver: "João",
  message: "Na origem",
  time: "13:40",
  imageUrl: "/assets/escolta-virtus.png",
  onClose: () => {},
  onMarkRead: () => {},
};

test("o aviso da atualização oferece WhatsApp com foto e texto", () => {
  const html = renderToStaticMarkup(createElement(AlertaViaturaMensagem, { ...base, onShare: () => {} }));
  assert.match(html, /data-testid="button-alerta-whatsapp"/);
  assert.match(html, /foto e texto/);
  assert.match(html, /max-h-\[92vh\]/);
  assert.match(html, /overflow-y-auto/);
  assert.match(html, /overflow-x-hidden/);
});

test("sem compartilhamento o aviso não mostra o botão", () => {
  const html = renderToStaticMarkup(createElement(AlertaViaturaMensagem, base));
  assert.equal(html.includes("button-alerta-whatsapp"), false);
});
