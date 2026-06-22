import type { Express } from "express";
  import { storage, toCamelObj, toCamelArray } from "../storage";
  import { supabaseAdmin } from "../supabase";
  import { uploadMissionPhoto, resolvePhotoForView, downloadMissionPhotoDataUri } from "../lib/mission-photos";
  import { requireAuth, requireAdminRole, requireDiretoria } from "../auth";
  import { insertGerenciadoraSchema } from "@shared/schema";
  import * as truckscontrol from "../truckscontrol";
  import { lastMissionPos, lastRecordedPos, MISSION_POS_MIN_DISTANCE } from "./operational";
  import { createSmtpTransporter, getSmtpFrom, parseEmailList, MISSION_STEPS, STEP_REQUIRED_PHOTOS, nowBRTString, haversineDist, removeAutoTransaction, createAutoTransaction } from "./_helpers";
  import { calcularEscolta, extractKmFromText, splitMissionCostsForBilling } from "../billing-calc";
  import { computeCanceladaBilling } from "../lib/cancelada-billing";
  import { buildFinalizedSummary } from "../cron-whatsapp-forward";
  import { logSystemAudit } from "../audit";
  import { randomUUID } from "crypto";

  const INSPECTION_STEPS: Record<string, { type: "plate" | "equipment" | "vehicle_condition" | "odometer" | "agent" | "weapon" | "scene"; expectedItem?: string }> = {
    viatura_frente: { type: "plate", expectedItem: "Dianteira da viatura com placa visível" },
    viatura_lateral_esq: { type: "vehicle_condition", expectedItem: "Lateral esquerda da viatura" },
    viatura_lateral_dir: { type: "vehicle_condition", expectedItem: "Lateral direita da viatura" },
    viatura_traseira: { type: "vehicle_condition", expectedItem: "Traseira da viatura" },
    escoltado_frente: { type: "plate", expectedItem: "Frente do veículo escoltado com placa visível" },
    escoltado_traseira: { type: "plate", expectedItem: "Traseira do veículo escoltado" },
    viatura_retorno_frente: { type: "plate", expectedItem: "Dianteira da viatura no retorno com placa" },
    viatura_retorno_lateral_esq: { type: "vehicle_condition", expectedItem: "Lateral esquerda viatura retorno" },
    viatura_retorno_lateral_dir: { type: "vehicle_condition", expectedItem: "Lateral direita viatura retorno" },
    viatura_retorno_traseira: { type: "vehicle_condition", expectedItem: "Traseira viatura retorno" },
    km_saida: { type: "odometer", expectedItem: "Hodômetro do painel mostrando KM de saída" },
    km_chegada: { type: "odometer", expectedItem: "Hodômetro do painel mostrando KM de chegada" },
    km_final: { type: "odometer", expectedItem: "Hodômetro do painel mostrando KM final" },
    base_hodometro: { type: "odometer", expectedItem: "Hodômetro do painel na base" },
    agente_equipado: { type: "agent", expectedItem: "Agente de escolta devidamente equipado com colete e armamento" },
    arma_pistola_1: { type: "weapon", expectedItem: "Pistola principal do agente" },
    arma_pistola_2: { type: "weapon", expectedItem: "Segunda pistola" },
    arma_espingarda: { type: "weapon", expectedItem: "Espingarda / arma longa" },
    foto_local_destino: { type: "scene", expectedItem: "Local de destino da entrega" },
    foto_local_origem: { type: "scene", expectedItem: "Local de origem da coleta" },
  };

  const CHECKLIST_EQUIPMENT_MAP: Record<string, string> = {
    estepe: "pneu estepe reserva",
    chave_roda: "chave de roda",
    macaco: "macaco hidráulico ou mecânico",
    triangulo: "triângulo de sinalização",
  };

  const LEARNING_MODE = true;

  const LOW_LIGHT_KEYWORDS = [
    "baixa iluminação", "pouca luz", "escuro", "noturno", "noite",
    "iluminação insuficiente", "difícil visualização", "pouca visibilidade",
    "iluminação precária", "sem iluminação", "penumbra", "mal iluminad",
    "ilegível", "não é possível ler", "não foi possível identificar",
    "visibilidade comprometida", "imagem escura", "foto escura",
  ];

  function isNightTime(): boolean {
    const brHour = parseInt(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
    return brHour >= 18 || brHour < 6;
  }

  function hasLowLightIssue(result: any): boolean {
    const text = JSON.stringify(result).toLowerCase();
    return LOW_LIGHT_KEYWORDS.some(kw => text.includes(kw));
  }

  function shouldAutoApprove(result: any, step: string, inspectionConfig: any): { approve: boolean; reason: string } {
    if (!LEARNING_MODE) return { approve: false, reason: "" };

    const nightMode = isNightTime();
    const lowLight = hasLowLightIssue(result);

    if (inspectionConfig?.type === "plate") {
      if (!result.placa_detectada || result.placa_confere === null) {
        if (nightMode || lowLight) {
          return { approve: true, reason: "Placa não identificada (baixa iluminação/noturno) — modo aprendizado" };
        }
        return { approve: true, reason: "Placa não identificada pela IA — modo aprendizado, liberando agente" };
      }
    }

    if (inspectionConfig?.type === "agent") {
      if (result.colete_visivel === false || result.item_encontrado === false) {
        if (nightMode || lowLight) {
          return { approve: true, reason: "Colete/equipamento não identificado (baixa iluminação/noturno) — modo aprendizado" };
        }
        return { approve: true, reason: "Colete/equipamento não identificado pela IA — modo aprendizado, liberando agente" };
      }
    }

    if (lowLight || nightMode) {
      const divs = result.divergencias || [];
      const allLightRelated = divs.length > 0 && divs.every((d: string) => {
        const dl = d.toLowerCase();
        return LOW_LIGHT_KEYWORDS.some(kw => dl.includes(kw)) ||
          dl.includes("não identificad") || dl.includes("não foi possível") ||
          dl.includes("ilegível") || dl.includes("inconclusiv");
      });
      if (allLightRelated) {
        return { approve: true, reason: `Divergências relacionadas à iluminação (${nightMode ? "horário noturno" : "baixa luz"}) — modo aprendizado` };
      }
    }

    if (result.condicao === "inconclusivo") {
      return { approve: true, reason: "Condição inconclusiva — modo aprendizado, liberando agente" };
    }

    const COSMETIC_KEYWORDS = [
      "ferrugem", "sujeira", "sujo", "poeira", "mancha", "manchas",
      "arranhão", "arranhões", "risco", "riscos", "desbotad",
      "oxidação", "oxidado", "encardido", "lama", "barro",
      "descascad", "desgaste", "desgastad", "pequeno", "leve",
      "superficial", "superfície", "cosmético", "estético",
    ];

    const divs = result.divergencias || [];
    if (divs.length > 0) {
      const allCosmetic = divs.every((d: string) => {
        const dl = d.toLowerCase();
        return COSMETIC_KEYWORDS.some(kw => dl.includes(kw));
      });
      const conditionCosmetic = result.condicao === "dano_visivel" || result.condicao === "irregular";
      if (allCosmetic && conditionCosmetic) {
        return { approve: true, reason: `Condição cosmética (${divs.join("; ")}) — modo aprendizado, não trava operação` };
      }
    }

    if ((result.condicao === "dano_visivel" || result.condicao === "irregular") && divs.length === 0) {
      return { approve: true, reason: `Condição "${result.condicao}" sem divergências específicas — modo aprendizado` };
    }

    return { approve: false, reason: "" };
  }

  async function runPhotoInspection(photoId: number, serviceOrderId: number, employeeId: number, step: string, photoData: string, vehiclePlate?: string, escortedPlate?: string, checklistItems?: string[], kmValue?: number | null): Promise<{ status: string; result: any } | null> {
    const inspectionConfig = INSPECTION_STEPS[step];
    const isChecklistEquipment = checklistItems && checklistItems.length > 0;
    if (!inspectionConfig && !isChecklistEquipment) return null;

    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    if (!apiKey) { console.log("[ai-inspection] No AI key, skipping"); return null; }

    try {
      await supabaseAdmin.from("mission_photos").update({ ai_inspection_status: "analisando" }).eq("id", photoId);

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey, baseURL });

      const nightMode = isNightTime();
      const lightContext = nightMode
        ? "\n\nATENÇÃO: É horário noturno. Considere que a iluminação pode ser precária. Seja mais tolerante com fotos escuras ou com baixa visibilidade. Se não conseguir identificar algo por causa da iluminação, marque como inconclusivo em vez de divergente."
        : "";

      let expectedPlate = "";
      let promptText = "";

      if (inspectionConfig?.type === "plate") {
        if (step.startsWith("escoltado_")) {
          expectedPlate = escortedPlate || "";
        } else {
          expectedPlate = vehiclePlate || "";
        }
        promptText = `Você é um auditor de inspeção veicular de uma empresa de escolta armada.
Analise esta foto e valide:
1. PLACA: Tente ler a placa do veículo na imagem. A placa esperada é "${expectedPlate}". Compare se a placa visível corresponde.
2. VEÍCULO: Verifique se a foto é do ângulo correto (${inspectionConfig.expectedItem}).
3. CONDIÇÃO: Note qualquer dano visível ou irregularidade no veículo.
${lightContext}
IMPORTANTE: Se a placa não for legível por baixa iluminação ou qualidade da imagem, marque placa_confere como null e placa_detectada como null. NÃO considere isso como divergência.

Responda APENAS com JSON válido (sem markdown):
{
  "placa_detectada": "placa lida ou null se ilegível",
  "placa_confere": true/false/null,
  "angulo_correto": true/false,
  "item_esperado": "${inspectionConfig.expectedItem}",
  "item_encontrado": true/false,
  "condicao": "bom/dano_visivel/irregular/inconclusivo",
  "divergencias": ["lista de problemas"] ou [],
  "observacao": "breve análise"
}`;
      } else if (inspectionConfig?.type === "vehicle_condition") {
        promptText = `Você é um auditor de inspeção veicular de uma empresa de escolta armada.
Analise esta foto e valide:
1. A foto mostra o ângulo correto: ${inspectionConfig.expectedItem}
2. Condição aparente do veículo (danos, arranhões, amassados)
${lightContext}
Responda APENAS com JSON válido (sem markdown):
{
  "placa_detectada": null,
  "placa_confere": null,
  "angulo_correto": true/false,
  "item_esperado": "${inspectionConfig.expectedItem}",
  "item_encontrado": true/false,
  "condicao": "bom/dano_visivel/irregular",
  "divergencias": [] ou ["lista de problemas"],
  "observacao": "breve análise"
}`;
      } else if (inspectionConfig?.type === "odometer") {
        promptText = `Você é um auditor de inspeção veicular de uma empresa de escolta armada.
Analise esta foto do painel/hodômetro do veículo.

IMPORTANTE: Leia o QUILOMETRAGEM TOTAL (KM) do hodômetro principal do veículo.
- O KM total é o número MAIOR mostrado no painel, geralmente com 5 ou 6 dígitos (ex: 4401, 12350, 98742).
- IGNORE valores de "Trip", "Trip A", "Trip B" ou parciais — esses são números menores e resetáveis que NÃO representam o KM real do veículo.
- Se houver dois valores visíveis (KM total e trip parcial), leia APENAS o KM total (o número maior).
- O KM total nunca é resetado e sempre é o valor de referência.

1. Leia o valor do KM total (hodômetro principal) visível no painel.
2. Verifique se a foto é nítida e legível.
3. Confirme se realmente mostra um painel de veículo com hodômetro.
${kmValue ? `O valor informado pelo agente foi: ${kmValue} km.` : ""}

Responda APENAS com JSON válido (sem markdown):
{
  "placa_detectada": null,
  "placa_confere": null,
  "angulo_correto": true/false,
  "item_esperado": "${inspectionConfig.expectedItem}",
  "item_encontrado": true/false,
  "km_lido": number ou null,
  "km_informado": ${kmValue || "null"},
  "km_confere": true/false/null,
  "condicao": "legivel/parcialmente_legivel/ilegivel",
  "divergencias": [] ou ["lista de problemas"],
  "observacao": "breve análise"
}`;
      } else if (inspectionConfig?.type === "agent") {
        promptText = `Você é um auditor de segurança de uma empresa de escolta armada.
Analise esta foto do agente de escolta. Verifique:
1. O agente está usando colete balístico/tático?
2. O agente está portando arma de fogo visível (no coldre ou em mãos)?
3. A apresentação geral é profissional e adequada para operação de escolta?
4. O uniforme está correto (se visível)?
${lightContext}
IMPORTANTE: Se a iluminação estiver ruim e não for possível identificar colete ou armamento claramente, marque como inconclusivo em vez de divergente. Em ambiente noturno é normal ter dificuldade de visualização desses itens.

Responda APENAS com JSON válido (sem markdown):
{
  "placa_detectada": null,
  "placa_confere": null,
  "angulo_correto": true/false,
  "item_esperado": "${inspectionConfig.expectedItem}",
  "item_encontrado": true/false,
  "colete_visivel": true/false,
  "armamento_visivel": true/false,
  "uniforme_correto": true/false/null,
  "apresentacao": "adequada/inadequada/inconclusivo",
  "condicao": "bom/irregular/inconclusivo",
  "divergencias": [] ou ["lista de problemas"],
  "observacao": "breve análise"
}`;
      } else if (inspectionConfig?.type === "weapon") {
        promptText = `Você é um auditor de segurança de uma empresa de escolta armada.
Analise esta foto de armamento. Verifique:
1. A foto mostra claramente uma arma de fogo (${inspectionConfig.expectedItem})?
2. É possível identificar o tipo de arma (pistola, espingarda, etc)?
3. A arma aparenta estar em bom estado de conservação?
4. A foto foi tirada de forma adequada para registro/controle?
${lightContext}
Responda APENAS com JSON válido (sem markdown):
{
  "placa_detectada": null,
  "placa_confere": null,
  "angulo_correto": true/false,
  "item_esperado": "${inspectionConfig.expectedItem}",
  "item_encontrado": true/false,
  "tipo_arma": "pistola/espingarda/outra/nao_identificada",
  "condicao": "bom/danificado/inconclusivo",
  "divergencias": [] ou ["lista de problemas"],
  "observacao": "breve análise"
}`;
      } else if (inspectionConfig?.type === "scene") {
        promptText = `Você é um auditor operacional de uma empresa de escolta armada.
Analise esta foto do local (${inspectionConfig.expectedItem}). Verifique:
1. A foto mostra um local adequado (pátio, portaria, doca de carga)?
2. Há elementos identificáveis do local (nome da empresa, endereço, placa)?
3. As condições ambientais estão normais (iluminação, segurança)?
${lightContext}
IMPORTANTE: Em horário noturno, é normal que o local não seja totalmente identificável. Se a foto mostra um local mas com pouca iluminação, marque como inconclusivo em vez de divergente.

Responda APENAS com JSON válido (sem markdown):
{
  "placa_detectada": null,
  "placa_confere": null,
  "angulo_correto": true/false,
  "item_esperado": "${inspectionConfig.expectedItem}",
  "item_encontrado": true/false,
  "local_identificavel": true/false,
  "condicao": "adequado/inadequado/inconclusivo",
  "divergencias": [] ou ["lista de problemas"],
  "observacao": "breve análise"
}`;
      } else if (isChecklistEquipment) {
        const itemsList = checklistItems.map(i => CHECKLIST_EQUIPMENT_MAP[i] || i).join(", ");
        promptText = `Você é um auditor de inspeção veicular de uma empresa de escolta armada.
A viatura de placa "${vehiclePlate}" deve conter os seguintes itens de segurança: ${itemsList}.
Analise esta foto e identifique se os equipamentos obrigatórios estão visíveis e em bom estado.
${lightContext}
Responda APENAS com JSON válido (sem markdown):
{
  "placa_detectada": null,
  "placa_confere": null,
  "angulo_correto": true,
  "item_esperado": "${itemsList}",
  "item_encontrado": true/false,
  "condicao": "bom/ausente/danificado",
  "equipamentos": {${checklistItems.map(i => `"${i}": {"presente": true/false, "estado": "bom/danificado/ausente"}`).join(", ")}},
  "divergencias": [] ou ["lista de problemas"],
  "observacao": "breve análise"
}`;
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        reasoning_effort: "minimal",
        messages: [
          { role: "system", content: promptText },
          {
            role: "user",
            content: [
              { type: "text", text: "Analise esta foto de inspeção veicular:" },
              { type: "image_url", image_url: { url: photoData } },
            ],
          },
        ],
        max_completion_tokens: 600,
      });

      let raw = response.choices[0]?.message?.content || "";
      let result: any;
      try {
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        result = JSON.parse(cleaned);
      } catch {
        result = { divergencias: ["Não foi possível analisar automaticamente"], observacao: raw, angulo_correto: true, item_encontrado: true, condicao: "inconclusivo" };
      }

      if (inspectionConfig?.type === "odometer" && kmValue && result.km_lido != null) {
        const kmInformado = Number(kmValue);
        const kmLido = Number(result.km_lido);
        const diff = Math.abs(kmLido - kmInformado);
        const tolerancePct = 0.02;
        const toleranceAbs = 10;
        const withinTolerance = diff <= Math.max(kmInformado * tolerancePct, toleranceAbs);

        if (!withinTolerance) {
          const MAX_RETRIES = 2;
          const readings = [kmLido];
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
              const retryPrompt = `Você é um auditor de inspeção veicular. Releia com MÁXIMA ATENÇÃO o hodômetro nesta foto.
O valor informado pelo agente é ${kmValue} km. Na tentativa anterior, foi lido ${kmLido} km.
Analise novamente com cuidado cada dígito. Dígitos como 1 e 6, 0 e 6, 1 e 7 podem ser confundidos.
Leia o KM total do hodômetro principal (número maior, 4-6 dígitos). IGNORE o trip/parcial.
Responda APENAS com JSON: {"km_lido": number}`;
              const retryResponse = await openai.chat.completions.create({
                model: "gpt-5-mini",
                reasoning_effort: "minimal",
                messages: [
                  { role: "system", content: retryPrompt },
                  { role: "user", content: [{ type: "text", text: "Releia o hodômetro:" }, { type: "image_url", image_url: { url: photoData } }] },
                ],
                max_completion_tokens: 100,
              });
              const retryRaw = retryResponse.choices[0]?.message?.content || "";
              const retryCleaned = retryRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
              const retryResult = JSON.parse(retryCleaned);
              if (retryResult.km_lido != null) {
                readings.push(Number(retryResult.km_lido));
                const retryDiff = Math.abs(Number(retryResult.km_lido) - kmInformado);
                if (retryDiff <= Math.max(kmInformado * tolerancePct, toleranceAbs)) {
                  result.km_lido = Number(retryResult.km_lido);
                  result.km_confere = true;
                  result.divergencias = [];
                  result.observacao = `Releitura confirmou ${retryResult.km_lido} km (tentativa ${attempt + 2}). Confere com informado.`;
                  console.log(`[ai-inspection] Odometer retry ${attempt + 1}: ${retryResult.km_lido} — matches agent value`);
                  break;
                }
              }
            } catch (retryErr: any) {
              console.log(`[ai-inspection] Odometer retry ${attempt + 1} failed: ${retryErr.message}`);
            }
          }

          const finalKmLido = Number(result.km_lido);
          const finalDiff = Math.abs(finalKmLido - kmInformado);
          if (finalDiff <= Math.max(kmInformado * tolerancePct, toleranceAbs)) {
            result.km_confere = true;
            result.divergencias = (result.divergencias || []).filter((d: string) => !d.toLowerCase().includes("km") && !d.toLowerCase().includes("hodômetro") && !d.toLowerCase().includes("discrepância"));
          } else {
            const mostCommon = readings.sort((a, b) => readings.filter(v => v === a).length - readings.filter(v => v === b).length).pop()!;
            result.km_lido = mostCommon;
            result.observacao = `Leituras da IA: ${readings.join(", ")} km. Valor mais frequente: ${mostCommon}. Informado: ${kmValue}.`;
          }
        } else {
          result.km_confere = true;
          result.divergencias = (result.divergencias || []).filter((d: string) => !d.toLowerCase().includes("km") && !d.toLowerCase().includes("hodômetro") && !d.toLowerCase().includes("discrepância"));
          if (!result.observacao || result.observacao.includes("diverge")) {
            result.observacao = `Hodômetro lido: ${kmLido} km. Dentro da margem de tolerância do informado (${kmValue} km).`;
          }
        }
      }

      if (inspectionConfig?.type === "plate" && expectedPlate) {
        const normPlate = (s: string) => String(s || "").replace(/[-\s.]/g, "").toUpperCase();
        const expected = normPlate(expectedPlate);
        const detected = normPlate(result.placa_detectada || "");
        if (detected && expected) {
          if (detected === expected) {
            result.placa_confere = true;
            result.divergencias = (result.divergencias || []).filter((d: string) => !d.toLowerCase().includes("placa"));
            if (!result.observacao || result.observacao.toLowerCase().includes("não confere") || result.observacao.toLowerCase().includes("diverge")) {
              result.observacao = `Placa ${detected} confere com a esperada.`;
            }
          } else {
            let diff = 0;
            const maxLen = Math.max(detected.length, expected.length);
            for (let i = 0; i < maxLen; i++) {
              if ((detected[i] || "") !== (expected[i] || "")) diff++;
            }
            if (diff <= 1 && maxLen >= 6) {
              result.placa_confere = true;
              result.divergencias = (result.divergencias || []).filter((d: string) => !d.toLowerCase().includes("placa"));
              result.observacao = `Placa detectada "${detected}" ~= esperada "${expected}" (${diff} char diff, tolerada). Aprovado.`;
              console.log(`[ai-inspection] Plate fuzzy match: detected="${detected}" expected="${expected}" diff=${diff} → approved`);
            }
          }
        }
        if (result.placa_confere !== false && !detected) {
          result.placa_confere = null;
          result.divergencias = (result.divergencias || []).filter((d: string) => !d.toLowerCase().includes("placa"));
        }
      }

      const hasDivergence = (result.divergencias && result.divergencias.length > 0) ||
        result.placa_confere === false ||
        result.angulo_correto === false ||
        result.item_encontrado === false ||
        result.condicao === "dano_visivel" || result.condicao === "irregular" || result.condicao === "ausente" || result.condicao === "danificado";

      const status = "aprovado";

      if (hasDivergence) {
        result._observacoes_ia = result.divergencias || [];
        result._condicao_detectada = result.condicao;
        console.log(`[ai-inspection] Photo #${photoId} step=${step}: divergências registradas como relatório (não trava operação): ${(result.divergencias || []).join("; ")}`);
      }

      await supabaseAdmin.from("mission_photos").update({
        ai_inspection_status: status,
        ai_inspection_result: { status, ...result },
      }).eq("id", photoId);

      await supabaseAdmin.from("inspection_logs").insert({
        mission_photo_id: photoId,
        service_order_id: serviceOrderId,
        employee_id: employeeId,
        step,
        expected_plate: expectedPlate || null,
        detected_plate: result.placa_detectada || null,
        plate_match: result.placa_confere ?? null,
        expected_item: inspectionConfig?.expectedItem || (isChecklistEquipment ? checklistItems.join(", ") : null),
        item_detected: result.item_encontrado ?? null,
        item_condition: result.condicao || null,
        divergences: result.divergencias || [],
        ai_raw_response: raw,
        status,
        alerted: hasDivergence,
      });

      console.log(`[ai-inspection] Photo #${photoId} step=${step} → ${status}`);

      const aiResult = { status, ...result };

      const ESCORTED_PLATE_PAIRS: Record<string, string> = {
        escoltado_frente: "escoltado_traseira",
        escoltado_traseira: "escoltado_frente",
      };
      const VIATURA_PLATE_PAIRS: Record<string, string> = {
        viatura_frente: "viatura_traseira",
        viatura_traseira: "viatura_frente",
      };
      const platePairStep = ESCORTED_PLATE_PAIRS[step] || VIATURA_PLATE_PAIRS[step];

      if (platePairStep && inspectionConfig?.type === "plate") {
        try {
          const { data: pairPhotos } = await supabaseAdmin.from("mission_photos")
            .select("id, step, ai_inspection_status, ai_inspection_result")
            .eq("service_order_id", serviceOrderId)
            .eq("step", platePairStep)
            .not("ai_inspection_status", "is", null);

          const pairPhoto = pairPhotos?.[pairPhotos.length - 1];

          if (pairPhoto && pairPhoto.ai_inspection_status !== "analisando") {
            const pairResult = pairPhoto.ai_inspection_result || {};
            const thisPlateOk = result.placa_confere === true;
            const pairPlateOk = pairResult.placa_confere === true;

            if (thisPlateOk || pairPlateOk) {
              const divergentId = thisPlateOk ? pairPhoto.id : photoId;
              const divergentStep = thisPlateOk ? platePairStep : step;
              const approvedPlateStep = thisPlateOk ? step : platePairStep;
              const divergentResult = thisPlateOk ? pairResult : result;

              const otherDivergences = (divergentResult.divergencias || []).filter(
                (d: string) => !/placa.*n[aã]o.*confere|placa.*diferente|n[aã]o.*correspond/i.test(d)
              );
              const onlyPlateDivergence =
                divergentResult.placa_confere === false &&
                divergentResult.angulo_correto !== false &&
                divergentResult.item_encontrado !== false &&
                divergentResult.condicao !== "dano_visivel" &&
                divergentResult.condicao !== "irregular" &&
                divergentResult.condicao !== "ausente" &&
                divergentResult.condicao !== "danificado" &&
                otherDivergences.length === 0;

              if (onlyPlateDivergence) {
                const upgradedResult = {
                  ...divergentResult,
                  status: "aprovado",
                  placa_aprovada_pelo_par: true,
                  par_aprovado: approvedPlateStep,
                  observacao_par: `Placa confirmada pela foto ${approvedPlateStep}. Pelo menos uma foto (frente/traseira) bateu com a placa esperada.`,
                };

                await supabaseAdmin.from("mission_photos").update({
                  ai_inspection_status: "aprovado",
                  ai_inspection_result: upgradedResult,
                }).eq("id", divergentId);

                await supabaseAdmin.from("inspection_logs").update({
                  status: "aprovado",
                  alerted: false,
                }).eq("mission_photo_id", divergentId);

                console.log(`[ai-inspection] Photo #${divergentId} step=${divergentStep} upgraded to APROVADO (plate matched on ${approvedPlateStep})`);

                if (divergentId === photoId) {
                  aiResult.status = "aprovado";
                  aiResult.placa_aprovada_pelo_par = true;
                }
              }
            }
          }
        } catch (pairErr: any) {
          console.error(`[ai-inspection] Pair check error: ${pairErr.message}`);
        }
      }

      // Email só em casos GRAVES: placa não confere OU condição crítica (dano/ausente)
      const isCritical = result.placa_confere === false ||
        result.condicao === "dano_visivel" || result.condicao === "danificado" || result.condicao === "ausente";

      if (hasDivergence && isCritical) {
        try {
          const so = await storage.getServiceOrder(serviceOrderId);
          const emp = await storage.getEmployee(employeeId);
          const vehicle = so?.vehicleId ? await storage.getVehicle(so.vehicleId) : null;
          const osNumber = so?.osNumber || `#${serviceOrderId}`;
          const agentName = emp?.name || "N/A";
          const plate = vehicle?.plate || vehiclePlate || "N/A";
          const timeBRT = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
          const divergencias = (result.divergencias || []).map((d: string) => `<li style="color:#e67e22">${d}</li>`).join("");

          const isUrl = photoData.startsWith("http");
          const isBase64 = photoData.startsWith("data:image/");
          const photoImgTag = isUrl
            ? `<img src="${photoData}" style="max-width:100%;border-radius:6px;border:1px solid #e0e0e0" alt="Foto da inspeção" />`
            : isBase64
            ? `<img src="cid:inspection-photo" style="max-width:100%;border-radius:6px;border:1px solid #e0e0e0" alt="Foto da inspeção" />`
            : "";

          const html = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#e67e22;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">
                <h2 style="margin:0;font-size:18px">📋 Relatório: Observação na Inspeção (IA)</h2>
              </div>
              <div style="background:#fff;border:1px solid #e0e0e0;padding:24px;border-radius:0 0 8px 8px">
                <p style="margin:0 0 16px;color:#333">A IA identificou observações durante a inspeção. <strong>A operação não foi travada.</strong></p>
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
                  <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold;width:40%">Missão</td><td style="padding:6px 12px">${osNumber}</td></tr>
                  <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Viatura</td><td style="padding:6px 12px">${plate}</td></tr>
                  <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Agente</td><td style="padding:6px 12px">${agentName}</td></tr>
                  <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Etapa</td><td style="padding:6px 12px">${step}</td></tr>
                  <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Data/Hora</td><td style="padding:6px 12px">${timeBRT}</td></tr>
                  ${result.placa_detectada ? `<tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Placa Detectada</td><td style="padding:6px 12px;color:${result.placa_confere === false ? '#c0392b' : '#27ae60'};font-weight:bold">${result.placa_detectada}</td></tr>` : ""}
                  ${expectedPlate ? `<tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Placa Esperada</td><td style="padding:6px 12px">${expectedPlate}</td></tr>` : ""}
                  <tr><td style="padding:6px 12px;background:#f8f9fa;font-weight:bold">Condição</td><td style="padding:6px 12px;font-weight:bold;color:${result.condicao === 'bom' ? '#27ae60' : '#c0392b'}">${result.condicao || "N/A"}</td></tr>
                </table>
                ${divergencias ? `<div style="background:#fdf2f2;border:1px solid #f5c6cb;border-radius:6px;padding:12px;margin-bottom:16px"><p style="margin:0 0 8px;font-weight:bold;color:#c0392b">Divergências:</p><ul style="margin:0;padding-left:20px">${divergencias}</ul></div>` : ""}
                ${result.observacao ? `<p style="margin:0 0 16px;color:#555"><strong>Observação IA:</strong> ${result.observacao}</p>` : ""}
                ${photoImgTag ? `<div style="margin:0 0 16px;text-align:center"><p style="margin:0 0 8px;font-weight:bold;color:#333;font-size:13px">📸 Foto Analisada (${step}):</p>${photoImgTag}</div>` : ""}
                ${isUrl ? `<p style="margin:0 0 16px;text-align:center"><a href="${photoData}" style="color:#2980b9;font-size:12px">Abrir foto em tamanho original</a></p>` : ""}
                <p style="margin:0;font-size:12px;color:#999">Alerta automático — Torres Vigilância Patrimonial</p>
              </div>
            </div>`;

          const attachments: Array<{ filename: string; content: Buffer; cid: string; contentType: string }> = [];
          if (isBase64) {
            const matches = photoData.match(/^data:image\/([\w+]+);base64,(.+)$/);
            if (matches) {
              const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
              attachments.push({
                filename: `inspecao_${step}.${ext}`,
                content: Buffer.from(matches[2], "base64"),
                cid: "inspection-photo",
                contentType: `image/${matches[1]}`,
              });
            }
          }

          const transporter = createSmtpTransporter();
          if (transporter) {
            await transporter.sendMail({
              from: getSmtpFrom(),
              to: "thiago@grupotmseg.com.br, escolta@torresseguranca.com.br",
              subject: `📋 Relatório Inspeção ${osNumber} - ${step} - ${plate}`,
              html,
              ...(attachments.length > 0 ? { attachments } : {}),
            });
            console.log(`[ai-inspection] Alert email sent for photo #${photoId}`);
          }
        } catch (emailErr: any) {
          console.error(`[ai-inspection] Email failed: ${emailErr.message}`);
        }
      }
      return aiResult;
    } catch (err: any) {
      console.error(`[ai-inspection] Error analyzing photo #${photoId}: ${err.message}`);
      await supabaseAdmin.from("mission_photos").update({ ai_inspection_status: "erro", ai_inspection_result: { error: err.message } }).eq("id", photoId);
      return null;
    }
  }

  export function registerMissionRoutes(app: Express) {
    app.get("/api/truckscontrol/test", requireAuth, requireAdminRole, async (_req, res) => {
    const result = await truckscontrol.testConnection();
    res.json(result);
  });

  app.get("/api/truckscontrol/debug", requireAuth, requireAdminRole, async (_req, res) => {
    const result = await truckscontrol.debugLogin();
    res.json(result);
  });

  app.get("/api/truckscontrol/positions", requireAuth, requireAdminRole, async (_req, res) => {
    const positions = await truckscontrol.getCachedPositions();
    res.json(positions);
  });

  app.get("/api/truckscontrol/spy", requireAuth, requireAdminRole, async (_req, res) => {
    const spyPositions = await truckscontrol.fetchSpyPositions();
    const spyDevices = truckscontrol.getSpyDevices();
    res.json({ devices: spyDevices, positions: spyPositions });
  });

  app.post("/api/truckscontrol/command", requireAuth, requireAdminRole, async (req, res) => {
    const vehicleId = Number(req.body.vehicleId);
    const command = String(req.body.command || "");
    const mensagem = req.body.mensagem ? String(req.body.mensagem) : undefined;
    const validCommands = ["bloquear", "desbloquear", "sirene", "aviso_cabine_on", "aviso_cabine_off", "mensagem_texto"] as const;

    if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
      return res.status(400).json({ success: false, message: "vehicleId deve ser um número inteiro positivo." });
    }
    if (!validCommands.includes(command as any)) {
      return res.status(400).json({ success: false, message: `Comando inválido. Use: ${validCommands.join(", ")}` });
    }

    const vehicle = await storage.getVehicle(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: "Veículo não encontrado." });
    }

    if (command === "bloquear") {
      const orders = await storage.getServiceOrders();
      const activeOs = orders.find(
        (o) => o.vehicleId === vehicleId && o.status === "em_andamento" && o.missionStatus && o.missionStatus !== "encerrada"
      );
      if (!activeOs) {
        return res.status(403).json({ success: false, message: "Bloqueio permitido apenas quando a viatura estiver EM SERVIÇO (com missão em andamento)." });
      }
    }

    let veiID: number | null = null;

    if (vehicle.truckscontrolIdentifier) {
      const parsed = parseInt(vehicle.truckscontrolIdentifier);
      if (!isNaN(parsed) && parsed > 0) veiID = parsed;
    }

    if (!veiID) {
      let tcCache = truckscontrol.getVehicleCache();
      if (tcCache.length === 0) {
        const positions = await truckscontrol.getCachedPositions();
        if (positions.length > 0) {
          tcCache = truckscontrol.getVehicleCache();
        }
      }
      const cleanPlate = vehicle.plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const found = tcCache.find(tc => tc.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === cleanPlate);
      if (found) {
        veiID = found.veiID;
      }
    }

    if (!veiID) {
      return res.status(400).json({ success: false, message: "Veículo sem identificador TrucksControl configurado. Configure o campo 'truckscontrolIdentifier' no cadastro do veículo." });
    }

    console.log(`[command] Enviando ${command} para veículo ${vehicle.plate} (veiID=${veiID}) por ${req.user?.name || req.user?.email}${mensagem ? ` msg="${mensagem}"` : ""}`);
    const result = await truckscontrol.sendCommand(veiID, command as any, mensagem);
    if (!result.success) {
      return res.status(502).json(result);
    }
    res.json(result);
  });

  // ====================== GERENCIADORA ROUTES ======================

  app.get("/api/gerenciadoras", requireAuth, requireAdminRole, async (_req, res) => {
    const list = await storage.getGerenciadoras();
    res.json(list);
  });

  app.post("/api/gerenciadoras", requireAuth, requireAdminRole, async (req, res) => {
    const parsed = insertGerenciadoraSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.flatten() });
    const g = await storage.createGerenciadora(parsed.data);
    res.json(g);
  });

  app.patch("/api/gerenciadoras/:id", requireAuth, requireAdminRole, async (req, res) => {
    const id = Number(req.params.id);
    const parsed = insertGerenciadoraSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.flatten() });
    const updated = await storage.updateGerenciadora(id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Gerenciadora não encontrada" });
    res.json(updated);
  });

  app.delete("/api/gerenciadoras/:id", requireAuth, requireDiretoria, async (req, res) => {
    await storage.deleteGerenciadora(Number(req.params.id));
    res.json({ success: true });
  });

  app.post("/api/gerenciadoras/:id/mirror", requireAuth, requireAdminRole, async (req, res) => {
    const gerenciadora = await storage.getGerenciadora(Number(req.params.id));
    if (!gerenciadora) return res.status(404).json({ message: "Gerenciadora não encontrada" });
    if (!gerenciadora.apiUrl) return res.status(400).json({ message: "Gerenciadora sem URL de API configurada" });

    try {
      const parsedUrl = new URL(gerenciadora.apiUrl);
      if (parsedUrl.protocol !== "https:") {
        return res.status(400).json({ message: "URL deve usar HTTPS" });
      }
      const hostname = parsedUrl.hostname.toLowerCase();
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.startsWith("169.254.") || hostname.endsWith(".local")) {
        return res.status(400).json({ message: "URL de rede interna não permitida" });
      }
    } catch {
      return res.status(400).json({ message: "URL inválida" });
    }

    const { vehicleData } = req.body;
    try {
      const response = await fetch(gerenciadora.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(gerenciadora.apiKey ? { Authorization: `Bearer ${gerenciadora.apiKey}` } : {}),
        },
        body: JSON.stringify({
          source: "torres_vigilancia",
          timestamp: new Date().toISOString(),
          data: vehicleData,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        await storage.createApiLog({
          endpoint: gerenciadora.apiUrl,
          method: "POST",
          requestData: JSON.stringify({ vehicleCount: vehicleData?.length || 0 }),
          responseStatus: response.status,
          responseData: await response.text().catch(() => "error"),
          userId: req.user?.id || null,
          source: "mirror_gerenciadora",
        });
      }

      if (response.ok) {
        res.json({ success: true, message: `Espelhamento enviado para ${gerenciadora.name}` });
      } else {
        res.status(502).json({ success: false, message: `Erro ao enviar: HTTP ${response.status}` });
      }
    } catch (err: any) {
      await storage.createApiLog({
        endpoint: gerenciadora.apiUrl!,
        method: "POST",
        requestData: JSON.stringify({ vehicleCount: vehicleData?.length || 0 }),
        responseStatus: 0,
        responseData: err.message,
        userId: req.user?.id || null,
        source: "mirror_gerenciadora",
      });
      res.status(502).json({ success: false, message: `Falha na conexão: ${err.message}` });
    }
  });

  app.get("/api/telemetry/events", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { eventType, plate, from, to, limit } = req.query;
      const filters: { eventType?: string; plate?: string; from?: Date; to?: Date; limit?: number } = {};
      if (eventType) filters.eventType = String(eventType);
      if (plate) filters.plate = String(plate);
      if (from) filters.from = new Date(String(from));
      if (to) filters.to = new Date(String(to));
      filters.limit = limit ? parseInt(String(limit)) : 500;
      const events = await storage.getTelemetryEvents(filters);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/telemetry/summary", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { from, to } = req.query;
      const filters: { from?: Date; to?: Date } = {};
      if (from) filters.from = new Date(String(from));
      if (to) filters.to = new Date(String(to));

      const [speedEvents, idleEvents] = await Promise.all([
        storage.getTelemetryEvents({ ...filters, eventType: "excesso_velocidade", limit: 1000 }),
        storage.getTelemetryEvents({ ...filters, eventType: "idle_excessivo", limit: 1000 }),
      ]);

      const plateStats = new Map<string, { speedCount: number; maxSpeed: number; idleCount: number; totalIdleMin: number }>();

      for (const e of speedEvents) {
        const s = plateStats.get(e.plate) || { speedCount: 0, maxSpeed: 0, idleCount: 0, totalIdleMin: 0 };
        s.speedCount++;
        s.maxSpeed = Math.max(s.maxSpeed, e.value || 0);
        plateStats.set(e.plate, s);
      }

      for (const e of idleEvents) {
        const s = plateStats.get(e.plate) || { speedCount: 0, maxSpeed: 0, idleCount: 0, totalIdleMin: 0 };
        s.idleCount++;
        s.totalIdleMin += e.duration || 0;
        plateStats.set(e.plate, s);
      }

      const ranking = Array.from(plateStats.entries())
        .map(([plate, stats]) => ({ plate, ...stats }))
        .sort((a, b) => (b.speedCount + b.idleCount) - (a.speedCount + a.idleCount));

      const idleFuelCostEstimate = idleEvents.reduce((acc, e) => acc + (e.duration || 0), 0) * 0.015 * 6.5;

      res.json({
        totalSpeedEvents: speedEvents.length,
        totalIdleEvents: idleEvents.length,
        totalIdleMinutes: idleEvents.reduce((acc, e) => acc + (e.duration || 0), 0),
        idleFuelCostEstimate: Math.round(idleFuelCostEstimate * 100) / 100,
        ranking,
        recentSpeed: speedEvents.slice(0, 20),
        recentIdle: idleEvents.slice(0, 20),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/truckscontrol/espelhados", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const result = await truckscontrol.listEspelhados();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/truckscontrol/espelhamentos-pendentes", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const result = await truckscontrol.listEspelhamentosPendentes();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/truckscontrol/espelhar", requireAuth, requireAdminRole, async (req, res) => {
    const { veiID, cnpj, cmd, IE, TIE, validade, possoCancelar, comandoExclusivo, compartilharDados } = req.body;
    if (!veiID || !cnpj) return res.status(400).json({ success: false, message: "veiID e cnpj são obrigatórios" });
    try {
      const result = await truckscontrol.createEspelhamento(veiID, cnpj, { cmd, IE, TIE, validade, possoCancelar, comandoExclusivo, compartilharDados });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/truckscontrol/espelhar/diagnostico", requireAuth, requireAdminRole, async (req, res) => {
    const { veiID, cnpj } = req.body;
    if (!veiID || !cnpj) return res.status(400).json({ success: false, message: "veiID e cnpj são obrigatórios" });
    try {
      const result = await truckscontrol.diagnosticoEspelhamento(veiID, cnpj);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/truckscontrol/espelhamento/aceitar", requireAuth, requireAdminRole, async (req, res) => {
    const { veiID, desc } = req.body;
    if (!veiID) return res.status(400).json({ success: false, message: "veiID é obrigatório" });
    try {
      const result = await truckscontrol.acceptEspelhamento(veiID, desc);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/truckscontrol/espelhamento/rejeitar", requireAuth, requireAdminRole, async (req, res) => {
    const { veiID } = req.body;
    if (!veiID) return res.status(400).json({ success: false, message: "veiID é obrigatório" });
    try {
      const result = await truckscontrol.rejectEspelhamento(veiID);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/truckscontrol/espelhamento/cancelar", requireAuth, requireAdminRole, async (req, res) => {
    const { veiID, cnpj } = req.body;
    if (!veiID || !cnpj) return res.status(400).json({ success: false, message: "veiID e cnpj são obrigatórios" });
    try {
      const result = await truckscontrol.cancelEspelhamentoProprietario(veiID, cnpj);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ====================== MISSION ROUTES ======================

  app.get("/api/mission/active", requireAuth, async (req, res) => {
    const user = req.user!;

    const simulateOsId = req.query.osId ? parseInt(req.query.osId as string) : null;
    if (simulateOsId && (user.role === "admin" || user.role === "diretoria")) {
      const active = await storage.getServiceOrder(simulateOsId);
      if (!active) return res.json(null);

      const [client, vehicle, emp1, emp2] = await Promise.all([
        storage.getClient(active.clientId),
        active.vehicleId ? storage.getVehicle(active.vehicleId) : null,
        active.assignedEmployeeId ? storage.getEmployee(active.assignedEmployeeId) : null,
        active.assignedEmployee2Id ? storage.getEmployee(active.assignedEmployee2Id) : null,
      ]);
      const photos = await storage.getMissionPhotosByOS(active.id);
      const completedSteps = photos.map((p) => p.step);

      let agentLocation: { lat: string; lng: string } | null = null;
      if (active.assignedEmployeeId) {
        const { data: loc } = await supabaseAdmin
          .from("agent_locations")
          .select("latitude, longitude")
          .eq("employee_id", active.assignedEmployeeId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (loc) agentLocation = { lat: String(loc.latitude), lng: String(loc.longitude) };
      }

      return res.json({
        ...active,
        serviceOrderId: active.id,
        clientName: client?.name || "—",
        vehiclePlate: vehicle?.plate || "—",
        vehicleModel: vehicle?.model || "—",
        employee1Name: emp1?.name || "—",
        employee2Name: emp2?.name || "—",
        employeeId: active.assignedEmployeeId,
        completedSteps,
        escortedDriverName: active.escortedDriverName || null,
        escortedDriverPhone: active.escortedDriverPhone || null,
        escortedVehiclePlate: active.escortedVehiclePlate || null,
        missionStartedAt: active.missionStartedAt || null,
        origin: active.origin || null,
        destination: active.destination || null,
        route: active.route || null,
        agentLocation,
        scheduledMissions: [],
      });
    }

    if (!user.employeeId) return res.json(null);

    const orders = await storage.getServiceOrdersByEmployee(user.employeeId);
    const allActive = orders.filter(
      (o) => (o.status === "em_andamento" || o.status === "agendada") && o.missionStatus !== "encerrada"
    );

    const emAndamento = allActive.find(o => o.status === "em_andamento");
    const nowMs = Date.now();
    const agendadas = allActive
      .filter(o => o.status === "agendada")
      .sort((a, b) => {
        const da = a.scheduledDate ? Math.abs(new Date(a.scheduledDate).getTime() - nowMs) : Infinity;
        const db = b.scheduledDate ? Math.abs(new Date(b.scheduledDate).getTime() - nowMs) : Infinity;
        return da - db;
      });
    const active = emAndamento || agendadas[0];
    if (!active) return res.json(null);

    const scheduled = allActive
      .filter(o => o.id !== active.id && o.status === "agendada")
      .sort((a, b) => {
        const da = a.scheduledDate ? Math.abs(new Date(a.scheduledDate).getTime() - nowMs) : Infinity;
        const db = b.scheduledDate ? Math.abs(new Date(b.scheduledDate).getTime() - nowMs) : Infinity;
        return da - db;
      });

    const [client, vehicle, emp1, emp2] = await Promise.all([
      storage.getClient(active.clientId),
      active.vehicleId ? storage.getVehicle(active.vehicleId) : null,
      active.assignedEmployeeId ? storage.getEmployee(active.assignedEmployeeId) : null,
      active.assignedEmployee2Id ? storage.getEmployee(active.assignedEmployee2Id) : null,
    ]);

    const photos = await storage.getMissionPhotosByOS(active.id);
    const completedSteps = photos.map((p) => p.step);

    const scheduledMissions = await Promise.all(
      scheduled.map(async (o) => {
        const c = await storage.getClient(o.clientId);
        return {
          id: o.id,
          osNumber: o.osNumber,
          clientName: c?.name || "—",
          scheduledDate: o.scheduledDate,
          route: o.route || null,
          origin: o.origin || null,
          destination: o.destination || null,
          status: o.status,
          missionStatus: o.missionStatus,
          priority: o.priority,
        };
      })
    );

    res.json({
      ...active,
      serviceOrderId: active.id,
      clientName: client?.name || "—",
      vehiclePlate: vehicle?.plate || "—",
      vehicleModel: vehicle?.model || "—",
      employee1Name: emp1?.name || "—",
      employee2Name: emp2?.name || "—",
      employeeId: user.employeeId,
      completedSteps,
      escortedDriverName: active.escortedDriverName || null,
      escortedDriverPhone: active.escortedDriverPhone || null,
      escortedVehiclePlate: active.escortedVehiclePlate || null,
      missionStartedAt: active.missionStartedAt || null,
      origin: active.origin || null,
      destination: active.destination || null,
      route: active.route || null,
      scheduledMissions,
    });
  });

  app.get("/api/mission/scheduled", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.json([]);

    const orders = await storage.getServiceOrdersByEmployee(user.employeeId);
    const scheduled = orders
      .filter((o) => (o.status === "agendada" || o.status === "aberta") && o.missionStatus !== "encerrada")
      .sort((a, b) => {
        const da = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Infinity;
        const db = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Infinity;
        return da - db;
      });

    const result = await Promise.all(
      scheduled.map(async (o) => {
        const c = await storage.getClient(o.clientId);
        return {
          id: o.id,
          osNumber: o.osNumber,
          clientName: c?.name || "—",
          scheduledDate: o.scheduledDate,
          route: o.route || null,
          origin: o.origin || null,
          destination: o.destination || null,
          status: o.status,
          missionStatus: o.missionStatus,
          priority: o.priority,
        };
      })
    );

    res.json(result);
  });

  app.post("/api/mission/update", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId, message, missionStep, latitude, longitude, photoUrl } = req.body;
    if (!serviceOrderId || !message?.trim()) {
      return res.status(400).json({ message: "OS e mensagem são obrigatórios" });
    }

    let validatedPhotoUrl: string | null = null;
    if (photoUrl && typeof photoUrl === "string" && photoUrl.startsWith("data:image/") && photoUrl.length <= 10 * 1024 * 1024) {
      // Foto sobe pro storage (bucket privado); no banco fica só o caminho.
      try {
        validatedPhotoUrl = await uploadMissionPhoto(serviceOrderId, photoUrl);
      } catch (e: any) {
        // Fail-safe: se o upload pro storage falhar (storage instável, bucket
        // ainda não criado no boot, etc.) NÃO perdemos a foto — grava o base64
        // inline como antes. Os readers tratam base64 legado e o sweep da
        // migração move pro storage depois (idempotente).
        console.error("[mission-update] upload foto falhou, fallback base64:", e?.message);
        validatedPhotoUrl = photoUrl;
      }
    }

    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    // Autorização: o agente só pode atualizar uma OS onde ele está vinculado
    // (ou é admin/operação). Sem essa checagem, qualquer funcionário poderia
    // enviar mensagens pro WhatsApp de QUALQUER cliente via API.
    const isAdminLike = ["admin", "supervisor", "operacao", "operação", "diretoria"].includes(
      String(user.role || "").toLowerCase()
    );
    const isAssigned = so.assignedEmployeeId === user.employeeId
      || so.assignedEmployee2Id === user.employeeId;
    if (!isAdminLike && !isAssigned) {
      return res.status(403).json({ message: "Funcionário não está vinculado a esta OS" });
    }

    const emp = await storage.getEmployee(user.employeeId);

    try {
      // Corrige o texto cru do agente via IA (ortografia/acentuação/nexo)
      // ANTES de gravar — assim a UI do admin e o WhatsApp do cliente recebem
      // a mesma versão polida. Fail-open: se a IA falhar, grava o texto cru.
      const { correctAgentMessage } = await import("../lib/correct-text-ai.js");
      const correctedMessage = await correctAgentMessage(message.trim());

      const { error: insertError } = await supabaseAdmin.from("mission_updates").insert({
        service_order_id: serviceOrderId,
        os_number: so.osNumber || null,
        employee_id: user.employeeId,
        employee_name: emp?.name || user.name || "—",
        message: correctedMessage,
        mission_step: missionStep || so.missionStatus || null,
        latitude: latitude || null,
        longitude: longitude || null,
        photo_url: validatedPhotoUrl,
        read_by_admin: 0,
      });
      if (insertError) {
        console.error("[mission-update] Erro Supabase ao inserir:", insertError.message);
        return res.status(500).json({ message: "Erro ao salvar atualização" });
      }
      console.log(`[mission-update] Atualização salva: agente=${emp?.name || user.name} OS=${so.osNumber} msg="${correctedMessage.substring(0, 50)}"`);

      // Reset do Agente Central ANTES de responder: chegou update novo, zera o
      // contador de cobranças por gap de tempo. Feito antes do res.json pra
      // evitar race com o cron (a cada 5min) que poderia cobrar de novo se o
      // DELETE falhasse silenciosamente em fire-and-forget. Próxima cobrança
      // só dispara se passar 1h20min (rodando) ou 2h10min (pernoite) sem
      // nova mission_update. Try/catch isolado pra não derrubar a resposta.
      try {
        const resetRes = await supabaseAdmin
          .from("agent_central_reminders")
          .delete()
          .eq("service_order_id", serviceOrderId);
        if (resetRes.error) {
          console.warn("[agent-central] reset falhou:", resetRes.error.message);
        }
      } catch (e: any) {
        console.warn("[agent-central] reset exception:", e.message);
      }

      res.json({ success: true });

      // Agente Central: se algum pedido de atualização foi feito DENTRO de um
      // grupo (ex: "OP. TMSEG X TORRES (EASP)"), encaminha esta atualização de
      // volta ao grupo mencionando quem pediu. Fire-and-forget, fail-open.
      import("../lib/agent-central-mention.js")
        .then(({ fulfillGroupRequests }) =>
          fulfillGroupRequests({
            serviceOrderId,
            osNumber: so.osNumber || null,
            employeeName: emp?.name || user.name || null,
            message: correctedMessage,
          }),
        )
        .catch((e: any) => console.warn("[agent-central] fulfill falhou:", e?.message));

      // O encaminhamento pro grupo WhatsApp do cliente é feito pelo cron
      // `initWhatsappForwardCron` (server/cron-whatsapp-forward.ts) — varre
      // updates com foto+mensagem ainda não encaminhadas a cada 30s. Assim
      // funciona pra TODAS as rotas que inserem em mission_updates (não só
      // esta) e auto-recupera de qualquer falha de rede/Z-API.
    } catch (err: any) {
      console.error("[mission-update] Erro ao salvar:", err.message);
      res.status(500).json({ message: "Erro ao salvar atualização" });
    }
  });

  app.get("/api/service-orders/:id/updates", requireAuth, async (req, res) => {
    const osId = parseInt(req.params.id);
    if (isNaN(osId)) return res.status(400).json({ message: "ID inválido" });
    try {
      const { data: results, error } = await supabaseAdmin.from("mission_updates").select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      const camel = toCamelArray(results || []) as any[];
      const resolved = await Promise.all(
        camel.map(async (m) => ({ ...m, photoUrl: await resolvePhotoForView(m.photoUrl) })),
      );
      res.json(resolved);
    } catch (err: any) {
      console.error(`[mission-updates] GET /updates/${osId} error:`, err.message);
      res.json([]);
    }
  });

  app.get("/api/mission/updates", requireAuth, requireAdminRole, async (req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    const unreadOnly = req.query.unread === "true";
    const limit = parseInt(req.query.limit as string) || 50;

    const stripBase64 = (m: any) => {
      // Mascara QUALQUER foto (base64 legado OU caminho de storage) como
      // "[has_photo]"; o frontend busca a foto real em /updates/:id/photo.
      if (m.photoUrl && typeof m.photoUrl === "string") {
        return { ...m, photoUrl: "[has_photo]", hasPhoto: true };
      }
      return { ...m, hasPhoto: !!m.photoUrl };
    };

    let missionResults: any[];
    if (unreadOnly) {
      try {
        const { data, error } = await supabaseAdmin.from("mission_updates").select("*").eq("read_by_admin", 0).order("created_at", { ascending: false }).limit(limit);
        if (error) throw error;
        missionResults = toCamelArray(data || []);
      } catch (_e) { missionResults = []; }
    } else {
      const [missionRes, telRes] = await Promise.all([
        supabaseAdmin.from("mission_updates").select("*").order("created_at", { ascending: false }).limit(limit).then(r => r).catch(() => ({ data: [] as any[] })),
        supabaseAdmin.from("telemetry_events").select("*").order("created_at", { ascending: false }).limit(limit),
      ]);
      missionResults = toCamelArray(missionRes.data || []);
      const telEvents = toCamelArray(telRes.data || []);
      const telAsMission = telEvents.map(t => ({
        id: `tel-${t.id}`,
        serviceOrderId: null,
        osNumber: null,
        employeeId: null,
        employeeName: t.driverName || t.plate,
        message: t.details || `${t.eventType}: ${t.value}`,
        missionStep: null,
        latitude: t.latitude ? String(t.latitude) : null,
        longitude: t.longitude ? String(t.longitude) : null,
        photoUrl: null,
        hasPhoto: false,
        readByAdmin: 1,
        createdAt: t.createdAt,
        _type: "telemetry",
        _eventType: t.eventType,
        _plate: t.plate,
        _value: t.value,
        _address: t.address,
      }));
      const merged = [...missionResults.map(m => stripBase64({ ...m, _type: "mission" })), ...telAsMission]
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
        .slice(0, limit);
      return res.json(merged);
    }

    res.json(missionResults.map(stripBase64));
  });

  app.get("/api/mission/updates/:id/photo", requireAuth, requireAdminRole, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido" });
    try {
      const { data: rows, error } = await supabaseAdmin.from("mission_updates").select("photo_url").eq("id", id).limit(1);
      if (error) throw error;
      if (!rows || rows.length === 0) return res.status(404).json({ message: "Atualização não encontrada" });
      res.json({ photoUrl: await resolvePhotoForView(rows[0].photo_url) });
    } catch (err: any) {
      console.error(`[mission-updates] photo/${id} error:`, err.message);
      res.status(500).json({ message: "Erro ao buscar foto" });
    }
  });

  app.patch("/api/mission/updates/mark-read", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { ids } = req.body;
      if (ids && Array.isArray(ids)) {
        for (const id of ids) {
          await supabaseAdmin.from("mission_updates").update({ read_by_admin: 1 }).eq("id", id);
        }
      } else {
        await supabaseAdmin.from("mission_updates").update({ read_by_admin: 1 }).eq("read_by_admin", 0);
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("[mission-updates] mark-read error:", err.message);
      res.json({ success: true });
    }
  });

  app.post("/api/mission/updates/:id/copy-audit", requireAuth, requireAdminRole, async (req: any, res) => {
    try {
      const updateId = Number(req.params.id);
      const userName = req.user?.name || req.user?.email || "Admin";

      await supabaseAdmin.from("mission_updates").update({ copiado_por: userName, copiado_em: nowBRTString() }).eq("id", updateId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("copy-audit error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mission/updates/:id/forward", requireAuth, requireAdminRole, async (req: any, res) => {
    try {
      const updateId = Number(req.params.id);
      const { recipientEmail, customMessage } = req.body;
      if (!recipientEmail) return res.status(400).json({ message: "Email do destinatário é obrigatório" });

      const { data: updateRows } = await supabaseAdmin.from("mission_updates").select("*").eq("id", updateId).limit(1);
      if (!updateRows || updateRows.length === 0) return res.status(404).json({ message: "Atualização não encontrada" });
      const update = toCamelObj<any>(updateRows[0]);

      const os = await storage.getServiceOrder(update.serviceOrderId);
      if (!os) return res.status(404).json({ message: "OS não encontrada" });

      const client = await storage.getClient(os.clientId);

      const transporter = createSmtpTransporter();
      if (!transporter) return res.status(500).json({ message: "SMTP não configurado" });

      const missionLabelMap: Record<string, string> = {
        aguardando: "Saída da Base", checkout_armamento: "Saída da Base", checkout_viatura: "Saída da Base", checkout_km_saida: "Saída da Base",
        em_transito_origem: "Na Origem", checkin_chegada_km: "Na Origem", checkin_veiculo_escoltado: "Na Origem", checkin_dados_motorista: "Na Origem",
        iniciar_missao: "Em Missão", em_transito_destino: "Em Trânsito Destino",
        checkout_km_final: "Término de Missão", checkout_viatura_retorno: "Término de Missão",
        finalizada: "Missão Finalizada", retorno_base: "Retorno à Base", chegada_base: "Chegada na Base", encerrada: "Missão Encerrada",
      };
      const stepLabel = update.missionStep ? (missionLabelMap[update.missionStep] || update.missionStep) : "Atualização";
      const timeStr = update.createdAt ? new Date(update.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
      const locationLink = update.latitude && update.longitude ? `https://www.google.com/maps?q=${update.latitude},${update.longitude}&z=17&hl=pt-BR` : null;

      let photoHtml = "";
      // E-mail precisa ser auto-contido (signed URL expira), então embute base64.
      const emailPhoto = await downloadMissionPhotoDataUri(update.photoUrl);
      if (emailPhoto) {
        photoHtml = `<div style="margin:15px 0;text-align:center;"><img src="${emailPhoto}" style="max-width:100%;max-height:400px;border-radius:8px;border:1px solid #e0e0e0;" alt="Foto da operação" /></div>`;
      }

      const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;line-height:1.6;max-width:600px;margin:0 auto;">
  <div style="background:#1a1a1a;padding:20px 30px;text-align:center;">
    <h1 style="color:#fff;font-size:18px;margin:0;">TORRES VIGILÂNCIA PATRIMONIAL LTDA</h1>
    <p style="color:#999;font-size:12px;margin:4px 0 0;">CNPJ: 36.982.392/0001-89</p>
  </div>
  <div style="padding:30px;border:1px solid #e0e0e0;border-top:none;">
    <h2 style="color:#1a1a1a;font-size:16px;margin:0 0 20px;">ATUALIZAÇÃO DE ESCOLTA — ${os.osNumber}</h2>
    <p>Prezado(a) ${client?.contactPerson || client?.name || "Cliente"},</p>
    <p>Segue atualização da operação de escolta armada:</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;width:40%;">OS</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${os.osNumber}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Status</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${stepLabel}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Horário</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${timeStr}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Agente</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${update.employeeName || "—"}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Mensagem</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${update.message}</td></tr>
      ${locationLink ? `<tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Localização</td><td style="padding:8px 12px;border:1px solid #e0e0e0;"><a href="${locationLink}" style="color:#2563eb;">Ver no mapa</a></td></tr>` : ""}
      ${customMessage ? `<tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f8f8;font-weight:bold;">Observação</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${customMessage}</td></tr>` : ""}
    </table>
    ${photoHtml}
    <p style="margin-top:25px;">Atenciosamente,</p>
    <p style="margin:5px 0;"><strong>Torres Vigilância Patrimonial LTDA</strong></p>
    <p style="color:#666;font-size:13px;margin:2px 0;">Tel: (11) 96369-6699</p>
    <p style="color:#666;font-size:13px;margin:2px 0;">escolta@torresseguranca.com.br</p>
  </div>
  <div style="background:#f5f5f5;padding:15px 30px;text-align:center;border:1px solid #e0e0e0;border-top:none;">
    <p style="color:#999;font-size:11px;margin:0;">Este e-mail foi enviado automaticamente pelo sistema Torres Gestão.</p>
  </div>
</body></html>`;

      await transporter.sendMail({
        from: getSmtpFrom(),
        to: recipientEmail,
        bcc: SMTP_BCC_OS,
        subject: `Atualização de Escolta — ${os.osNumber} — ${stepLabel}`,
        html: htmlBody,
      });

      const forward = await storage.createClientForward({
        serviceOrderId: os.id,
        missionUpdateId: updateId,
        clientId: os.clientId,
        recipientEmail,
        subject: `Atualização de Escolta — ${os.osNumber} — ${stepLabel}`,
        message: customMessage || update.message,
        photoIncluded: !!update.photoUrl,
        sentBy: req.user?.name || req.user?.email || "admin",
      });

      console.log(`[forward] Email enviado para ${recipientEmail} (OS ${os.osNumber}, update #${updateId})`);
      res.json(forward);
    } catch (err: any) {
      console.error(`[forward] Erro: ${err.message}`);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/service-orders/:id/forwards", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID inválido" });
      const forwards = await storage.getClientForwardsByOS(id);
      res.json(forwards);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Texto do formulário COMPLETO de "Fim de Missão" (mesmo do auto-forward via CRON).
  // Usado pelo botão Compartilhar/Copiar da grade operacional p/ que o envio manual
  // do fechamento saia idêntico ao card automático (e não o resumo curto). Read-only.
  app.get("/api/service-orders/:id/finalized-summary", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID inválido" });
      const { data: so } = await supabaseAdmin.from("service_orders").select("*").eq("id", id).maybeSingle();
      if (!so) return res.status(404).json({ message: "OS não encontrada" });
      let client: any = null;
      if ((so as any).client_id) {
        const { data: c } = await supabaseAdmin.from("clients").select("name, whatsapp_group_id").eq("id", (so as any).client_id).maybeSingle();
        client = c;
      }
      // Update sintético representando o fechamento (buildFinalizedSummary resolve GPS/KM/horários do banco).
      const u = {
        service_order_id: (so as any).id,
        os_number: (so as any).os_number,
        created_at: (so as any).completed_date || new Date().toISOString(),
        latitude: null,
        longitude: null,
      };
      const text = await buildFinalizedSummary(u, so, client);
      res.json({ text });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/mission/status/:serviceOrderId", requireAuth, async (req, res) => {
    const user = req.user!;
    const soId = Number(req.params.serviceOrderId);
    const so = await storage.getServiceOrder(soId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    if (user.role !== "admin" && user.employeeId) {
      const isAssigned = so.assignedEmployeeId === user.employeeId || so.assignedEmployee2Id === user.employeeId;
      if (!isAssigned) return res.status(403).json({ message: "Acesso negado" });
    }

    const photos = await storage.getMissionPhotosByOS(soId);
    const completedSteps = photos.map((p) => p.step);

    res.json({
      missionStatus: so.missionStatus,
      completedSteps,
      photoCount: photos.length,
      stepLogs: so.stepLogs || [],
    });
  });

  app.get("/api/mission/photos/:serviceOrderId", requireAuth, async (req, res) => {
    const user = req.user!;
    const soId = Number(req.params.serviceOrderId);
    const so = await storage.getServiceOrder(soId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    const isAdminRole = user.role === "admin" || user.role === "diretoria";
    if (!isAdminRole) {
      if (!user.employeeId) return res.status(403).json({ message: "Acesso negado" });
      const isAssigned = so.assignedEmployeeId === user.employeeId || so.assignedEmployee2Id === user.employeeId;
      if (!isAssigned) return res.status(403).json({ message: "Acesso negado" });
    }

    const photos = await storage.getMissionPhotosByOS(soId);
    const stripped = photos.map(({ photoData, ...rest }) => rest);
    res.json(stripped);
  });

  app.get("/api/mission/photo/:id", requireAuth, async (req, res) => {
    const user = req.user!;
    const photo = await storage.getMissionPhoto(Number(req.params.id));
    if (!photo) return res.status(404).json({ message: "Foto não encontrada" });

    const isAdminRole = user.role === "admin" || user.role === "diretoria";
    if (!isAdminRole) {
      if (!user.employeeId) return res.status(403).json({ message: "Acesso negado" });
      const so = await storage.getServiceOrder(photo.serviceOrderId);
      if (so) {
        const isAssigned = so.assignedEmployeeId === user.employeeId || so.assignedEmployee2Id === user.employeeId;
        if (!isAssigned) return res.status(403).json({ message: "Acesso negado" });
      }
    }

    res.json(photo);
  });

  const ALL_VALID_PHOTO_STEPS = new Set(
    Object.values(STEP_REQUIRED_PHOTOS).flat()
  );

  app.post("/api/mission/photo", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId, step, photoData, kmValue, latitude, longitude } = req.body;
    if (!serviceOrderId || !step || !photoData) {
      console.log(`[mission-photo] Rejected: missing fields. serviceOrderId=${serviceOrderId}, step=${step}, hasPhotoData=${!!photoData}`);
      return res.status(400).json({ message: "Campos obrigatórios: serviceOrderId, step, photoData" });
    }

    if (!ALL_VALID_PHOTO_STEPS.has(step)) {
      console.log(`[mission-photo] Rejected: invalid step '${step}'. Valid steps: ${[...ALL_VALID_PHOTO_STEPS].join(", ")}`);
      return res.status(400).json({ message: "Etapa de foto inválida" });
    }

    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    if (so.status !== "em_andamento" && so.status !== "agendada") {
      console.log(`[mission-photo] Rejected: OS #${so.osNumber} status='${so.status}' (esperado em_andamento ou agendada)`);
      return res.status(400).json({ message: "OS não está em andamento" });
    }

    if (so.status === "agendada") {
      await storage.updateServiceOrder(so.id, { status: "em_andamento" });
    }

    const currentStepPhotos = STEP_REQUIRED_PHOTOS[so.missionStatus as string];
    if (!currentStepPhotos || !currentStepPhotos.includes(step)) {
      console.log(`[mission-photo] Rejected: foto step '${step}' não pertence a missionStatus='${so.missionStatus}'. Expected: ${currentStepPhotos?.join(", ") || "none"}`);
      return res.status(400).json({ message: `Foto não pertence à etapa atual da missão (etapa: ${so.missionStatus}, foto: ${step})` });
    }

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    const kmSteps = ["km_saida", "km_chegada", "km_final", "base_hodometro"];
    if (kmSteps.includes(step) && (!kmValue || Number(kmValue) <= 0)) {
      return res.status(400).json({ message: "Valor de KM obrigatório para esta etapa" });
    }

    let photo;
    try {
      photo = await storage.createMissionPhoto({
        serviceOrderId,
        employeeId: user.employeeId,
        step,
        photoData,
        kmValue: kmValue ? Number(kmValue) : null,
        latitude: latitude || null,
        longitude: longitude || null,
        notes: null,
      });
      console.log(`[mission-photo] OK: step='${step}' OS #${so.osNumber} by employee #${user.employeeId}, photo id=${photo.id}`);
    } catch (dbErr: any) {
      console.error(`[mission-photo] DB insert error: ${dbErr.message}`);
      return res.status(500).json({ message: "Erro ao salvar foto no banco de dados" });
    }

    if (kmValue && Number(kmValue) > 0 && so.vehicleId && ["km_saida", "km_chegada", "km_final", "base_hodometro"].includes(step)) {
      try {
        const veh = await storage.getVehicle(so.vehicleId);
        if (veh && Number(kmValue) >= (veh.km || 0)) {
          await storage.updateVehicle(so.vehicleId, { km: Number(kmValue), lastKmUpdate: new Date() });
        }
      } catch {}
    }

    const PHOTO_STEP_LABELS: Record<string, string> = {
      km_saida: "KM Saída", km_chegada: "KM Chegada", km_final: "KM Final",
      base_hodometro: "Hodômetro Base", viatura_frente: "Viatura Frente",
      viatura_lateral: "Viatura Lateral", viatura_traseira: "Viatura Traseira",
      viatura_painel: "Viatura Painel", carga_frente: "Carga Frente",
      carga_lateral: "Carga Lateral", carga_traseira: "Carga Traseira",
      carga_lacre: "Carga Lacre", motorista_cnh: "CNH Motorista",
      motorista_foto: "Foto Motorista", doc_crlv: "CRLV", doc_nota: "Nota Fiscal",
      destino_entrega: "Entrega Destino", destino_carga: "Carga Destino",
      base_viatura_retorno: "Viatura Retorno",
      foto_local_destino: "Local de Destino",
      foto_local_origem: "Local de Origem",
    };
    const emp = await storage.getEmployee(user.employeeId);
    const stepLabel = PHOTO_STEP_LABELS[step] || step;
    const alertMsg = kmValue
      ? `📷 Foto: ${stepLabel} — KM ${Number(kmValue).toLocaleString("pt-BR")}`
      : `📷 Foto: ${stepLabel}`;
    let alertPhotoPath: string | null = null;
    try {
      alertPhotoPath = await uploadMissionPhoto(serviceOrderId, photoData);
    } catch (e: any) {
      // Fail-safe: nunca perder a foto. Se o upload falhar, grava o base64
      // inline (legado, tratado pelos readers) e o sweep migra depois.
      console.error(`[mission-photo] upload foto (alerta) falhou, fallback base64: ${e?.message}`);
      alertPhotoPath = photoData;
    }
    try {
      await supabaseAdmin.from("mission_updates").insert({
        service_order_id: serviceOrderId,
        os_number: so.osNumber || null,
        employee_id: user.employeeId,
        employee_name: emp?.name || user.name || "—",
        message: alertMsg,
        mission_step: so.missionStatus || null,
        latitude: latitude || null,
        longitude: longitude || null,
        photo_url: alertPhotoPath,
        read_by_admin: 0,
      });
      console.log(`[mission-photo] Alert created for OS #${so.osNumber} step=${step}`);
    } catch (alertErr: any) {
      console.error(`[mission-photo] Alert insert error (non-fatal): ${alertErr.message}`);
    }

    const shouldInspect = !!INSPECTION_STEPS[step];
    let aiInspection: { status: string; result: any } | null = null;
    if (shouldInspect) {
      const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;
      const escortedPlate = (so as any).escortedVehiclePlate || "";
      try {
        aiInspection = await runPhotoInspection(photo.id, serviceOrderId, user.employeeId!, step, photoData, vehicle?.plate || "", escortedPlate, undefined, kmValue ? Number(kmValue) : null);
      } catch (e: any) {
        console.error(`[ai-inspection] error: ${e.message}`);
      }
    }

    const { photoData: _, ...safePhoto } = photo;
    res.status(201).json({
      ...safePhoto,
      ai_inspection_status: aiInspection?.status || null,
      ai_inspection_result: aiInspection?.result || null,
    });
  });

  app.get("/api/mission/:osId/inspection-logs", requireAuth, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const { data, error } = await supabaseAdmin.from("inspection_logs")
        .select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/mission/photo-inspections-batch", requireAuth, async (req, res) => {
    try {
      const { osIds } = req.body;
      if (!Array.isArray(osIds) || osIds.length === 0) return res.json({});
      const ids = osIds.map(Number).filter(n => !isNaN(n));
      if (ids.length === 0) return res.json({});
      const { data, error } = await supabaseAdmin.from("mission_photos")
        .select("service_order_id, ai_inspection_status")
        .in("service_order_id", ids)
        .not("ai_inspection_status", "is", null);
      if (error) return res.status(500).json({ message: error.message });
      const summary: Record<number, { total: number; approved: number; rejected: number; pending: number }> = {};
      (data || []).forEach((row: any) => {
        const osId = row.service_order_id;
        if (!summary[osId]) summary[osId] = { total: 0, approved: 0, rejected: 0, pending: 0 };
        summary[osId].total++;
        if (row.ai_inspection_status === "approved") summary[osId].approved++;
        else if (row.ai_inspection_status === "rejected") summary[osId].rejected++;
        else summary[osId].pending++;
      });
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/mission/:osId/photo-inspections", requireAuth, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const { data, error } = await supabaseAdmin.from("mission_photos")
        .select("id, step, ai_inspection_status, ai_inspection_result, created_at")
        .eq("service_order_id", osId)
        .not("ai_inspection_status", "is", null)
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/mission/:osId/photos-gallery", requireAuth, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const { data: photos, error } = await supabaseAdmin.from("mission_photos")
        .select("id, service_order_id, employee_id, step, photo_data, km_value, latitude, longitude, ai_inspection_status, ai_inspection_result, created_at")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ message: error.message });

      const { data: logs } = await supabaseAdmin.from("inspection_logs")
        .select("id, mission_photo_id, step, status, detected_plate, plate_match, expected_plate, item_condition, divergences, ai_raw_response, created_at")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: true });

      const logMap = new Map((logs || []).map(l => [l.mission_photo_id, l]));

      const result = (photos || []).map(p => ({
        id: p.id,
        step: p.step,
        photoData: p.photo_data,
        kmValue: p.km_value,
        latitude: p.latitude,
        longitude: p.longitude,
        aiStatus: p.ai_inspection_status || "pendente",
        aiResult: p.ai_inspection_result || null,
        inspectionLog: logMap.get(p.id) || null,
        createdAt: p.created_at,
      }));

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/mission/:osId/re-inspect", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const { photoIds } = req.body;

      const so = await storage.getServiceOrder(osId);
      if (!so) return res.status(404).json({ message: "OS não encontrada" });

      const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;
      const escortedPlate = (so as any).escortedVehiclePlate || "";

      let query = supabaseAdmin.from("mission_photos")
        .select("id, step, photo_data, km_value, employee_id")
        .eq("service_order_id", osId);

      if (photoIds && photoIds.length > 0) {
        query = query.in("id", photoIds);
      }

      const { data: photos, error } = await query.order("created_at");
      if (error) return res.status(500).json({ message: error.message });

      const toInspect = (photos || []).filter(p => !!INSPECTION_STEPS[p.step]);
      if (toInspect.length === 0) return res.json({ message: "Nenhuma foto elegível para inspeção", count: 0 });

      let started = 0;
      for (const p of toInspect) {
        runPhotoInspection(
          p.id, osId, p.employee_id || 0, p.step, p.photo_data,
          vehicle?.plate || "", escortedPlate, undefined, p.km_value
        ).catch(e => console.error(`[ai-reinspect] error photo #${p.id}: ${e.message}`));
        started++;
      }

      console.log(`[ai-reinspect] Started ${started} inspections for OS #${so.osNumber}`);
      res.json({ message: `Inspeção iniciada para ${started} foto(s)`, count: started });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/mission/escort-data", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId, driverName, vehiclePlate, driverPhone, extraDrivers } = req.body;
    if (!serviceOrderId || !driverName || !vehiclePlate) {
      return res.status(400).json({ message: "Campos obrigatórios: serviceOrderId, driverName, vehiclePlate" });
    }

    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    const cleanExtras = Array.isArray(extraDrivers)
      ? extraDrivers
          .map((d: any) => ({
            name: String(d?.name || "").trim(),
            phone: d?.phone ? String(d.phone).trim() : null,
            plate: d?.plate ? String(d.plate).trim().toUpperCase() : null,
          }))
          .filter((d: any) => d.name.length > 0)
      : [];

    const updated = await storage.updateServiceOrder(serviceOrderId, {
      escortedDriverName: driverName,
      escortedDriverPhone: driverPhone || null,
      escortedVehiclePlate: vehiclePlate,
      extraDrivers: cleanExtras as any,
    });

    if (vehiclePlate && so.clientId) {
      try {
        const existing = await storage.getClientVehicleByPlate(so.clientId, vehiclePlate);
        if (!existing) {
          await storage.createClientVehicle({
            clientId: so.clientId,
            plate: vehiclePlate.toUpperCase(),
            driverName: driverName || null,
            driverPhone: driverPhone || null,
          });
        } else {
          const updates: any = {};
          if (driverName && driverName !== existing.driverName) updates.driverName = driverName;
          if (driverPhone && driverPhone !== existing.driverPhone) updates.driverPhone = driverPhone;
          if (Object.keys(updates).length > 0) await storage.updateClientVehicle(existing.id, updates);
        }
      } catch (_) {}
    }

    res.json(updated);
  });

  app.post("/api/mission/start", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId } = req.body;
    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    if (so.missionStatus !== "iniciar_missao") {
      return res.status(400).json({ message: "Etapa atual não permite iniciar missão" });
    }

    res.json(so);
  });

  app.post("/api/mission/rollback-step", requireAdminRole, async (req, res) => {
    try {
      const { serviceOrderId } = req.body;
      const so = await storage.getServiceOrder(serviceOrderId);
      if (!so) return res.status(404).json({ message: "OS nao encontrada" });

      if (!so.missionStatus) return res.status(400).json({ message: "OS nao possui etapa de missao" });

      const currentIdx = MISSION_STEPS.indexOf(so.missionStatus as any);
      if (currentIdx < 0) return res.status(400).json({ message: "Status de missao invalido: " + so.missionStatus });
      if (currentIdx === 0) return res.status(400).json({ message: "Ja esta na primeira etapa, nao e possivel voltar" });

      const previousStep = MISSION_STEPS[currentIdx - 1];

      const updates: any = { missionStatus: previousStep };

      if (so.missionStatus === "encerrada") {
        updates.status = "em_andamento";
        updates.completedDate = null;

        if (so.kitId) {
          try { await storage.updateWeaponKit(so.kitId, { status: "em_uso" }); } catch (_e) {}
        }

        try {
          await supabaseAdmin.from("escort_billings")
            .delete()
            .eq("service_order_id", serviceOrderId);
        } catch (_e) {}

        try {
          await removeAutoTransaction("service_order", String(serviceOrderId));
          console.log(`[OS-Financial] Removed auto-transaction for rollback OS ${so.osNumber}`);
        } catch (_e) {}
      }

      const existingLogs = Array.isArray(so.stepLogs) ? so.stepLogs : [];
      const user = req.user!;
      const rollbackEntry = {
        step: `rollback_${so.missionStatus}_to_${previousStep}`,
        completedAt: new Date().toISOString(),
        agentName: `ADMIN: ${user.name}`,
        agentId: user.id,
        geo: null,
        nextStep: previousStep,
      };
      updates.stepLogs = [...existingLogs, rollbackEntry];

      const updated = await storage.updateServiceOrder(serviceOrderId, updates);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/mission/cancel", requireAdminRole, async (req, res) => {
    try {
      const { serviceOrderId, reason } = req.body;
      const so = await storage.getServiceOrder(serviceOrderId);
      if (!so) return res.status(404).json({ message: "OS nao encontrada" });

      const updates: any = {
        status: "cancelada",
        missionStatus: so.missionStatus,
        completedDate: nowBRTString(),
      };

      if (so.kitId) {
        try { await storage.updateWeaponKit(so.kitId, { status: "disponível" }); } catch (_e) {}
      }
      if (so.vehicleId) {
        try { await storage.updateVehicle(so.vehicleId, { status: "disponível" }); } catch (_e) {}
      }

      const existingLogs = Array.isArray(so.stepLogs) ? so.stepLogs : [];
      const user = req.user!;
      const cancelEntry = {
        step: "cancelada",
        completedAt: new Date().toISOString(),
        agentName: `ADMIN: ${user.name}`,
        agentId: user.id,
        geo: null,
        nextStep: "cancelada",
        reason: reason || "Cancelada pelo administrador",
      };
      updates.stepLogs = [...existingLogs, cancelEntry];

      lastMissionPos.delete(serviceOrderId);
      try { await supabaseAdmin.from("mission_positions").delete().eq("service_order_id", serviceOrderId); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }

      try {
        await removeAutoTransaction("service_order", String(serviceOrderId));
        console.log(`[OS-Financial] Removed auto-transaction for cancelled OS ${so.osNumber}`);
      } catch (_e) {}

      const updated = await storage.updateServiceOrder(serviceOrderId, updates);

      if (so.type === "escolta") {
        try {
          // REGRA (dono): toda OS cancelada puxa a "tabela de 100 km" do cliente
          // e cobra o acionamento dessa tabela + excedente real de km/horas (se houver).
          // Dentro da franquia (≤100km/≤3h) ou sem equipe acionada ⇒ só o acionamento.
          // Billing já congelado (aprovado/faturado/pago) NÃO recalcula — só marca CANCELADO (§8.1b).
          const { data: existingBill } = await supabaseAdmin.from("escort_billings")
            .select("id, status").eq("service_order_id", serviceOrderId).limit(1);
          const FROZEN = ["APROVADA", "FATURADO", "FATURADA", "PAGO"];
          const billStatus = existingBill?.[0]?.status;
          if (billStatus && FROZEN.includes(billStatus)) {
            await supabaseAdmin.from("escort_billings")
              .update({ status: "CANCELADO" }).eq("service_order_id", serviceOrderId);
            console.log(`[OS-Cancel-Billing] OS ${so.osNumber}: billing CONGELADO (${billStatus}) — só marcou CANCELADO, valores preservados`);
            res.json(updated);
            return;
          }

          const cb = await computeCanceladaBilling({
            serviceOrderId,
            clientId: so.clientId,
            escortContractId: so.escortContractId,
            scheduledDate: so.scheduledDate as any,
            missionStartedAt: so.missionStartedAt as any,
            completedDate: updates.completedDate,
            stepLogs: existingLogs,
          });

          if (cb) {
            const client = so.clientId ? await storage.getClient(so.clientId) : null;
            const emp = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
            const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;

            const cancelPayload = {
              service_order_id: serviceOrderId,
              client_id: so.clientId,
              client_name: client?.name || "--",
              contract_id: cb.contrato.id || null,
              ...cb.fatFields,
              horario_agendado: cb.horarios.horario_agendado,
              horario_inicio: cb.horarios.horario_inicio,
              horario_fim: cb.horarios.horario_fim,
              vigilante_id: so.assignedEmployeeId,
              vigilante_name: emp?.name || "--",
              origem: so.origin || null,
              destino: so.destination || null,
              placa_viatura: vehicle?.plate || null,
              data_missao: so.scheduledDate || so.missionStartedAt || new Date().toISOString(),
              created_by: user.name,
              observacoes: `OS CANCELADA — Tabela 100 km${cb.usouTabela100 ? "" : " (fallback: contrato da OS)"} | Motivo: ${reason || "Cancelada pelo administrador"}`,
            };
            // UPSERT atômico via ON CONFLICT (service_order_id) — usa o UNIQUE uniq_eb_so_id do db-init.ts (§8.6).
            // Atômico ⇒ imune a race condition entre requisições concorrentes (clique duplo, cron, etc).
            await supabaseAdmin.from("escort_billings")
              .upsert(cancelPayload, { onConflict: "service_order_id" });

            // Espelha o total na OS p/ o card/listagem refletir a tabela 100km (mesmo comportamento do PATCH).
            const cancelTotal = Number(cb.fatFields.fat_total) || 0;
            try { await storage.updateServiceOrder(serviceOrderId, { valorEstimado: cancelTotal, fat_calculado: cancelTotal } as any); } catch (_e) {}

            // Espelho financeiro (INTOCÁVEL §8.7): toda receita de billing precisa de
            // financial_transaction correspondente, senão some do Balanço Gerencial.
            if (cancelTotal > 0) {
              await createAutoTransaction({
                description: `CANCELAMENTO OS ${so.osNumber} - ${client?.name || "--"} ${vehicle?.plate || ""}`.toUpperCase().trim(),
                amount: cancelTotal,
                type: "INCOME",
                due_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
                origin_type: "service_order",
                origin_id: String(serviceOrderId),
                category_name: "Receita de Escolta",
                entity_name: client?.name || "--",
                created_by: user.name,
              });
            }

            console.log(`[OS-Cancel-Billing] OS ${so.osNumber}: Tabela 100km (${cb.contrato.name || cb.contrato.id}) — Total R$ ${cancelTotal.toFixed(2)} (acion=${cb.fatFields.fat_acionamento}, HE=${cb.fatFields.fat_hora_extra}, KM=${cb.fatFields.fat_km})`);
          } else {
            console.log(`[OS-Cancel-Billing] OS ${so.osNumber}: cliente sem tabela de 100km nem contrato vinculado — nenhum faturamento gerado`);
          }
        } catch (billingErr: any) {
          console.error(`[OS-Cancel-Billing] Erro ao gerar billing de cancelamento para OS ${so.osNumber}:`, billingErr.message);
        }
      }

      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/mission/refuse", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { serviceOrderId, reason } = req.body;
      const motivo = String(reason || "").trim();
      if (motivo.length < 3) {
        return res.status(400).json({ message: "Informe o motivo da recusa (mínimo 3 caracteres)." });
      }
      const so = await storage.getServiceOrder(serviceOrderId);
      if (!so) return res.status(404).json({ message: "OS nao encontrada" });

      const user = req.user!;
      const adminName = user.name || user.email || "Sistema";

      const existingLogs = Array.isArray(so.stepLogs) ? so.stepLogs : [];
      const refuseEntry = {
        step: "recusada",
        completedAt: new Date().toISOString(),
        agentName: `ADMIN: ${adminName}`,
        agentId: user.id,
        geo: null,
        nextStep: "recusada",
        reason: motivo,
      };

      const updates: any = {
        status: "recusada",
        missionStatus: so.missionStatus,
        completedDate: nowBRTString(),
        cancellationReason: motivo,
        revenueValue: 0,
        fat_calculado: 0,
        custo_total_alocado: 0,
        lucro_calculado: 0,
        margem_calculada: 0,
        valorEstimado: 0,
        pedagioEstimado: 0,
        custos_congelados_em: new Date().toISOString(),
        custos_congelados_por: `recusada_por_${adminName}`,
        stepLogs: [...existingLogs, refuseEntry],
      };

      if (so.kitId) {
        try { await storage.updateWeaponKit(so.kitId, { status: "disponível" }); } catch (_e) {}
      }
      if (so.vehicleId) {
        try { await storage.updateVehicle(so.vehicleId, { status: "disponível" }); } catch (_e) {}
      }

      lastMissionPos.delete(serviceOrderId);
      try { await supabaseAdmin.from("mission_positions").delete().eq("service_order_id", serviceOrderId); } catch (_e) {}

      try {
        await supabaseAdmin.from("escort_billings")
          .update({ status: "CANCELADO", fat_total: 0, fat_acionamento: 0, fat_hora_extra: 0, fat_km: 0 })
          .eq("service_order_id", serviceOrderId)
          .in("status", ["A_VERIFICAR", "VERIFICADA", "PENDENTE"]);
      } catch (_e) {}

      try {
        const { data: existingCosts } = await supabaseAdmin.from("mission_costs")
          .select("id")
          .eq("service_order_id", serviceOrderId);
        if (existingCosts?.length) {
          for (const mc of existingCosts) {
            try { await removeAutoTransaction("mission_cost", String(mc.id)); } catch (_e) {}
          }
        }
        await supabaseAdmin.from("mission_costs").delete().eq("service_order_id", serviceOrderId);
      } catch (_e) {}

      try {
        await removeAutoTransaction("service_order", String(serviceOrderId));
      } catch (_e) {}

      try {
        const { data: pendingTxs } = await supabaseAdmin.from("financial_transactions")
          .select("id, asaas_payment_id")
          .eq("origin_type", "service_order")
          .eq("origin_id", String(serviceOrderId))
          .not("asaas_payment_id", "is", null);
        if (pendingTxs?.length && process.env.ASAAS_API_KEY) {
          const apiKey = process.env.ASAAS_API_KEY;
          const baseUrl = apiKey.startsWith("$aact_") ? "https://api.asaas.com/v3" : "https://sandbox.asaas.com/api/v3";
          for (const tx of pendingTxs) {
            if (!tx.asaas_payment_id) continue;
            try {
              await fetch(`${baseUrl}/payments/${tx.asaas_payment_id}`, {
                method: "DELETE",
                headers: { "access_token": apiKey },
              });
              console.log(`[OS-Refuse] Asaas payment ${tx.asaas_payment_id} cancelled for OS #${so.osNumber}`);
            } catch (asaasErr: any) {
              console.error(`[OS-Refuse] Asaas cancel failed: ${asaasErr.message}`);
            }
          }
        }
      } catch (_e) {}

      const updated = await storage.updateServiceOrder(serviceOrderId, updates);
      console.log(`[OS-Refuse] OS ${so.osNumber} recusada por ${adminName} — motivo: ${motivo}`);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/mission/finish", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { serviceOrderId } = req.body;
      const so = await storage.getServiceOrder(serviceOrderId);
      if (!so) return res.status(404).json({ message: "OS não encontrada" });

      const updates: any = {
        status: "concluída",
        missionStatus: "encerrada",
        completedDate: nowBRTString(),
      };

      if (so.kitId) {
        try { await storage.updateWeaponKit(so.kitId, { status: "disponível" }); } catch (_e) {}
      }
      if (so.vehicleId) {
        try { await storage.updateVehicle(so.vehicleId, { status: "disponível" }); } catch (_e) {}
      }

      const existingLogs = Array.isArray(so.stepLogs) ? so.stepLogs : [];
      const user = req.user!;
      const finishEntry = {
        step: "encerrada",
        completedAt: new Date().toISOString(),
        agentName: `ADMIN: ${user.name}`,
        agentId: user.id,
        geo: null,
        nextStep: "encerrada",
        reason: "Missão finalizada pelo administrador",
      };
      updates.stepLogs = [...existingLogs, finishEntry];

      lastMissionPos.delete(serviceOrderId);
      try { await supabaseAdmin.from("mission_positions").delete().eq("service_order_id", serviceOrderId); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }

      const updated = await storage.updateServiceOrder(serviceOrderId, updates);

      if (so.type === "escolta") {
        try {
          const { data: billing } = await supabaseAdmin.from("escort_billings")
            .select("fat_total, client_name")
            .eq("service_order_id", serviceOrderId)
            .order("created_at", { ascending: false })
            .limit(1);
          const billingRow = billing?.[0];
          const fatTotal = billingRow ? Number(billingRow.fat_total || 0) : 0;
          const revenueAmount = fatTotal > 0 ? fatTotal : Number((so as any).valorEstimado || 0);
          const clientName = billingRow?.client_name || (so.clientId ? (await storage.getClient(so.clientId))?.name : null) || "—";
          const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;
          const plateStr = vehicle?.plate || "";

          if (revenueAmount > 0) {
            await removeAutoTransaction("service_order", String(serviceOrderId));
            await createAutoTransaction({
              description: `RECEITA OS ${so.osNumber} - ${clientName} ${plateStr}`.toUpperCase().trim(),
              amount: revenueAmount,
              type: "INCOME",
              due_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
              origin_type: "service_order",
              origin_id: String(serviceOrderId),
              category_name: "Receita de Escolta",
              entity_name: clientName,
              created_by: user.name,
            });
            if (fatTotal > 0) await storage.updateServiceOrder(serviceOrderId, { valorEstimado: fatTotal } as any);
            console.log(`[OS-Financial] Auto INCOME created for OS ${so.osNumber}: R$ ${revenueAmount} (billing: ${fatTotal}, estimado: ${(so as any).valorEstimado || 0})`);
          }
        } catch (e: any) {
          console.error(`[OS-Financial] Failed to create auto-transaction for OS ${so.osNumber}:`, e.message);
        }
      }

      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/mission/advance", requireAuth, async (req, res) => {
    const user = req.user!;
    const userIsAdminOrDir = user.role === "admin" || user.role === "diretoria";
    if (!user.employeeId && !userIsAdminOrDir) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId, latitude, longitude } = req.body;
    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    if (so.status !== "em_andamento" && so.status !== "agendada") {
      return res.status(403).json({ message: "OS não está em andamento. Aguarde a liberação pela administração." });
    }

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId ||
      userIsAdminOrDir;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    const currentIdx = MISSION_STEPS.indexOf(so.missionStatus as any);
    if (currentIdx < 0 || currentIdx >= MISSION_STEPS.length - 1) {
      return res.status(400).json({ message: "Missão já finalizada ou status inválido" });
    }

    const currentStep = MISSION_STEPS[currentIdx];


    // Início antecipado liberado: agente pode avançar assim que confirmar ciência da missão,
    // independente do horário agendado ou de aprovação da central (pedido da operação).

    const DRIVER_CHECK_STEPS: Record<string, string> = {
      aguardando: "Antes de iniciar a missão",
      checkout_viatura: "Após finalizar o checklist da viatura",
      checkout_km_saida: "Antes de iniciar o deslocamento à origem",
      iniciar_missao: "Antes de iniciar o deslocamento ao destino",
    };
    if (DRIVER_CHECK_STEPS[currentStep] && so.vehicleId) {
      const { data: activeDriver } = await supabaseAdmin
        .from("driver_sessions")
        .select("driver_id")
        .eq("vehicle_id", so.vehicleId)
        .eq("status", "ativo")
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const validDriverIds = [so.assignedEmployeeId, so.assignedEmployee2Id].filter((x): x is number => !!x);
      const driverIsValid = activeDriver && validDriverIds.includes(activeDriver.driver_id);
      if (!driverIsValid) {
        return res.status(400).json({
          message: `CONDUTOR_OBRIGATORIO: ${DRIVER_CHECK_STEPS[currentStep]}, informe quem está dirigindo a viatura.`,
          code: "DRIVER_REQUIRED",
          stepLabel: DRIVER_CHECK_STEPS[currentStep],
        });
      }
    }

    if (so.status === "agendada" && currentStep === "aguardando") {
      await storage.updateServiceOrder(serviceOrderId, { status: "em_andamento" });
    }
    const requiredPhotos = STEP_REQUIRED_PHOTOS[currentStep];
    if (requiredPhotos) {
      const photos = await storage.getMissionPhotosByOS(serviceOrderId);
      const existingSteps = photos.map((p) => p.step);
      const missing = requiredPhotos.filter((s) => !existingSteps.includes(s));
      if (missing.length > 0) {
        return res.status(400).json({
          message: `Fotos obrigatórias pendentes: ${missing.join(", ")}`,
          missing,
        });
      }
    }

    if (currentStep === "checkin_dados_motorista") {
      if (!so.escortedDriverName || !so.escortedVehiclePlate) {
        return res.status(400).json({
          message: "Dados do motorista e placa do veículo escoltado são obrigatórios",
        });
      }
    }

    if (currentStep === "chegada_base") {
      if (!so.baseReturnKm) {
        return res.status(400).json({ message: "Quilometragem de retorno obrigatória" });
      }
      if (!so.baseCleanStatus) {
        return res.status(400).json({ message: "Status de limpeza da viatura obrigatório" });
      }
      if (!so.baseChecklistConfirmed) {
        return res.status(400).json({ message: "Checklist da viatura obrigatório" });
      }
    }

    let nextStep = MISSION_STEPS[currentIdx + 1];
    if (currentStep === "chegada_destino") {
      nextStep = "finalizada";
    }
    const updates: any = { missionStatus: nextStep };

    // REMOVIDO: auto-set de missionStartedAt em checkout_armamento/viatura/saida/em_transito_origem.
    // Esses passos acontecem ANTES do agente sair pra rota — chegar na origem ou pegar viatura
    // não é "início de cobrança". O missionStartedAt agora só é setado no clique de "iniciar_missao"
    // (bloco abaixo), respeitando o horário real do clique sem snap pro agendado.

    if (currentStep === "iniciar_missao" && req.body.timestamp) {
      const ts = req.body.timestamp;
      const parsed = new Date(ts);
      if (!isNaN(parsed.getTime())) {
        if (!ts.includes("+") && !ts.includes("-0") && !ts.includes("Z")) {
          updates.missionStartedAt = ts + "-03:00";
        } else {
          updates.missionStartedAt = ts;
        }
      }
    }

    if (currentStep === "iniciar_missao" && !so.missionStartedAt && !updates.missionStartedAt) {
      updates.missionStartedAt = nowBRTString();
    }

    // Regra intocável #2: nunca sobrescrever status="recusada" — operacional
    // não atendeu, mesmo que algum evento mobile residual chegue depois.
    const soIsRecusada = so.status === "recusada";

    if (nextStep === "finalizada") {
      updates.completedDate = nowBRTString();
      if (!soIsRecusada) updates.status = "concluida";
      lastMissionPos.delete(serviceOrderId);
      try { await supabaseAdmin.from("mission_positions").delete().eq("service_order_id", serviceOrderId); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }
    }

    if (nextStep === "encerrada") {
      if (!soIsRecusada && updates.status !== "concluida") updates.status = "concluida";
      lastMissionPos.delete(serviceOrderId);
      try { await supabaseAdmin.from("mission_positions").delete().eq("service_order_id", serviceOrderId); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }
    }

    const existingLogs = Array.isArray(so.stepLogs) ? so.stepLogs : [];
    const geo = req.body.latitude && req.body.longitude ? { lat: req.body.latitude, lng: req.body.longitude } : null;
    const emp = await storage.getEmployee(user.employeeId);
    const stepLogEntry = {
      step: currentStep,
      completedAt: new Date().toISOString(),
      agentName: emp?.fullName || user.name || "—",
      agentId: user.employeeId,
      geo,
      nextStep,
    };
    updates.stepLogs = [...existingLogs, stepLogEntry];

    const updated = await storage.updateServiceOrder(serviceOrderId, updates);

    const STEP_ALERT_LABELS: Record<string, string> = {
      aguardando: "Aguardando", checkout_km_saida: "Checkout KM Saída",
      em_transito_origem: "Em Trânsito Origem", checkin_chegada_km: "Na Origem",
      checkin_veiculo_escoltado: "Na Origem", checkin_dados_motorista: "Na Origem", iniciar_missao: "Início Missão",
      em_transito_destino: "Em Trânsito Destino", chegada_destino: "Chegada Destino",
      checkout_km_final: "KM Final", finalizada: "Finalizada",
      chegada_base: "Chegada Base", encerrada: "Encerrada",
    };
    try {
      const stepToLabel = STEP_ALERT_LABELS[nextStep] || nextStep;
      await supabaseAdmin.from("mission_updates").insert({
        service_order_id: serviceOrderId,
        os_number: so.osNumber || null,
        employee_id: user.employeeId,
        employee_name: emp?.fullName || emp?.name || user.name || "—",
        message: `🔄 ${stepToLabel}`,
        mission_step: nextStep,
        latitude: geo?.lat?.toString() || null,
        longitude: geo?.lng?.toString() || null,
        photo_url: null,
        read_by_admin: 0,
      });
      console.log(`[mission-advance] Alert created: ${currentStep} → ${nextStep} OS #${so.osNumber}`);
    } catch (alertErr: any) {
      console.error(`[mission-advance] Alert insert error (non-fatal): ${alertErr.message}`);
    }

    if (nextStep === "finalizada" && so.kitId) {
      await storage.updateWeaponKit(so.kitId, { status: "disponível" });
    }

    if (nextStep === "finalizada" && so.vehicleId) {
      try {
        await storage.updateVehicle(so.vehicleId, { status: "disponível" });
        const veh = await storage.getVehicle(so.vehicleId);
        const photos = await storage.getMissionPhotosByOS(serviceOrderId);
        const allKmValues = [
          so.baseReturnKm ? Number(so.baseReturnKm) : 0,
          ...photos.filter(p => p.kmValue).map(p => Number(p.kmValue)),
        ].filter(v => v > 0);
        const highestKm = Math.max(...allKmValues, 0);
        if (veh && highestKm > 0 && highestKm >= (veh.km || 0)) {
          await storage.updateVehicle(so.vehicleId, { km: highestKm, lastKmUpdate: new Date() });
        }
      } catch (kmErr: any) {
        console.error("Vehicle KM/status update on finalizada failed:", kmErr.message);
      }
    }

    if (nextStep === "encerrada" && so.kitId) {
      try { await storage.updateWeaponKit(so.kitId, { status: "disponível" }); } catch (_e) {}
    }

    if (nextStep === "encerrada") {
      try {
        const photos = await storage.getMissionPhotosByOS(serviceOrderId);
        const kmSaidaPhoto = photos.find(p => p.step === "km_saida");
        const kmChegadaPhoto = [...photos].reverse().find(p => p.step === "km_chegada");
        const kmFinalPhoto = photos.find(p => p.step === "km_final");
        const kmInicial = kmChegadaPhoto?.kmValue || 0;
        const kmFinal = kmFinalPhoto?.kmValue || 0;

        const toBRTe = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
        const scheduledTime = so.scheduledDate ? toBRTe(new Date(so.scheduledDate)) : undefined;
        const encStepLogs = (so.stepLogs || []) as any[];
        // INICIO REAL = clique em "iniciar_missao" / "em_transito_destino" (saiu pra rota).
        // Chegar na origem (checkin_chegada_km) NÃO conta como início.
        const inicioMissaoLog = [...encStepLogs].reverse().find((l: any) => (l.step === "iniciar_missao" || l.step === "em_transito_destino") && l.timestamp);
        const inicioMissaoTime = inicioMissaoLog ? toBRTe(new Date(inicioMissaoLog.timestamp)) : undefined;
        const startTime = inicioMissaoTime || (so.missionStartedAt ? toBRTe(new Date(so.missionStartedAt as string)) : undefined);
        const completedDateVal = updated.completedDate || so.completedDate;
        const endTime = completedDateVal ? toBRTe(new Date(completedDateVal as string)) : undefined;

        let contrato: any = { valor_km_carregado: 2.80, valor_km_vazio: 1.40, franquia_minima_km: 50, valor_hora_estadia: 50, valor_diaria: 200, vrp_base: 150, adicional_noturno_vrp_pct: 20, adicional_noturno_km_pct: 15, adicional_periculosidade_pct: 30, periculosidade_horas_limite: 8 };

        if (so.escortContractId) {
          const { data: cc } = await supabaseAdmin.from("escort_contracts").select("*").eq("id", so.escortContractId).limit(1);
          if (cc?.length) contrato = cc[0];
        } else if (so.clientId) {
          const { data: clientContracts } = await supabaseAdmin.from("escort_contracts").select("*").eq("client_id", so.clientId).limit(1);
          if (clientContracts?.length) contrato = clientContracts[0];
        }

        {
          const osMissionCosts = await storage.getMissionCostsByOS(serviceOrderId);
          const _splitM = splitMissionCostsForBilling(osMissionCosts);
          let despPedagio = _splitM.despesas_pedagio;
          const despCombustivel = _splitM.despesas_combustivel;
          const despOutras = _splitM.despesas_outras;
          const receitasOsEnc = _splitM.receitas_os;
          const pedagioEstimado = Number((so as any).pedagioEstimado) || 0;
          if (pedagioEstimado > 0 && despPedagio === 0) despPedagio = pedagioEstimado;

          const kmRotaEnc = extractKmFromText(so.destination) || extractKmFromText(so.route) || undefined;

          const resultado = calcularEscolta({
            km_inicial: kmInicial, km_final: kmFinal > kmInicial ? kmFinal : kmInicial, km_vazio: 0,
            horas_missao: 0, horas_estadia: 0, teve_pernoite: false,
            horario_inicio: startTime, horario_fim: endTime, horario_agendado: scheduledTime,
            inicio_ts: so.missionStartedAt ? new Date(so.missionStartedAt as any).toISOString() : null,
            fim_ts: completedDateVal ? new Date(completedDateVal as any).toISOString() : null,
            scheduled_date: so.scheduledDate ? new Date(so.scheduledDate as any).toISOString() : null,
            despesas_pedagio: despPedagio, despesas_combustivel: despCombustivel, despesas_outras: despOutras, receitas_os: receitasOsEnc, contrato,
            kmRota: kmRotaEnc,
          });

          const client = so.clientId ? await storage.getClient(so.clientId) : null;
          const emp = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
          const emp2 = so.assignedEmployee2Id ? await storage.getEmployee(so.assignedEmployee2Id) : null;

          const nb = (v: any) => Number(v) || 0;
          const billingPayload = {
            service_order_id: serviceOrderId,
            client_id: so.clientId, client_name: client?.name || "—",
            contract_id: contrato.id || null,
            km_inicial: nb(kmInicial), km_final: nb(kmFinal > kmInicial ? kmFinal : kmInicial), km_vazio: 0,
            km_carregado: nb(resultado.km_carregado), km_total: nb(resultado.km_total),
            km_faturado: nb(resultado.km_faturado), km_franquia: nb(resultado.km_franquia),
            km_excedente: nb(resultado.km_excedente),
            horario_agendado: scheduledTime || null,
            horario_inicio: startTime || null, horario_fim: endTime || null,
            horario_inicio_considerado: resultado.horario_inicio_considerado,
            horas_missao: nb(resultado.horas_trabalhadas), horas_trabalhadas: nb(resultado.horas_trabalhadas),
            horas_estadia: 0, teve_pernoite: false, is_noturno: resultado.is_noturno,
            fat_acionamento: nb(resultado.fat_acionamento), fat_hora_extra: nb(resultado.fat_hora_extra),
            fat_km: nb(resultado.fat_km), fat_km_carregado: nb(resultado.faturamento.km_carregado),
            fat_km_vazio: nb(resultado.faturamento.km_vazio),
            fat_estadia: nb(resultado.fat_estadia), fat_pernoite: nb(resultado.fat_pernoite),
            fat_diaria: nb(resultado.fat_pernoite), fat_adicional_noturno: nb(resultado.fat_adicional_noturno),
            fat_total: nb(resultado.fat_total), receitas_os: nb(receitasOsEnc),
            valor_franquia: nb(resultado.valor_franquia), valor_km_extra: nb(resultado.valor_km_extra),
            pag_vrp: nb(resultado.pag_vrp), pag_periculosidade: nb(resultado.pag_periculosidade),
            pag_adicional_noturno: nb(resultado.pag_adicional_noturno),
            pag_reembolsos: nb(resultado.pag_reembolsos), pag_total: nb(resultado.pag_total),
            despesas_pedagio: nb(despPedagio), despesas_combustivel: nb(despCombustivel), despesas_outras: nb(despOutras),
            resultado_bruto: nb(resultado.resultado.bruto), resultado_liquido: nb(resultado.resultado.liquido),
            margem_percentual: nb(resultado.resultado.margem_pct),
            vigilante_id: so.assignedEmployeeId, vigilante_name: emp?.name || user.name,
            vigilante2_id: so.assignedEmployee2Id || null, vigilante2_name: emp2?.name || null,
            origem: so.origin || null, destino: so.destination || null,
            placa_viatura: so.vehicleId ? (await storage.getVehicle(so.vehicleId))?.plate || null : null,
            placa_escoltado: so.escortedVehiclePlate || null,
            motorista_escoltado: so.escortedDriverName || null,
            data_missao: so.scheduledDate || so.missionStartedAt || new Date().toISOString(),
            status: "A_VERIFICAR", created_by: user.name,
          };
          // UPSERT atômico via ON CONFLICT (service_order_id) — usa UNIQUE uniq_eb_so_id.
          // Substitui o padrão SELECT-then-UPDATE/INSERT (vulnerável a race entre clique duplo / cron paralelo).
          await supabaseAdmin.from("escort_billings")
            .upsert(billingPayload, { onConflict: "service_order_id" });
          console.log(`[auto-billing] OS ${so.osNumber}: UPSERTED billing km_ini=${kmInicial} km_fin=${kmFinal} fat_total=${resultado.fat_total}`);
        }
      } catch (billingErr: any) {
        console.error("Auto-billing creation failed (non-blocking):", billingErr.message);
      }

      if (so.type === "escolta") {
        try {
          const { data: billing } = await supabaseAdmin.from("escort_billings")
            .select("fat_total, client_name")
            .eq("service_order_id", serviceOrderId)
            .order("created_at", { ascending: false })
            .limit(1);
          const billingRow = billing?.[0];
          const fatTotal = billingRow ? Number(billingRow.fat_total || 0) : 0;
          const revenueAmount = fatTotal > 0 ? fatTotal : Number((so as any).valorEstimado || 0);
          const clientName = billingRow?.client_name || (so.clientId ? (await storage.getClient(so.clientId))?.name : null) || "—";
          const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;
          const plateStr = vehicle?.plate || "";

          if (revenueAmount > 0) {
            await removeAutoTransaction("service_order", String(serviceOrderId));
            await createAutoTransaction({
              description: `RECEITA OS ${so.osNumber} - ${clientName} ${plateStr}`.toUpperCase().trim(),
              amount: revenueAmount,
              type: "INCOME",
              due_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
              origin_type: "service_order",
              origin_id: String(serviceOrderId),
              category_name: "Receita de Escolta",
              entity_name: clientName,
              created_by: emp?.name || user.name,
            });
            if (fatTotal > 0) await storage.updateServiceOrder(serviceOrderId, { valorEstimado: fatTotal } as any);
            console.log(`[OS-Financial] Auto INCOME created via advance for OS ${so.osNumber}: R$ ${revenueAmount}`);
          }
        } catch (revErr: any) {
          console.error(`[OS-Financial] Revenue auto-tx via advance failed for OS ${so.osNumber}:`, revErr.message);
        }
      }
    }

    res.json(updated);
  });

  app.post("/api/mission/base-clean", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId, cleanStatus, cleanNotes, baseReturnKm, checklistConfirmed } = req.body;
    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    if (so.missionStatus !== "chegada_base") {
      return res.status(400).json({ message: "Ação disponível apenas na etapa de chegada à base" });
    }

    if (!cleanStatus || !["limpa", "suja"].includes(cleanStatus)) {
      return res.status(400).json({ message: "Status de limpeza inválido" });
    }
    if (cleanStatus === "suja" && (!cleanNotes || !cleanNotes.trim())) {
      return res.status(400).json({ message: "Motivo obrigatório quando viatura está suja" });
    }
    if (!baseReturnKm || Number(baseReturnKm) <= 0) {
      return res.status(400).json({ message: "Quilometragem de retorno obrigatória" });
    }
    if (!checklistConfirmed) {
      return res.status(400).json({ message: "Checklist da viatura obrigatório" });
    }

    const updated = await storage.updateServiceOrder(serviceOrderId, {
      baseCleanStatus: cleanStatus,
      baseCleanNotes: cleanStatus === "suja" ? cleanNotes.trim() : null,
      baseReturnKm: String(baseReturnKm),
      baseChecklistConfirmed: true,
    });

    if (so.vehicleId && Number(baseReturnKm) > 0) {
      try {
        const veh = await storage.getVehicle(so.vehicleId);
        if (veh && Number(baseReturnKm) >= (veh.km || 0)) {
          await storage.updateVehicle(so.vehicleId, { km: Number(baseReturnKm), lastKmUpdate: new Date() });
        }
      } catch {}
    }

    res.json(updated);
  });

  app.post("/api/mission/simulate-step", requireAdminRole, async (req, res) => {
    try {
      const { serviceOrderId, action } = req.body;
      const so = await storage.getServiceOrder(serviceOrderId);
      if (!so) return res.status(404).json({ message: "OS nao encontrada" });

      const currentStep = so.missionStatus as string;
      const currentIdx = MISSION_STEPS.indexOf(currentStep as any);
      if (currentIdx < 0 || currentIdx >= MISSION_STEPS.length - 1) {
        return res.status(400).json({ message: "Missao ja finalizada ou status invalido" });
      }

      // Início antecipado liberado: agente pode avançar assim que confirmar ciência,
      // independente do horário agendado ou de aprovação da central (pedido da operação).

      if (so.status === "agendada" && currentStep === "aguardando") {
        await storage.updateServiceOrder(serviceOrderId, { status: "em_andamento" });
      }

      const requiredPhotos = STEP_REQUIRED_PHOTOS[currentStep];
      if (requiredPhotos && action === "upload_photos") {
        const existingPhotos = await storage.getMissionPhotosByOS(serviceOrderId);
        const existingSteps = existingPhotos.map(p => p.step);
        const missing = requiredPhotos.filter(s => !existingSteps.includes(s));

        const empId = so.assignedEmployeeId || 0;
        const simPhoto = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsM" +
          "DhEQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQU" +
          "FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAKAAoDASIAAhEBAxEB/8QAFQABAQAA" +
          "AAAAAAAAAAAAAAAAAkn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQ" +
          "EAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==";

        const baseKm = so.vehicleId ? ((await storage.getVehicle(so.vehicleId))?.km || 100) : 100;
        const kmSteps = ["km_saida", "km_chegada", "km_final", "base_hodometro"];
        const kmIncrement: Record<string, number> = { km_saida: 0, km_chegada: 50, km_final: 50, base_hodometro: 80 };

        for (const step of missing) {
          const kmVal = kmSteps.includes(step) ? baseKm + (kmIncrement[step] || 0) : null;
          await storage.createMissionPhoto({
            serviceOrderId, employeeId: empId, step,
            photoData: simPhoto,
            kmValue: kmVal, latitude: "-23.4827", longitude: "-46.7346", notes: "SIMULACAO",
          });
          if (kmVal && so.vehicleId && kmSteps.includes(step)) {
            try {
              const veh = await storage.getVehicle(so.vehicleId);
              if (veh && kmVal >= (veh.km || 0)) {
                await storage.updateVehicle(so.vehicleId, { km: kmVal, lastKmUpdate: new Date() });
              }
            } catch {}
          }
        }
        return res.json({ message: `${missing.length} fotos simuladas enviadas`, step: currentStep, photosUploaded: missing });
      }

      if (action === "escort_data" && currentStep === "checkin_dados_motorista") {
        if (!so.escortedDriverName || !so.escortedVehiclePlate) {
          await storage.updateServiceOrder(serviceOrderId, {
            escortedDriverName: so.escortedDriverName || "Joao Silva (SIM)",
            escortedVehiclePlate: so.escortedVehiclePlate || "ABC1D23",
            escortedDriverPhone: so.escortedDriverPhone || "(11) 99999-0000",
          });
        }
        return res.json({ message: "Dados do motorista preenchidos (simulacao)" });
      }

      if (action === "start_mission" && currentStep === "iniciar_missao") {
        if (!so.missionStartedAt) {
          await storage.updateServiceOrder(serviceOrderId, { missionStartedAt: nowBRTString() });
        }
        return res.json({ message: "Missao iniciada (simulacao)" });
      }

      if (action === "base_clean" && currentStep === "chegada_base") {
        const baseKm = so.vehicleId ? ((await storage.getVehicle(so.vehicleId))?.km || 100) + 10 : 999;
        await storage.updateServiceOrder(serviceOrderId, {
          baseCleanStatus: "limpa",
          baseCleanNotes: null,
          baseReturnKm: String(baseKm),
          baseChecklistConfirmed: true,
        });
        if (so.vehicleId) {
          try {
            const veh = await storage.getVehicle(so.vehicleId);
            if (veh && baseKm >= (veh.km || 0)) {
              await storage.updateVehicle(so.vehicleId, { km: baseKm, lastKmUpdate: new Date() });
            }
          } catch {}
        }
        return res.json({ message: `Viatura limpa, KM retorno: ${baseKm} (simulacao)` });
      }

      if (action === "advance") {
        let nextStep = MISSION_STEPS[currentIdx + 1];
        if (currentStep === "chegada_destino") nextStep = "finalizada";
        const updates: any = { missionStatus: nextStep };

        if (nextStep === "finalizada") {
          updates.completedDate = nowBRTString();
        }

        if (nextStep === "encerrada") {
          updates.status = "concluida";
          lastMissionPos.delete(serviceOrderId);
          try { await supabaseAdmin.from("mission_positions").delete().eq("service_order_id", serviceOrderId); } catch (_e) { console.error("[cleanup] Failed to delete mission_positions for OS", serviceOrderId); }
        }

        const existingLogs = Array.isArray(so.stepLogs) ? so.stepLogs : [];
        const user = req.user!;
        updates.stepLogs = [...existingLogs, {
          step: currentStep, completedAt: new Date().toISOString(),
          agentName: `SIMULACAO (${user.name})`, agentId: user.id,
          geo: { lat: -23.4827, lng: -46.7346 }, nextStep,
        }];

        const updated = await storage.updateServiceOrder(serviceOrderId, updates);

        if (nextStep === "finalizada" && so.kitId) {
          await storage.updateWeaponKit(so.kitId, { status: "disponível" });
        }
        if (nextStep === "finalizada" && so.vehicleId) {
          try {
            await storage.updateVehicle(so.vehicleId, { status: "disponível" });
            const veh = await storage.getVehicle(so.vehicleId);
            const photos = await storage.getMissionPhotosByOS(serviceOrderId);
            const allKmValues = [
              so.baseReturnKm ? Number(so.baseReturnKm) : 0,
              ...photos.filter(p => p.kmValue).map(p => Number(p.kmValue)),
            ].filter(v => v > 0);
            const highestKm = Math.max(...allKmValues, 0);
            if (veh && highestKm > 0 && highestKm >= (veh.km || 0)) {
              await storage.updateVehicle(so.vehicleId, { km: highestKm, lastKmUpdate: new Date() });
            }
          } catch {}
        }
        if (nextStep === "encerrada" && so.kitId) {
          try { await storage.updateWeaponKit(so.kitId, { status: "disponível" }); } catch (_e) {}
        }

        return res.json({ message: `Avancou: ${currentStep} -> ${nextStep}`, missionStatus: nextStep, updated });
      }

      res.status(400).json({ message: "Acao invalida. Use: upload_photos, escort_data, start_mission, base_clean, advance" });
    } catch (err: any) {
      console.error("Simulation error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/mission/nova-entrega", requireAuth, async (req, res) => {
    const user = req.user!;
    if (!user.employeeId) return res.status(403).json({ message: "Usuário não é funcionário" });

    const { serviceOrderId } = req.body;
    const so = await storage.getServiceOrder(serviceOrderId);
    if (!so) return res.status(404).json({ message: "OS não encontrada" });

    const isAssigned =
      so.assignedEmployeeId === user.employeeId ||
      so.assignedEmployee2Id === user.employeeId;
    if (!isAssigned) return res.status(403).json({ message: "Você não está atribuído a esta OS" });

    if (so.missionStatus !== "chegada_destino") {
      return res.status(400).json({ message: "Ação disponível apenas na etapa de chegada no destino" });
    }

    const requiredPhotos = STEP_REQUIRED_PHOTOS["chegada_destino"] || [];
    if (requiredPhotos.length > 0) {
      const photos = await storage.getMissionPhotosByOS(serviceOrderId);
      const existingSteps = photos.map((p) => p.step);
      const missing = requiredPhotos.filter((s) => !existingSteps.includes(s));
      if (missing.length > 0) {
        return res.status(400).json({
          message: `Fotos obrigatórias pendentes: ${missing.join(", ")}`,
          missing,
        });
      }
      const kmFinalPhoto = photos.find((p) => p.step === "km_final");
      if (!kmFinalPhoto || !kmFinalPhoto.kmValue || Number(kmFinalPhoto.kmValue) <= 0) {
        return res.status(400).json({ message: "KM Final obrigatório (informe a quilometragem do hodômetro)" });
      }
    }

    const updated = await storage.updateServiceOrder(serviceOrderId, {
      missionStatus: "em_transito_destino",
    });
    res.json(updated);
  });

  app.get("/api/missions/:osId/acceptances", requireAuth, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const isAdmin = req.user!.role === "admin" || req.user!.role === "diretoria";
      const employeeId = req.user!.employeeId;

      if (!isAdmin) {
        const os = await storage.getServiceOrder(osId);
        if (!os) return res.status(404).json({ message: "OS não encontrada" });
        if (os.assignedEmployeeId !== employeeId && os.assignedEmployee2Id !== employeeId) {
          return res.status(403).json({ message: "Acesso negado a esta missão" });
        }
      }

      const { data, error } = await supabaseAdmin
        .from("mission_acceptances").select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const enriched = await Promise.all((data || []).map(async (a: any) => {
        const emp = await storage.getEmployee(a.employee_id);
        const base: any = { ...a, employeeName: emp?.name || "Agente" };
        if (isAdmin) {
          base.employeeCpf = emp?.cpf || null;
          base.employeeMatricula = emp?.matricula || null;
        }
        return base;
      }));

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/employees/:id/acceptances", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const employeeId = Number(req.params.id);
      const { data, error } = await supabaseAdmin
        .from("mission_acceptances").select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const enriched = await Promise.all((data || []).map(async (a: any) => {
        const os = await storage.getServiceOrder(a.service_order_id);
        return { ...a, osNumber: os?.osNumber || "?", osDate: os?.scheduledDate, osType: os?.type };
      }));

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/missions/:osId/accept", requireAuth, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const userId = req.user!.id;
      const { locationLat, locationLng, deviceInfo, conversationId } = req.body;
      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";

      const employeeId = req.user!.employeeId;
      if (!employeeId) return res.status(404).json({ message: "Funcionário não vinculado ao usuário" });
      const emp = await storage.getEmployee(employeeId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });

      const osCheck = await storage.getServiceOrder(osId);
      if (!osCheck) return res.status(404).json({ message: "OS não encontrada" });
      if (osCheck.assignedEmployeeId !== emp.id && osCheck.assignedEmployee2Id !== emp.id) {
        return res.status(403).json({ message: "Você não está designado para esta missão" });
      }

      // Gate de Onboarding — agente só aceita missão se Documentação, Contratos e Treinamento estiverem 100% OK
      try {
        const { assertOnboardingComplete } = await import("./onboarding");
        await assertOnboardingComplete(emp.id);
      } catch (gateErr: any) {
        if (gateErr.code === "ONBOARDING_INCOMPLETE") {
          return res.status(400).json({
            message: gateErr.message,
            code: "ONBOARDING_INCOMPLETE",
            detail: gateErr.detail,
          });
        }
        throw gateErr;
      }

      let { data: acceptance } = await supabaseAdmin
        .from("mission_acceptances").select("*")
        .eq("service_order_id", osId)
        .eq("employee_id", emp.id)
        .eq("status", "pendente")
        .maybeSingle();

      if (!acceptance) {
        const { data: existing } = await supabaseAdmin
          .from("mission_acceptances").select("status")
          .eq("service_order_id", osId)
          .eq("employee_id", emp.id)
          .maybeSingle();
        if (existing?.status === "aceito") return res.status(400).json({ message: "Missão já aceita" });

        const { data: created } = await supabaseAdmin.from("mission_acceptances").insert({
          id: randomUUID(),
          service_order_id: osId,
          employee_id: emp.id,
          status: "pendente",
          acceptance_token: randomUUID(),
        }).select().single();
        acceptance = created;
        if (!acceptance) return res.status(500).json({ message: "Erro ao criar registro de aceite" });
      }

      const now = new Date();
      await supabaseAdmin.from("mission_acceptances").update({
        status: "aceito",
        responded_at: now.toISOString(),
        ip_address: ipAddress,
        device_info: deviceInfo || null,
        location_lat: locationLat || null,
        location_lng: locationLng || null,
      }).eq("id", acceptance.id);

      await storage.updateServiceOrder(osId, { missionStatus: "aceita" });

      const { data: allAcceptances } = await supabaseAdmin
        .from("mission_acceptances").select("status")
        .eq("service_order_id", osId);
      const allAccepted = (allAcceptances || []).every((a: any) => a.status === "aceito");

      const timeBRT = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

      await logSystemAudit({
        userId, userName: req.user!.name || emp.name, userRole: req.user!.role,
        action: "mission_acceptance_accept",
        targetId: String(osId), targetType: "service_order",
        details: JSON.stringify({
          osNumber: osCheck.osNumber, employeeId: emp.id, employeeName: emp.name,
          respondedAt: timeBRT, ipAddress, deviceInfo, locationLat, locationLng,
          acceptanceToken: acceptance.acceptance_token,
          allAccepted,
        }),
        ipAddress,
      });

      const targetConvId = conversationId || null;
      if (targetConvId) {
        const { data: convPart } = await supabaseAdmin
          .from("chat_participants").select("id")
          .eq("conversation_id", targetConvId)
          .eq("user_id", userId)
          .limit(1);
        if (convPart?.length) {
          await supabaseAdmin.from("chat_messages").insert({
            id: randomUUID(),
            conversation_id: targetConvId,
            sender_id: userId,
            type: "system",
            content: `✅ ${emp.name} aceitou a missão ${osCheck.osNumber} — ${timeBRT}`,
          });
        }
      } else {
        const { data: convs } = await supabaseAdmin
          .from("chat_participants").select("conversation_id")
          .eq("user_id", userId);
        if (convs?.length) {
          for (const c of convs) {
            const { data: msgs } = await supabaseAdmin
              .from("chat_messages").select("id, content")
              .eq("conversation_id", c.conversation_id)
              .eq("type", "mission_invite")
              .limit(20);
            const match = (msgs || []).find((m: any) => {
              try { return JSON.parse(m.content || "{}").osId === osId; } catch { return false; }
            });
            if (match) {
              await supabaseAdmin.from("chat_messages").insert({
                id: randomUUID(),
                conversation_id: c.conversation_id,
                sender_id: userId,
                type: "system",
                content: `✅ ${emp.name} aceitou a missão ${osCheck.osNumber} — ${timeBRT}`,
              });
              break;
            }
          }
        }
      }

      res.json({ success: true, allAccepted });
    } catch (err: any) {
      console.error("[mission] accept error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/missions/:osId/refuse", requireAuth, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const userId = req.user!.id;
      const { notes, deviceInfo, conversationId } = req.body;
      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";

      if (!notes || !notes.trim()) return res.status(400).json({ message: "Justificativa obrigatória para recusa" });

      const employeeId = req.user!.employeeId;
      if (!employeeId) return res.status(404).json({ message: "Funcionário não vinculado ao usuário" });
      const emp = await storage.getEmployee(employeeId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });

      const osCheck = await storage.getServiceOrder(osId);
      if (!osCheck) return res.status(404).json({ message: "OS não encontrada" });
      if (osCheck.assignedEmployeeId !== emp.id && osCheck.assignedEmployee2Id !== emp.id) {
        return res.status(403).json({ message: "Você não está designado para esta missão" });
      }

      let { data: acceptance } = await supabaseAdmin
        .from("mission_acceptances").select("*")
        .eq("service_order_id", osId)
        .eq("employee_id", emp.id)
        .eq("status", "pendente")
        .maybeSingle();

      if (!acceptance) {
        const { data: created } = await supabaseAdmin.from("mission_acceptances").insert({
          id: randomUUID(),
          service_order_id: osId,
          employee_id: emp.id,
          status: "pendente",
          acceptance_token: randomUUID(),
        }).select().single();
        acceptance = created;
        if (!acceptance) return res.status(500).json({ message: "Erro ao criar registro de aceite" });
      }

      const now = new Date();
      await supabaseAdmin.from("mission_acceptances").update({
        status: "recusado",
        responded_at: now.toISOString(),
        ip_address: ipAddress,
        device_info: deviceInfo || null,
        notes: notes.trim(),
      }).eq("id", acceptance.id);

      const timeBRT = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

      await storage.updateServiceOrder(osId, {
        status: "recusada",
        revenueValue: 0,
      } as any);
      await supabaseAdmin.from("service_orders").update({
        fat_calculado: 0,
        custo_total_alocado: 0,
        lucro_calculado: 0,
        margem_calculada: 0,
        valor_estimado: 0,
        pedagio_estimado: 0,
        custos_congelados_em: now.toISOString(),
        custos_congelados_por: `recusada_por_${emp.name}`,
      }).eq("id", osId);

      try {
        await supabaseAdmin.from("escort_billings")
          .update({ status: "CANCELADA" })
          .eq("service_order_id", osId)
          .in("status", ["A_VERIFICAR", "VERIFICADA", "PENDENTE"]);
      } catch (_e) {}

      try {
        const { data: pendingTxs } = await supabaseAdmin.from("financial_transactions")
          .select("id, asaas_payment_id")
          .eq("origin_type", "service_order")
          .eq("origin_id", String(osId))
          .not("asaas_payment_id", "is", null);
        if (pendingTxs?.length && process.env.ASAAS_API_KEY) {
          const apiKey = process.env.ASAAS_API_KEY;
          const baseUrl = apiKey.startsWith("$aact_") ? "https://api.asaas.com/v3" : "https://sandbox.asaas.com/api/v3";
          for (const tx of pendingTxs) {
            if (!tx.asaas_payment_id) continue;
            try {
              await fetch(`${baseUrl}/payments/${tx.asaas_payment_id}`, {
                method: "DELETE",
                headers: { "access_token": apiKey },
              });
              console.log(`[OS-recusada] Asaas payment ${tx.asaas_payment_id} cancelled for OS #${osCheck.osNumber}`);
            } catch (asaasErr: any) {
              console.error(`[OS-recusada] Asaas cancel failed: ${asaasErr.message}`);
            }
          }
        }
      } catch (_e) {}

      try {
        const { data: existingCosts } = await supabaseAdmin.from("mission_costs")
          .select("id")
          .eq("service_order_id", osId);
        if (existingCosts?.length) {
          for (const mc of existingCosts) {
            try { await removeAutoTransaction("mission_cost", String(mc.id)); } catch (_e) {}
          }
        }
        await supabaseAdmin.from("mission_costs").delete().eq("service_order_id", osId);
      } catch (_e) {}

      try { await removeAutoTransaction("service_order", String(osId)); } catch (_e) {}

      if (osCheck.vehicleId) {
        try { await storage.updateVehicle(osCheck.vehicleId, { status: "disponível" }); } catch (_e) {}
      }
      if ((osCheck as any).kitId) {
        try { await storage.updateWeaponKit((osCheck as any).kitId, { status: "disponível" }); } catch (_e) {}
      }

      await logSystemAudit({
        userId, userName: req.user!.name || emp.name, userRole: req.user!.role,
        action: "OS_RECUSADA",
        targetId: String(osId), targetType: "service_order",
        details: JSON.stringify({
          osNumber: osCheck.osNumber, employeeId: emp.id, employeeName: emp.name,
          respondedAt: timeBRT, ipAddress, deviceInfo, reason: notes.trim(),
          acceptanceToken: acceptance.acceptance_token,
          previousStatus: osCheck.status,
          faturamentoZerado: true,
          billingsCanceladas: true,
          custosDeletados: true,
        }),
        ipAddress,
      });

      const targetConvId = conversationId || null;
      if (targetConvId) {
        const { data: convPart } = await supabaseAdmin
          .from("chat_participants").select("id")
          .eq("conversation_id", targetConvId)
          .eq("user_id", userId)
          .limit(1);
        if (convPart?.length) {
          await supabaseAdmin.from("chat_messages").insert({
            id: randomUUID(),
            conversation_id: targetConvId,
            sender_id: userId,
            type: "system",
            content: `🔴 ${emp.name} RECUSOU a missão ${osCheck.osNumber} — Motivo: ${notes.trim()} — ${timeBRT}`,
          });
        }
      } else {
        const { data: convs } = await supabaseAdmin
          .from("chat_participants").select("conversation_id")
          .eq("user_id", userId);
        if (convs?.length) {
          for (const c of convs) {
            const { data: msgs } = await supabaseAdmin
              .from("chat_messages").select("id, content")
              .eq("conversation_id", c.conversation_id)
              .eq("type", "mission_invite")
              .limit(20);
            const match = (msgs || []).find((m: any) => {
              try { return JSON.parse(m.content || "{}").osId === osId; } catch { return false; }
            });
            if (match) {
              await supabaseAdmin.from("chat_messages").insert({
                id: randomUUID(),
                conversation_id: c.conversation_id,
                sender_id: userId,
                type: "system",
                content: `🔴 ${emp.name} RECUSOU a missão ${osCheck.osNumber} — Motivo: ${notes.trim()} — ${timeBRT}`,
              });
              break;
            }
          }
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[mission] refuse error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/missions/:osId/acceptances/:employeeId/comprovante", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      const employeeId = Number(req.params.employeeId);

      const { data: acceptance } = await supabaseAdmin
        .from("mission_acceptances").select("*")
        .eq("service_order_id", osId)
        .eq("employee_id", employeeId)
        .eq("status", "aceito")
        .maybeSingle();

      if (!acceptance) return res.status(404).json({ message: "Aceite não encontrado" });

      const os = await storage.getServiceOrder(osId);
      const emp = await storage.getEmployee(employeeId);
      if (!os || !emp) return res.status(404).json({ message: "OS ou funcionário não encontrado" });

      const respondedBRT = acceptance.responded_at
        ? new Date(acceptance.responded_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
        : "N/A";

      res.json({
        osNumber: os.osNumber,
        osType: os.type,
        scheduledDate: os.scheduledDate,
        origin: os.origin,
        destination: os.destination,
        employeeName: emp.name,
        employeeCpf: emp.cpf,
        employeeMatricula: emp.matricula,
        status: acceptance.status,
        respondedAt: respondedBRT,
        ipAddress: acceptance.ip_address,
        deviceInfo: acceptance.device_info,
        locationLat: acceptance.location_lat,
        locationLng: acceptance.location_lng,
        acceptanceToken: acceptance.acceptance_token,
        notifiedAt: acceptance.notified_at,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/relatorio-aceites", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { startDate, endDate, employeeId, status } = req.query;
      let query = supabaseAdmin.from("mission_acceptances").select("*").order("created_at", { ascending: false });

      if (startDate) query = query.gte("created_at", startDate as string);
      if (endDate) query = query.lte("created_at", endDate as string);
      if (employeeId) query = query.eq("employee_id", Number(employeeId));
      if (status) query = query.eq("status", status as string);

      const { data, error } = await query;
      if (error) throw error;

      const enriched = await Promise.all((data || []).map(async (a: any) => {
        const emp = await storage.getEmployee(a.employee_id);
        const os = await storage.getServiceOrder(a.service_order_id);
        return {
          ...a,
          employeeName: emp?.name || "?",
          osNumber: os?.osNumber || "?",
          osDate: os?.scheduledDate,
          osType: os?.type,
        };
      }));

      const total = enriched.length;
      const aceitos = enriched.filter(a => a.status === "aceito").length;
      const recusados = enriched.filter(a => a.status === "recusado").length;
      const expirados = enriched.filter(a => a.status === "expirado").length;
      const pendentes = enriched.filter(a => a.status === "pendente").length;

      res.json({
        summary: { total, aceitos, recusados, expirados, pendentes },
        data: enriched,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/laudo/:osId", requireAuth, async (req, res) => {
    try {
      const osId = Number(req.params.osId);
      if (!osId) return res.status(400).json({ message: "ID inválido" });

      const so = await storage.getServiceOrder(osId);
      if (!so) return res.status(404).json({ message: "OS não encontrada" });

      const client = so.clientId ? await storage.getClient(so.clientId) : null;

      const emp1 = so.assignedEmployeeId ? await storage.getEmployee(so.assignedEmployeeId) : null;
      const emp2 = (so as any).assignedEmployee2Id ? await storage.getEmployee((so as any).assignedEmployee2Id) : null;

      const vehicle = so.vehicleId ? await storage.getVehicle(so.vehicleId) : null;

      const { data: photos } = await supabaseAdmin
        .from("mission_photos")
        .select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: true });

      let updates: any[] = [];
      try {
        const { data, error } = await supabaseAdmin.from("mission_updates").select("*").eq("service_order_id", osId).order("created_at", { ascending: true });
        if (!error) updates = data || [];
      } catch (_muErr) {}

      const { data: positions } = await supabaseAdmin
        .from("mission_positions")
        .select("*")
        .eq("service_order_id", osId)
        .order("recorded_at", { ascending: true });

      const { data: costs } = await supabaseAdmin
        .from("mission_costs")
        .select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: true });

      const { data: acceptance } = await supabaseAdmin
        .from("mission_acceptances")
        .select("*")
        .eq("service_order_id", osId)
        .order("created_at", { ascending: false })
        .limit(5);

      const { data: billing } = await supabaseAdmin
        .from("escort_billings")
        .select("*")
        .eq("service_order_id", osId)
        .limit(1);

      const kmSaida = (photos || []).find((p: any) => p.step === "km_saida");
      const kmChegada = [...(photos || [])].reverse().find((p: any) => p.step === "km_chegada");
      const kmFinal = (photos || []).find((p: any) => p.step === "km_final");
      const kmRodados = kmSaida?.km_value && kmFinal?.km_value
        ? Number(kmFinal.km_value) - Number(kmSaida.km_value)
        : null;

      const totalCustos = (costs || []).reduce((sum: number, c: any) => sum + (Number(c.value) || 0), 0);

      const cronologia = (updates || []).map((u: any) => ({
        horario: u.created_at,
        tipo: u.type,
        descricao: u.description,
        local: u.location || null,
        fotoUrl: u.photo_url || null,
      }));

      const evidencias = (photos || []).map((p: any) => ({
        id: p.id,
        step: p.step,
        fotoUrl: p.photo_data,
        km: p.km_value,
        notas: p.notes,
        horario: p.created_at,
      }));

      const laudo = {
        geradoEm: new Date().toISOString(),
        os: {
          id: so.id,
          numero: so.osNumber,
          tipo: so.type,
          status: so.status,
          prioridade: so.priority,
          descricao: so.description,
          rota: (so as any).route || null,
          dataAgendada: so.scheduledDate,
          dataConclusao: so.completedDate,
          missionStartedAt: (so as any).missionStartedAt,
          statusMissao: (so as any).missionStatus,
          escortedDriverName: (so as any).escortedDriverName,
          escortedVehiclePlate: (so as any).escortedVehiclePlate,
          origin: (so as any).origin,
          destination: (so as any).destination,
          notas: so.notes,
        },
        cliente: client ? {
          id: client.id,
          nome: client.name,
          cnpj: (client as any).cnpj || null,
          contato: client.contactPerson,
          telefone: client.phone,
          email: client.email,
        } : null,
        equipe: {
          agente1: emp1 ? { id: emp1.id, nome: emp1.name, matricula: (emp1 as any).matricula, cargo: emp1.role, telefone: emp1.phone } : null,
          agente2: emp2 ? { id: emp2.id, nome: emp2.name, matricula: (emp2 as any).matricula, cargo: emp2.role, telefone: emp2.phone } : null,
        },
        viatura: vehicle ? {
          id: vehicle.id,
          placa: vehicle.plate,
          modelo: vehicle.model,
          marca: vehicle.brand,
          cor: (vehicle as any).color,
          km: vehicle.km,
        } : null,
        km: {
          saida: kmSaida?.km_value || null,
          chegada: kmChegada?.km_value || null,
          final: kmFinal?.km_value || null,
          rodados: kmRodados,
        },
        cronologia,
        evidencias,
        posicoes: (positions || []).map((p: any) => ({
          lat: p.latitude,
          lng: p.longitude,
          horario: p.recorded_at,
          step: p.step,
        })),
        custos: {
          itens: (costs || []).map((c: any) => ({
            tipo: c.cost_type,
            descricao: c.description,
            valor: Number(c.value),
          })),
          total: totalCustos,
        },
        faturamento: billing?.[0] ? {
          status: billing[0].status,
          valorTotal: Number(billing[0].total_value || 0),
          valorEscolta: Number(billing[0].escort_value || 0),
        } : null,
        aceites: (acceptance || []).map((a: any) => ({
          agenteId: a.employee_id,
          status: a.status,
          respondidoEm: a.responded_at,
          motivo: a.rejection_reason,
        })),
      };

      res.json(laudo);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });


  }
  