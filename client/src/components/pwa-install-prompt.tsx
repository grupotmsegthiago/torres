import { useState, useEffect } from "react";
import { X, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as any).standalone === true;
    if (isStandalone) return;

    const dismissed = localStorage.getItem("pwa-prompt-dismissed");
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }

    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(isiOS);

    if (isiOS) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSGuide(false);
    localStorage.setItem("pwa-prompt-dismissed", String(Date.now()));
  };

  if (!showPrompt) return null;

  if (showIOSGuide) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-neutral-200 shadow-2xl p-4 animate-in slide-in-from-bottom duration-300" data-testid="pwa-ios-guide">
        <button onClick={handleDismiss} className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-600" data-testid="btn-dismiss-pwa">
          <X className="h-5 w-5" />
        </button>
        <div className="max-w-md mx-auto">
          <p className="font-semibold text-sm text-neutral-800 mb-3">Como instalar no iPhone/iPad:</p>
          <div className="space-y-2 text-sm text-neutral-600">
            <p>1. Toque no botão <strong>Compartilhar</strong> (ícone de seta para cima) na barra do Safari</p>
            <p>2. Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong></p>
            <p>3. Confirme tocando em <strong>"Adicionar"</strong></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-neutral-200 shadow-2xl p-4 animate-in slide-in-from-bottom duration-300" data-testid="pwa-install-prompt">
      <div className="max-w-md mx-auto flex items-center gap-3">
        <div className="flex-shrink-0 bg-amber-50 rounded-xl p-2.5">
          <Smartphone className="h-6 w-6 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-neutral-800">Instalar Torres VP</p>
          <p className="text-xs text-neutral-500 mt-0.5">Acesse o sistema direto da tela inicial</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={handleDismiss} className="text-neutral-400 hover:text-neutral-600 p-1" data-testid="btn-dismiss-pwa">
            <X className="h-4 w-4" />
          </button>
          <Button size="sm" onClick={handleInstall} className="bg-amber-700 hover:bg-amber-800 text-white gap-1.5" data-testid="btn-install-pwa">
            <Download className="h-3.5 w-3.5" />
            Instalar
          </Button>
        </div>
      </div>
    </div>
  );
}
