import { AlertTriangle } from "lucide-react";

type Props = {
  title?: string;
  message: string;
};

export function ConfigError({ title = "Sistema indisponível", message }: Props) {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-amber-200 p-6 max-w-md w-full text-center shadow-sm">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-amber-600" />
        </div>
        <h1 className="text-lg font-bold text-neutral-900 mb-2">{title}</h1>
        <p className="text-sm text-neutral-600 leading-relaxed">{message}</p>
        <p className="text-xs text-neutral-400 mt-4">
          Se o problema persistir, entre em contato com o suporte técnico.
        </p>
      </div>
    </div>
  );
}
