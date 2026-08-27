interface PipingBoxLogoProps {
  size?: number;
  className?: string;
  /**
   * variant:
   *   'icon'           — solo símbolo cuadrado (size x size)
   *   'horizontal'     — símbolo + wordmark, height=size, width=auto (sidebar/shell interior)
   *   'horizontal-alt' — variante horizontal alternativa
   *   'auth'           — logo horizontal con mayor presencia para auth pages (h=72px)
   *   'header'         — logo de marca para navbar público (h=112px, ×4 del original)
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

  // header variant: logo con presencia de marca para navbar público de la landing.
  // h-28 = 112px = ×4 respecto al h-7 (28px) original.
  // El canvas tiene ~16% de padding transparente → artwork visible ~94px.
  // El header usa py-5 para dar espacio al logo más alto.
  if (variant === 'header') {
    return (
      <img
        src="/assets/logos/logo-horizontal.png"
        alt="PipingBox"
        style={{ width: 'auto' }}
        className={`object-contain h-28 ${className}`}
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
