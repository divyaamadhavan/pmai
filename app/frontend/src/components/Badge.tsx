import type { SentimentLabel, TicketFlag } from '../types';

type BadgeVariant = 'sentiment' | 'status' | 'flag' | 'theme' | 'role';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  sentiment?: SentimentLabel;
  flag?: TicketFlag;
  className?: string;
}

const sentimentStyles: Record<SentimentLabel, string> = {
  positive: 'text-neon-green border-neon-green/40 bg-neon-green/10',
  neutral:  'text-slate-300 border-slate-500/40 bg-slate-500/10',
  negative: 'text-neon-pink  border-neon-pink/40  bg-neon-pink/10',
};

const flagStyles: Record<TicketFlag, string> = {
  MISSING_AC: 'text-orange-400 border-orange-400/40 bg-orange-400/10',
  TOO_LARGE:  'text-neon-purple border-neon-purple/40 bg-neon-purple/10',
  AMBIGUOUS:  'text-yellow-400 border-yellow-400/40 bg-yellow-400/10',
};

export function Badge({ label, variant = 'theme', sentiment, flag, className = '' }: BadgeProps) {
  let styles = 'text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10';

  if (variant === 'sentiment' && sentiment) {
    styles = sentimentStyles[sentiment];
  } else if (variant === 'flag' && flag) {
    styles = flagStyles[flag];
  } else if (variant === 'status') {
    styles = 'text-slate-300 border-slate-500/40 bg-slate-500/10';
  } else if (variant === 'role') {
    styles = 'text-neon-purple border-neon-purple/40 bg-neon-purple/10';
  }

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles} ${className}`}>
      {label}
    </span>
  );
}
