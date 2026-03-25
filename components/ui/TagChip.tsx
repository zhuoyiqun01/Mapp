import React from 'react';

interface TagChipProps {
  label: string;
  color: string;
  onRemove?: () => void;
  className?: string;
}

export const TagChip: React.FC<TagChipProps> = ({
  label,
  color,
  onRemove,
  className = '',
}) => {
  const classes = [
    'flex-shrink-0 h-6 px-2.5 rounded-full text-xs font-bold text-white shadow-sm',
    'flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      style={{ backgroundColor: color }}
      onClick={onRemove ? undefined : undefined}
    >
      {label}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      )}
    </span>
  );
};

