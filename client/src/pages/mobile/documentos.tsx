import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import MobileLayout from "@/components/mobile/layout";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2, ShieldCheck, Camera, Eraser, Loader2, FileX, AlertCircle, X } from "lucide-react";

interface SignableDoc {
  id: number;
  documentType: string;
  title: string;
  contentHtml?: string;
  status: string;
  assinaturaStatus: string;
  visualizadoEm?: string | null;
  assinadoEm?: string | null;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  beneficio_flash: "Cartão Flash",
  lgpd: "LGPD",
  regulamento: "Regulamento Interno",
  contrato_servico: "Contrato de Serviço",
  outros: "Documento",
};

function brtDateTime(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }); } catch { return d; }
}

// Converte data URL -> { base64, mime } cru (WAF-safe: nunca POSTar "data:image..." literal).
function splitDataUri(dataUri: string): { base64: string; mime: string } {
  const m = dataUri.match(/^data:([^;]+);base64,(.*)$/);
  if (m) return { mime: m[1], base64: m[2] };
  return { mime: "image/jpeg", base64: dataUri };
}

export default function MobileDocumentosPage() {
  const { data: docs = [], isLoading } = useQuery<SignableDoc[]>({ queryKey: ["/api/mobile/my-signable-documents"] });
  const [signing, setSigning] = useState<SignableDoc | null>(null);
  const [viewing, setViewing] = useState<SignableDoc | null>(null);

  const pendentes = docs.filter(d => d.assinaturaStatus !== "assinado");
  const assinados = docs.filter(d => d.assinaturaStatus === "assinado");

  return (
    <MobileLayout>
      {pendentes.length > 0 && (
        <div className="bg-amber-500 text-white px-4 py-3 text-center">
          <p className="text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1">
            <AlertCircle className="w-4 h-4" /> {pendentes.length} documento(s) pendente(s)
          </p>
          <p className="text-[11px] mt-1 opacity-90">Assine os documentos abaixo o quanto antes.</p>
        </div>
      )}
      <div className="px-4 py-4 space-y-4">
        <h1 className="text-lg font-black text-neutral-800 flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-600" /> Meus Documentos
        </h1>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
        ) : docs.length === 0 ? (
          <EmptyState text="Nenhum documento para assinar" />
        ) : (
          <>
            {pendentes.length > 0 && (
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-amber-700 mb-2 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Pendentes ({pendentes.length})
                </h2>
                <div className="space-y-2">
                  {pendentes.map(d => <DocCard key={d.id} d={d} onSign={() => setSigning(d)} onView={() => setViewing(d)} />)}
                </div>
              </div>
            )}
            {assinados.length > 0 && (
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-emerald-700 mb-2 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Assinados ({assinados.length})
                </h2>
                <div className="space-y-2">
                  {assinados.map(d => <DocCard key={d.id} d={d} onView={() => setViewing(d)} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {signing && <SignatureFlow doc={signing} onClose={() => setSigning(null)} />}
      {viewing && <DocViewer doc={viewing} onClose={() => setViewing(null)} />}
    </MobileLayout>
  );
}

function DocCard({ d, onSign, onView }: { d: SignableDoc; onSign?: () => void; onView?: () => void }) {
  const isAssinado = d.assinaturaStatus === "assinado";
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid={`card-documento-${d.id}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-black text-neutral-800 flex items-center gap-1">
          <FileText className={`w-4 h-4 ${isAssinado ? "text-emerald-600" : "text-amber-600"}`} />
          {d.title}
        </p>
        {isAssinado ? (
          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> ASSINADO
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-50 text-amber-700 border border-amber-200">PENDENTE</span>
        )}
      </div>
      <p className="text-[11px] text-neutral-400 mb-3">{TYPE_LABEL[d.documentType] || "Documento"} · Emitido em {brtDateTime(d.createdAt)}</p>

      {onView && (
        <Button onClick={onView} variant="outline" className="w-full h-9 text-xs mb-2" data-testid={`button-ver-documento-${d.id}`}>
          <FileText className="w-3.5 h-3.5 mr-1" /> Ver documento completo
        </Button>
      )}

      {isAssinado && d.assinadoEm && (
        <p className="text-[10px] text-emerald-700 font-medium border-t border-emerald-100 pt-2">
          Assinado em {brtDateTime(d.assinadoEm)}
        </p>
      )}

      {!isAssinado && onSign && (
        <Button onClick={onSign} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold" data-testid={`button-assinar-documento-${d.id}`}>
          <ShieldCheck className="w-4 h-4 mr-1" /> Assinar documento
        </Button>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-neutral-300">
      <FileX className="w-10 h-10 mb-2" />
      <p className="text-sm font-medium">{text}</p>
    </div>
  );
}

function DocViewer({ doc, onClose }: { doc: SignableDoc; onClose: () => void }) {
  useEffect(() => {
    if (doc.assinaturaStatus !== "assinado" && doc.status !== "visualizado") {
      apiRequest("POST", `/api/signable-documents/${doc.id}/view`)
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-signable-documents"] }))
        .catch(() => {});
    }
  }, [doc.id]);
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-900 text-white">
        <h3 className="font-black text-sm truncate pr-2">{doc.title}</h3>
        <button onClick={onClose} className="p-2 -mr-2" data-testid="button-close-doc-viewer"><X className="w-5 h-5" /></button>
      </div>
      <iframe src={`/api/signable-documents/${doc.id}/pdf`} className="flex-1 w-full" title="Documento" />
    </div>
  );
}

// ============== FLUXO DE ASSINATURA ==============
function SignatureFlow({ doc, onClose }: { doc: SignableDoc; onClose: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [termoAceito, setTermoAceito] = useState(false);
  const [facialFoto, setFacialFoto] = useState<string | null>(null);
  const [assinaturaDesenho, setAssinaturaDesenho] = useState<string | null>(null);
  const geoRef = useRef<{ lat?: number; lng?: number; accuracy?: number }>({});

  // marca como visualizado ao abrir o fluxo (best-effort)
  useEffect(() => {
    if (doc.status !== "visualizado" && doc.assinaturaStatus !== "assinado") {
      apiRequest("POST", `/api/signable-documents/${doc.id}/view`)
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-signable-documents"] }))
        .catch(() => {});
    }
  }, [doc.id]);

  // tenta capturar a geolocalização em background (best-effort, não bloqueia)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => { geoRef.current = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }; },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }, []);

  const TERMO_TEXTO = `DECLARAÇÃO DE CIÊNCIA E ACEITE — ${doc.title.toUpperCase()}

Declaro, para os devidos fins, que LI INTEGRALMENTE o presente documento e estou CIENTE e DE ACORDO com todo o seu conteúdo.

Confirmo a autenticidade desta assinatura digital realizada por mim, mediante reconhecimento facial (selfie) e assinatura manuscrita, conforme a Lei 14.063/2020, MP 2.200-2/2001 e o art. 219 do Código Civil, reconhecendo seu pleno valor jurídico equivalente à assinatura física.`;

  const submitMutation = useMutation({
    mutationFn: async (assinaturaDataUri: string) => {
      // Guardas defensivas: nunca enviar payload incompleto silenciosamente.
      // (regressão histórica: assinatura ia null no 1º toque por setState assíncrono)
      if (!termoAceito) throw new Error("É necessário aceitar o termo antes de assinar.");
      if (!facialFoto || !/^data:image\//.test(facialFoto)) {
        throw new Error("Foto facial ausente. Volte e capture/envie sua selfie.");
      }
      if (!assinaturaDataUri || !/^data:image\//.test(assinaturaDataUri)) {
        throw new Error("Assinatura ausente. Desenhe sua assinatura no campo antes de confirmar.");
      }
      const facial = splitDataUri(facialFoto);
      const sig = splitDataUri(assinaturaDataUri);
      return apiRequest("POST", `/api/signable-documents/${doc.id}/sign`, {
        facialFotoBase64: facial.base64, facialFotoMime: facial.mime,
        assinaturaBase64: sig.base64, assinaturaMime: sig.mime,
        termoAceito, termoTexto: TERMO_TEXTO,
        geo: geoRef.current,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-signable-documents"] });
      toast({ title: "Documento assinado!", description: "Sua assinatura foi registrada com sucesso." });
      onClose();
    },
    onError: (e: any) => toast({ title: "Erro ao assinar", description: e?.message || "Não foi possível registrar a assinatura. Tente novamente.", variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-900 text-white">
        <div>
          <h3 className="font-black text-sm truncate pr-2">Assinatura — {doc.title}</h3>
          <p className="text-[10px] text-neutral-400">Etapa {step} de 3</p>
        </div>
        <button onClick={onClose} className="p-2 -mr-2" data-testid="button-close-signature"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {step === 1 && <Step1Termo doc={doc} termoTexto={TERMO_TEXTO} aceito={termoAceito} setAceito={setTermoAceito} onNext={() => setStep(2)} />}
        {step === 2 && <Step2Facial foto={facialFoto} setFoto={setFacialFoto} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
        {step === 3 && <Step3Assinatura assinatura={assinaturaDesenho} setAssinatura={setAssinaturaDesenho} onBack={() => setStep(2)} onSubmit={(sig: string) => submitMutation.mutate(sig)} isPending={submitMutation.isPending} />}
      </div>
    </div>
  );
}

function Step1Termo({ doc, termoTexto, aceito, setAceito, onNext }: any) {
  const [docChecked, setDocChecked] = useState(false);
  return (
    <div className="space-y-4">
      <Button
        onClick={() => { window.open(`/api/signable-documents/${doc.id}/pdf`, "_blank"); setDocChecked(true); }}
        variant="outline"
        className="w-full h-11"
        data-testid="button-ler-documento-completo"
      >
        <FileText className="w-4 h-4 mr-1" /> Ler documento completo
      </Button>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-[11px] font-black uppercase text-amber-700 mb-2 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> Termo de aceite
        </p>
        <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-line">{termoTexto}</p>
      </div>

      <label className="flex items-start gap-2 p-3 bg-white border border-neutral-300 rounded-xl cursor-pointer active:bg-neutral-50">
        <input type="checkbox" checked={aceito} onChange={e => setAceito(e.target.checked)} className="mt-0.5 w-4 h-4" data-testid="check-termo" />
        <span className="text-xs text-neutral-800 font-medium">
          Li o documento completo e <strong>concordo</strong> com todo o seu conteúdo. Estou ciente de que esta assinatura digital tem o mesmo valor jurídico de uma assinatura física.
        </span>
      </label>

      {!docChecked && <p className="text-[11px] text-neutral-500 text-center">Abra o documento acima antes de prosseguir.</p>}

      <Button onClick={onNext} disabled={!aceito || !docChecked} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12" data-testid="button-step-next">
        Continuar para reconhecimento facial
      </Button>
    </div>
  );
}

// Carimba a foto facial (timestamp BRT) num quadrado e devolve JPEG comprimido (≤1280px).
// Usado tanto pela captura ao vivo quanto pelo fallback de upload de arquivo.
function stampFacial(source: CanvasImageSource, srcW: number, srcH: number): string {
  const size = Math.min(Math.min(srcW, srcH) || 480, 1280);
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d")!;
  const sx = (srcW - Math.min(srcW, srcH)) / 2;
  const sy = (srcH - Math.min(srcW, srcH)) / 2;
  const crop = Math.min(srcW, srcH);
  ctx.drawImage(source, sx, sy, crop, crop, 0, 0, size, size);
  const stamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, size - 28, size, 28);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(`Assinatura facial · ${stamp}`, 8, size - 8);
  return c.toDataURL("image/jpeg", 0.85);
}

function Step2Facial({ foto, setFoto, onBack, onNext }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (foto) return;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera");
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      } catch {
        // Câmera ao vivo indisponível: NÃO trava o fluxo — cai pro upload de arquivo
        // (que no celular abre a câmera nativa via capture="user").
        setError("Câmera ao vivo indisponível. Use o botão abaixo para tirar/enviar uma selfie.");
      }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [foto]);

  const capturar = () => {
    const v = videoRef.current;
    if (!v) return;
    setFoto(stampFacial(v, v.videoWidth, v.videoHeight));
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    if (!file) return;
    if (!file.type.startsWith("image/")) { setUploadError("Selecione um arquivo de imagem."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          setFoto(stampFacial(img, img.naturalWidth, img.naturalHeight));
          streamRef.current?.getTracks().forEach(t => t.stop());
        } catch {
          setUploadError("Não foi possível processar a imagem. Tente outra foto.");
        }
      };
      img.onerror = () => setUploadError("Não foi possível ler a imagem. Tente outra foto.");
      img.src = String(reader.result);
    };
    reader.onerror = () => setUploadError("Falha ao ler o arquivo. Tente novamente.");
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <Camera className="w-8 h-8 text-blue-600 mx-auto mb-1" />
        <h3 className="font-black text-base text-neutral-800">Reconhecimento Facial</h3>
        <p className="text-xs text-neutral-500">Centralize seu rosto e capture uma foto nítida</p>
      </div>

      {error && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700" data-testid="text-facial-error">{error}</div>}
      {uploadError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700" data-testid="text-facial-upload-error">{uploadError}</div>}

      <div className="aspect-square bg-black rounded-xl overflow-hidden flex items-center justify-center relative">
        {foto ? (
          <img src={foto} alt="Selfie capturada" className="w-full h-full object-cover" data-testid="img-facial-preview" />
        ) : (
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" data-testid="video-facial" />
        )}
      </div>

      {/* Fallback sempre disponível: tirar/enviar selfie via câmera nativa ou galeria. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleUpload}
        className="hidden"
        data-testid="input-facial-upload"
      />

      <div className="flex gap-2">
        <Button onClick={onBack} variant="outline" className="flex-1 h-12" data-testid="button-step-back">Voltar</Button>
        {foto ? (
          <>
            <Button onClick={() => setFoto(null)} variant="outline" className="flex-1 h-12" data-testid="button-refazer-facial">Refazer</Button>
            <Button onClick={onNext} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12" data-testid="button-step-next">Avançar</Button>
          </>
        ) : error ? (
          <Button onClick={() => fileInputRef.current?.click()} className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold h-12" data-testid="button-enviar-facial">
            <Camera className="w-4 h-4 mr-1" /> Tirar / Enviar Selfie
          </Button>
        ) : (
          <Button onClick={capturar} className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold h-12" data-testid="button-capturar-facial">
            <Camera className="w-4 h-4 mr-1" /> Capturar Foto
          </Button>
        )}
      </div>

      {/* Quando a câmera ao vivo está OK, ainda permite enviar arquivo como alternativa. */}
      {!foto && !error && (
        <Button onClick={() => fileInputRef.current?.click()} variant="ghost" className="w-full h-9 text-xs text-neutral-500" data-testid="button-enviar-facial-alt">
          Câmera não funciona? Tirar / enviar foto
        </Button>
      )}
    </div>
  );
}

function Step3Assinatura({ assinatura, setAssinatura, onBack, onSubmit, isPending }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e: any) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const start = (e: any) => { e.preventDefault(); drawingRef.current = true; lastRef.current = getPos(e); };
  const move = (e: any) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const p = getPos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(lastRef.current!.x, lastRef.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    setHasInk(true);
  };
  const end = () => { drawingRef.current = false; lastRef.current = null; };

  const limpar = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const r = c.getBoundingClientRect();
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, r.width, r.height);
    setHasInk(false);
    setAssinatura(null);
  };

  const confirmar = () => {
    if (!hasInk) return;
    const sig = canvasRef.current!.toDataURL("image/png");
    setAssinatura(sig);
    onSubmit(sig);
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto mb-1" />
        <h3 className="font-black text-base text-neutral-800">Assinatura Digital</h3>
        <p className="text-xs text-neutral-500">Use o dedo para assinar dentro do campo abaixo</p>
      </div>

      <div className="bg-white border-2 border-dashed border-neutral-300 rounded-xl overflow-hidden" style={{ height: 220 }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none cursor-crosshair"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          data-testid="canvas-assinatura"
        />
      </div>

      <Button onClick={limpar} variant="outline" className="w-full h-9 text-xs" data-testid="button-limpar-assinatura">
        <Eraser className="w-3.5 h-3.5 mr-1" /> Limpar e desenhar novamente
      </Button>

      <div className="flex gap-2">
        <Button onClick={onBack} variant="outline" className="flex-1 h-12" disabled={isPending} data-testid="button-step-back">Voltar</Button>
        <Button onClick={confirmar} disabled={!hasInk || isPending} className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12" data-testid="button-confirmar-assinatura">
          {isPending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Enviando...</> : <><CheckCircle2 className="w-4 h-4 mr-1" />Confirmar e Assinar</>}
        </Button>
      </div>
    </div>
  );
}
