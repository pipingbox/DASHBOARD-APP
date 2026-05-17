interface PipingBoxLogoProps {
  size?: number;
  className?: string;
  variant?: 'icon' | 'horizontal' | 'horizontal-alt';
}

export function PipingBoxLogo({ size = 48, className = '', variant = 'icon' }: PipingBoxLogoProps) {
  const src = variant === 'icon'
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