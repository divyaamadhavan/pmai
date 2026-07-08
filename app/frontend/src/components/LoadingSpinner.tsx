interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  return (
    <div
      className={`animate-spin rounded-full border-2 ${sizeMap[size]} ${className}`}
      style={{
        borderColor: 'rgba(0,212,255,0.2)',
        borderTopColor: '#00d4ff',
        boxShadow: '0 0 12px rgba(0,212,255,0.5)',
      }}
      role="status"
      aria-label="Loading"
    />
  );
}
