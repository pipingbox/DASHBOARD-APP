interface PipingBoxLogoProps {
  size?: number;
  className?: string;
  /**
   * variant:
   *   'icon'           — solo símbolo cuadrado (size x size)
   *   'horizontal'     — símbolo + wordmark, height=size, width=auto (sidebar/shell interior)
   *   'horizontal-alt' — variante horizontal alternativa
   *   'auth'           — logo horizontal con mayor presencia para auth pages (h=72px)
   *   'header'         — logo horizontal compacto para navbar público (h=28px fijo)
   */
  variant?: 'icon' | 'horizontal' | 'horizontal-alt' | 'auth' | 'header';
}

export function PipingBoxLogo({ size = 48, className = '', variant = 'icon' }: PipingBoxLogoProps) {
  // auth variant: gran presencia, alineado a la izquierda, glow naranja suave
  if (variant === 'auth') {
    return (
      <div className={`flex items-center justify-start ${className}`}>
        <img
          src="/assets/logos/logo-horizontal.png"
          alt="PipingBox"
          height={72}
          style={{ height: 72, width: 'auto' }}
          className="object-contain drop-shadow-[0_0_24px_rgba(245,158,11,0.18)]"
        />
      </div>
    );
  }

  // header variant: compacto y proporcional para navbar público
  if (variant === 'header') {
    return (
      <img
        src="/assets/logos/logo-horizontal.png"
        alt="PipingBox"
        height={28}
        style={{ height: 28, width: 'auto' }}
        className={`object-contain ${className}`}
      />
    );
  }

  const src =
    variant === 'icon'
      ? '/assets/logos/logo-icon.png'
      : variant === 'horizontal-alt'
      ? '/assets/logos/logo-horizontal-alt.png'
      : '/assets/logos/logo-horizontal.png';

  if (variant === 'icon') {
    return (
      <img
        src={src}
        alt="PipingBox"
        width={size}
        height={size}
        className={`object-contain ${className}`}
      />
    );
  }

  // Horizontal logos are wider than tall, use height as reference
  return (
    <img
      src={src}
      alt="PipingBox"
      height={size}
      style={{ height: size, width: 'auto' }}
      className={`object-contain ${className}`}
    />
  );
}
