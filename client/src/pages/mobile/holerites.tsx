import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import MobileLayout from "@/components/mobile/layout";
import { Button } from "@/components/ui/button";
import { DollarSign, FileText, CheckCircle2, ShieldCheck, Camera, Eraser, Loader2, FileX, AlertCircle, X } from "lucide-react";

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const BRL = (v: any) => `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TERMO_TEXTO = `DECLARAÇÃO DE CIÊNCIA E RECEBIMENTO

Declaro, para os devidos fins, que recebi e conferi o presente recibo de pagamento de salário, estando CIENTE e DE ACORDO com todos os valores discriminados (proventos, descontos, benefícios e líquido a receber).

Confirmo a autenticidade desta assinatura digital realizada por mim, mediante reconhecimento facial (selfie) e assinatura manuscrita, conforme a Lei 14.063/2020 e o art. 219 do Código Civil.`;

export default function MobileHoleritesPage() {
  const { data: payslips = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/mobile/my-payslips"] });
  const [signing, setSigning] = useState<any | null>(null);

  const pendentes = payslips.filter(p => p.assinaturaStatus !== "assinado");
  const assinados = payslips.filter(p => p.assinaturaStatus === "assinado");

  return (
    <MobileLayout title="Meus Holerites">
      <div className="px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
        ) : payslips.length === 0 ? (
          <EmptyState text="Nenhum holerite emitido ainda" />
        ) : (
          <>
            {pendentes.length > 0 && (
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-amber-700 mb-2 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Pendente de assinatura ({pendentes.length})
                </h2>
                <div className="space-y-2">
                  {pendentes.map(p => <PayslipCard key={p.id} p={p} onSign={() => setSigning(p)} />)}
                </div>
              </div>
            )}
            {assinados.length > 0 && (
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-emerald-700 mb-2 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Assinados ({assinados.length})
                </h2>
                <div className="space-y-2">
                  {assinados.map(p => <PayslipCard key={p.id} p={p} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {signing && <SignatureFlow payslip={signing} onClose={() => setSigning(null)} />}
    </MobileLayout>
  );
}

function PayslipCard({ p, onSign }: { p: any; onSign?: () => void }) {
  const isAssinado = p.assinaturaStatus === "assinado";
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid={`card-payslip-${p.id}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-black text-neutral-800">{MONTHS[p.month - 1]} / {p.year}</p>
        {isAssinado ? (
          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> ASSINADO
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-50 text-amber-700 border border-amber-200">
            PENDENTE
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-y-1 text-xs mb-3">
        <span className="text-neutral-400">Salário Base</span>
        <span className="text-neutral-700 font-medium text-right">{BRL(p.salarioBase)}</span>
        {Number(p.periculosidade) > 0 && (<><span className="text-neutral-400">Periculosidade</span><span className="text-neutral-700 font-medium text-right">{BRL(p.periculosidade)}</span></>)}
        {Number(p.horasExtras) > 0 && (<><span className="text-neutral-400">Horas Extras</span><span className="text-neutral-700 font-medium text-right">{BRL(p.horasExtras)}</span></>)}
        {Number(p.adicionalNoturno) > 0 && (<><span className="text-neutral-400">Ad. Noturno</span><span className="text-neutral-700 font-medium text-right">{BRL(p.adicionalNoturno)}</span></>)}
        {Number(p.dsr) > 0 && (<><span className="text-neutral-400">DSR</span><span className="text-neutral-700 font-medium text-right">{BRL(p.dsr)}</span></>)}
        {Number(p.valeRefeicao) > 0 && (<><span className="text-neutral-400">Vale Refeição</span><span className="text-neutral-700 font-medium text-right">{BRL(p.valeRefeicao)}</span></>)}
        {Number(p.ajudaCusto) > 0 && (<><span className="text-neutral-400">Ajuda de Custo</span><span className="text-neutral-700 font-medium text-right">{BRL(p.ajudaCusto)}</span></>)}
        {Number(p.descontos) > 0 && (<><span className="text-neutral-400">Descontos</span><span className="text-red-600 font-medium text-right">- {BRL(p.descontos)}</span></>)}
      </div>
      <div className="border-t border-neutral-200 pt-2 flex items-center justify-between">
        <span className="text-xs font-bold text-neutral-400 uppercase">Líquido</span>
        <span className="text-base font-black text-emerald-700">{BRL(p.netSalary || p.grossSalary)}</span>
      </div>

      {p.documentUrl && (
        <a href={p.documentUrl} download={`holerite-${MONTHS[p.month-1]}-${p.year}.pdf`} className="mt-3 flex items-center gap-1 text-xs text-blue-600 font-bold" data-testid={`link-pdf-${p.id}`}>
          <FileText className="w-3.5 h-3.5" /> Baixar comprovante
        </a>
      )}

      {isAssinado && p.assinadoEm && (
        <p className="mt-2 text-[10px] text-emerald-700 font-medium border-t border-emerald-100 pt-2">
          Assinado em {new Date(p.assinadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </p>
      )}

      {!isAssinado && onSign && (
        <Button onClick={onSign} className="mt-3 w-full bg-amber-500 hover:bg-amber-600 text-white font-bold" data-testid={`button-assinar-${p.id}`}>
          <ShieldCheck className="w-4 h-4 mr-1" /> Assinar holerite
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

// ============== FLUXO DE ASSINATURA ==============
function SignatureFlow({ payslip, onClose }: { payslip: any; onClose: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [termoAceito, setTermoAceito] = useState(false);
  const [facialFoto, setFacialFoto] = useState<string | null>(null);
  const [assinaturaDesenho, setAssinaturaDesenho] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/payslips/${payslip.id}/sign`, {
      facialFoto, assinaturaDesenho, termoAceito, termoTexto: TERMO_TEXTO,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/my-payslips"] });
      toast({ title: "Holerite assinado!", description: "Sua assinatura foi registrada com sucesso." });
      onClose();
    },
    onError: (e: any) => toast({ title: "Erro ao assinar", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-900 text-white">
        <div>
          <h3 className="font-black text-sm">Assinatura — {MONTHS[payslip.month - 1]}/{payslip.year}</h3>
          <p className="text-[10px] text-neutral-400">Etapa {step} de 3</p>
        </div>
        <button onClick={onClose} className="p-2 -mr-2" data-testid="button-close-signature"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {step === 1 && (
          <Step1Termo
            payslip={payslip}
            aceito={termoAceito}
            setAceito={setTermoAceito}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step2Facial
            foto={facialFoto}
            setFoto={setFacialFoto}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3Assinatura
            assinatura={assinaturaDesenho}
            setAssinatura={setAssinaturaDesenho}
            onBack={() => setStep(2)}
            onSubmit={() => submitMutation.mutate()}
            isPending={submitMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}

function Step1Termo({ payslip, aceito, setAceito, onNext }: any) {
  return (
    <div className="space-y-4">
      <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
        <p className="text-[10px] font-black uppercase text-neutral-400 mb-1">Resumo do Holerite</p>
        <div className="grid grid-cols-2 gap-y-1 text-xs">
          <span className="text-neutral-500">Competência</span>
          <span className="text-neutral-900 font-bold text-right">{MONTHS[payslip.month - 1]}/{payslip.year}</span>
          <span className="text-neutral-500">Total Bruto</span>
          <span className="text-neutral-900 font-bold text-right">{BRL(payslip.grossSalary)}</span>
          <span className="text-neutral-500">Descontos</span>
          <span className="text-red-600 font-bold text-right">- {BRL(payslip.descontos)}</span>
          <span className="text-neutral-500 border-t border-neutral-200 pt-1 mt-1">Líquido</span>
          <span className="text-emerald-700 font-black text-right border-t border-neutral-200 pt-1 mt-1 text-sm">{BRL(payslip.netSalary)}</span>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-[11px] font-black uppercase text-amber-700 mb-2 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> Termo de ciência
        </p>
        <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-line">{TERMO_TEXTO}</p>
      </div>

      <label className="flex items-start gap-2 p-3 bg-white border border-neutral-300 rounded-xl cursor-pointer active:bg-neutral-50">
        <input type="checkbox" checked={aceito} onChange={e => setAceito(e.target.checked)} className="mt-0.5 w-4 h-4" data-testid="check-termo" />
        <span className="text-xs text-neutral-800 font-medium">
          Li, conferi e <strong>concordo</strong> com todos os valores acima. Estou ciente de que esta assinatura digital tem o mesmo valor jurídico de uma assinatura física.
        </span>
      </label>

      <Button onClick={onNext} disabled={!aceito} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12" data-testid="button-step-next">
        Continuar para reconhecimento facial
      </Button>
    </div>
  );
}

function Step2Facial({ foto, setFoto, onBack, onNext }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (foto) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      } catch (e: any) {
        setError("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [foto]);

  const capturar = () => {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return;
    const size = Math.min(v.videoWidth, v.videoHeight) || 480;
    c.width = size; c.height = size;
    const ctx = c.getContext("2d")!;
    const sx = (v.videoWidth - size) / 2;
    const sy = (v.videoHeight - size) / 2;
    ctx.drawImage(v, sx, sy, size, size, 0, 0, size, size);
    // carimbo de data/hora
    const stamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, size - 28, size, 28);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(`Assinatura facial · ${stamp}`, 8, size - 8);
    setFoto(c.toDataURL("image/jpeg", 0.85));
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  const refazer = () => setFoto(null);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <Camera className="w-8 h-8 text-blue-600 mx-auto mb-1" />
        <h3 className="font-black text-base text-neutral-800">Reconhecimento Facial</h3>
        <p className="text-xs text-neutral-500">Centralize seu rosto e capture uma foto nítida</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{error}</div>}

      <div className="aspect-square bg-black rounded-xl overflow-hidden flex items-center justify-center relative">
        {foto ? (
          <img src={foto} alt="Selfie capturada" className="w-full h-full object-cover" data-testid="img-facial-preview" />
        ) : (
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" data-testid="video-facial" />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="flex gap-2">
        <Button onClick={onBack} variant="outline" className="flex-1 h-12" data-testid="button-step-back">Voltar</Button>
        {foto ? (
          <>
            <Button onClick={refazer} variant="outline" className="flex-1 h-12" data-testid="button-refazer-facial">Refazer</Button>
            <Button onClick={onNext} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12" data-testid="button-step-next">Avançar</Button>
          </>
        ) : (
          <Button onClick={capturar} disabled={!!error} className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold h-12" data-testid="button-capturar-facial">
            <Camera className="w-4 h-4 mr-1" /> Capturar Foto
          </Button>
        )}
      </div>
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

  const start = (e: any) => {
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = getPos(e);
  };
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
    setAssinatura(canvasRef.current!.toDataURL("image/png"));
    onSubmit();
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
