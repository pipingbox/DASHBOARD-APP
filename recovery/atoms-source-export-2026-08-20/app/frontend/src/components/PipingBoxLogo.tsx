interface PipingBoxLogoProps {
  width?: number;
  className?: string;
  /** @deprecated Use width instead */
  size?: number;
}

export function PipingBoxLogo({ width = 170, size, className = '' }: PipingBoxLogoProps) {
  const finalWidth = size ?? width;

  return (
    <img
      src="/assets/pipingbox-logo-horizontal.png"
      alt="PipingBox"
      style={{ width: finalWidth, height: 'auto', objectFit: 'contain' }}
      className={`object-contain ${className}`}
    />
  );
}