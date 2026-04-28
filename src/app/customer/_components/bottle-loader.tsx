import { Wine } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Spinning-bottle loader that mirrors the legacy GAS customer page
 * (counter-rotating rings + pulsing bottle + scan line + sparkles).
 * The animation styles live in `customer-theme.css` under `.bottle-loader`.
 */
export function BottleLoader({
  size = 'md',
  label,
  className,
}: {
  size?: 'sm' | 'md';
  /** Optional caption rendered below the loader. The trailing dots
   *  animate via CSS so callers don't need to handle them. */
  label?: string;
  className?: string;
}) {
  const iconSize = size === 'sm' ? 36 : 48;
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2', className)}>
      <div className={cn('bottle-loader', size === 'sm' && 'is-sm')}>
        <div className="bottle-loader__ring" />
        <div className="bottle-loader__ring-outer" />
        <Wine className="bottle-loader__icon" size={iconSize} strokeWidth={1.5} />
        <div className="bottle-loader__scan" />
        <span className="bottle-loader__sparkle" />
        <span className="bottle-loader__sparkle" />
        <span className="bottle-loader__sparkle" />
        <span className="bottle-loader__sparkle" />
      </div>
      {label && (
        <p className="bottle-loader__text">
          {label}
          <span className="bottle-loader__dots" />
        </p>
      )}
    </div>
  );
}
