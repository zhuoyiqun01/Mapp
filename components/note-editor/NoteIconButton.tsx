import React from 'react';

type NoteIconButtonVariant = 'neutral' | 'primary' | 'danger' | 'success';

interface NoteIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: NoteIconButtonVariant;
  themeColor?: string;
  active?: boolean;
  children: React.ReactNode;
}

const baseClasses =
  'rounded-full p-1.5 transition-colors active:scale-90 inline-flex items-center justify-center';

const variantClasses: Record<NoteIconButtonVariant, string> = {
  neutral: 'text-gray-400 hover:text-gray-600 hover:bg-black/5',
  primary: 'text-white',
  danger: 'text-red-400 hover:text-red-600 hover:bg-red-50',
  success: 'text-green-400 hover:text-green-600 hover:bg-green-50',
};

export const NoteIconButton: React.FC<NoteIconButtonProps> = ({
  variant = 'neutral',
  themeColor,
  active = false,
  className = '',
  style,
  children,
  ...rest
}) => {
  const isPrimary = variant === 'primary';

  const mergedStyle: React.CSSProperties = {
    ...(style || {}),
    ...(isPrimary && active && themeColor
      ? { backgroundColor: themeColor }
      : {}),
  };

  const classes = [
    baseClasses,
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} style={mergedStyle} {...rest}>
      {children}
    </button>
  );
};

