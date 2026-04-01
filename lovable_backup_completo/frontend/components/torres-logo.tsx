interface TorresLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  color?: string;
  invertColor?: string;
}

export function TorresLogoIcon({ size = 40, className = "", color = "#1a1a1a" }: { size?: number; className?: string; color?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 300 380"
      width={size}
      height={size * (380 / 300)}
      className={className}
      fill="none"
    >
      <g fill={color}>
        <rect x="98" y="0" width="22" height="32" rx="1" />
        <rect x="139" y="0" width="22" height="32" rx="1" />
        <rect x="180" y="0" width="22" height="32" rx="1" />
        <rect x="86" y="24" width="128" height="20" rx="1" />
        <path d="M50 40 L250 40 L250 240 Q250 310 150 370 Q50 310 50 240 Z" />
        <path d="M68 160 L232 160 L232 235 Q232 298 150 350 Q68 298 68 235 Z" fill="white" />
        <polygon points="150,210 82,160 88,150 150,196 212,150 218,160" />
        <polygon points="150,260 98,215 104,205 150,246 196,205 202,215" />
        <polygon points="150,305 115,270 121,260 150,286 179,260 185,270" />
      </g>
    </svg>
  );
}

export function TorresLogo({ size = 120, className = "", showText = true, color = "#1a1a1a" }: TorresLogoProps) {
  const iconH = size;
  const totalW = size;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <TorresLogoIcon size={totalW} color={color} />
      {showText && (
        <div className="flex flex-col items-center mt-2" style={{ color }}>
          <span
            className="font-black tracking-wider"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: size * 0.28,
              lineHeight: 1.1,
              letterSpacing: "0.06em",
            }}
          >
            TORRES
          </span>
          <span
            className="font-medium tracking-widest"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: size * 0.1,
              lineHeight: 1.4,
              letterSpacing: "0.12em",
            }}
          >
            VIGILÂNCIA PATRIMONIAL
          </span>
        </div>
      )}
    </div>
  );
}

export function TorresLogoInverted({ size = 40, className = "" }: { size?: number; className?: string }) {
  return <TorresLogoIcon size={size} className={className} color="white" />;
}
