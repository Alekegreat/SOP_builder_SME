interface LoadingSpinnerProps {
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingSpinner({ fullScreen, size = 'md' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const spinner = (
    <div
      className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-tg-hint border-t-tg-button`}
    />
  );

  if (fullScreen) {
    return <div className="flex items-center justify-center min-h-screen">{spinner}</div>;
  }

  return <div className="flex items-center justify-center p-4">{spinner}</div>;
}
