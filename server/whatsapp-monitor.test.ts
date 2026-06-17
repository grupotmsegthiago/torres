import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideMonitorAction,
  initialMonitorState,
  downEmailHtmlForTest,
  type MonitorConfig,
} from "./whatsapp-monitor";

const CFG: MonitorConfig = { confirmAfter: 2, remindEveryMs: 2 * 60 * 60 * 1000 };
const T0 = 1_000_000;

test("um soluço transitório (1 leitura caída) NÃO dispara alerta", () => {
  const s0 = initialMonitorState();
  const r1 = decideMonitorAction(s0, false, T0, CFG);
  assert.equal(r1.action, "none");
  assert.equal(r1.state.isDown, false);
  assert.equal(r1.state.consecutiveDown, 1);

  // voltou no ar antes de confirmar → nada, e zera o contador
  const r2 = decideMonitorAction(r1.state, true, T0 + 1000, CFG);
  assert.equal(r2.action, "none");
  assert.equal(r2.state.isDown, false);
  assert.equal(r2.state.consecutiveDown, 0);
});

test("queda confirmada após confirmAfter checagens dispara send_down", () => {
  let s = initialMonitorState();
  let r = decideMonitorAction(s, false, T0, CFG);
  assert.equal(r.action, "none");
  r = decideMonitorAction(r.state, false, T0 + 60_000, CFG);
  assert.equal(r.action, "send_down");
  assert.equal(r.state.isDown, true);
  assert.equal(r.state.downSince, T0 + 60_000);
});

test("não re-alerta enquanto caído antes do intervalo de lembrete", () => {
  let r = decideMonitorAction(initialMonitorState(), false, T0, CFG);
  r = decideMonitorAction(r.state, false, T0 + 60_000, CFG); // confirma (send_down)
  assert.equal(r.action, "send_down");
  // ainda caído, 30min depois → sem novo e-mail
  r = decideMonitorAction(r.state, false, T0 + 60_000 + 30 * 60_000, CFG);
  assert.equal(r.action, "none");
});

test("re-lembrete após remindEveryMs enquanto continua caído", () => {
  let r = decideMonitorAction(initialMonitorState(), false, T0, CFG);
  r = decideMonitorAction(r.state, false, T0 + 60_000, CFG); // confirma
  const confirmedAt = r.state.lastDownAlertAt;
  // 2h+ depois ainda caído → novo lembrete
  r = decideMonitorAction(r.state, false, confirmedAt + CFG.remindEveryMs + 1, CFG);
  assert.equal(r.action, "send_down");
});

test("recuperação dispara send_recovery e limpa downSince", () => {
  let r = decideMonitorAction(initialMonitorState(), false, T0, CFG);
  r = decideMonitorAction(r.state, false, T0 + 60_000, CFG); // confirma queda
  assert.equal(r.state.isDown, true);
  r = decideMonitorAction(r.state, true, T0 + 120_000, CFG); // voltou
  assert.equal(r.action, "send_recovery");
  assert.equal(r.state.isDown, false);
  assert.equal(r.state.downSince, null);
});

test("leitura indeterminada (null) conta como queda e confirma com debounce", () => {
  let r = decideMonitorAction(initialMonitorState(), null, T0, CFG);
  assert.equal(r.action, "none");
  r = decideMonitorAction(r.state, null, T0 + 60_000, CFG);
  assert.equal(r.action, "send_down");
  assert.equal(r.state.isDown, true);
});

test("e-mail de queda muda conforme a causa (desconectado vs número errado)", () => {
  const disc = downEmailHtmlForTest(T0, "disconnected");
  assert.match(disc, /DESCONECTOU/);
  const wrong = downEmailHtmlForTest(T0, "wrong_number");
  assert.match(wrong, /N[ÚU]MERO ERRADO/);
  assert.match(wrong, /Reconecte o n[úu]mero oficial/i);
});

test("estável no ar não dispara nada", () => {
  let s = initialMonitorState();
  for (let i = 0; i < 5; i++) {
    const r = decideMonitorAction(s, true, T0 + i * 60_000, CFG);
    assert.equal(r.action, "none");
    s = r.state;
  }
  assert.equal(s.isDown, false);
  assert.equal(s.downSince, null);
});
