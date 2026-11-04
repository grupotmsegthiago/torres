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

test("o aviso mostra cliente, origem e destino da missão", () => {
  const html = renderToStaticMarkup(createElement(AlertaViaturaMensagem, {
    ...base,
    clientName: "TRANSPORTES LOPES",
    origin: "Rua da Origem, 10, Campinas - SP",
    destination: "Avenida do Destino, 20, Santos - SP",
  }));
  assert.match(html, /data-testid="alerta-cliente"/);
  assert.match(html, /Transportes Lopes/);
  assert.match(html, /data-testid="alerta-origem"/);
  assert.match(html, /Rua da Origem, 10, Campinas - SP/);
  assert.match(html, /data-testid="alerta-destino"/);
  assert.match(html, /Avenida do Destino, 20, Santos - SP/);
});

test("o aviso mostra o mapa da rota quando ele é passado", () => {
  const html = renderToStaticMarkup(createElement(AlertaViaturaMensagem, {
    ...base,
    map: createElement("div", { "data-testid": "mapa-rota-os" }, "Rota da origem ao destino"),
  }));
  assert.match(html, /data-testid="alerta-mapa"/);
  assert.match(html, /data-testid="mapa-rota-os"/);
  assert.match(html, /Rota da origem ao destino/);
});

test("sem mapa o aviso não reserva o bloco", () => {
  const html = renderToStaticMarkup(createElement(AlertaViaturaMensagem, base));
  assert.equal(html.includes("alerta-mapa"), false);
});
