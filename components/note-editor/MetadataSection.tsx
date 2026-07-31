import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface MetadataSectionProps {
  id?: string;
  createdAt?: number;
  defaultOpen?: boolean;
}

/** Metadata：identity / lifecycle；coords 等不放此处 */
export const MetadataSection: React.FC<MetadataSectionProps> = ({
  id,
  createdAt,
  defaultOpen = false
}) => {
  const [open, setOpen] = useState(defaultOpen);
  if (!id && createdAt == null) return null;

  return (
    <section className="shrink-0 border-t border-gray-100/80" aria-label="元信息">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-full px-4 py-2 flex items-center gap-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wide hover:bg-black/[0.03] border-0 bg-transparent cursor-pointer"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        元信息
      </button>
      {open ? (
        <div className="px-4 pb-3 space-y-1.5 text-xs text-gray-500 font-mono">
          {id ? (
            <div className="flex gap-2 min-w-0">
              <span className="text-gray-400 shrink-0 not-italic font-sans">ID</span>
              <span className="truncate" title={id}>
                {id}
              </span>
            </div>
          ) : null}
          {createdAt != null ? (
            <div className="flex gap-2 min-w-0">
              <span className="text-gray-400 shrink-0 not-italic font-sans">Created</span>
              <span>{new Date(createdAt).toLocaleString()}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
