import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Note } from '../../../types';
import { parseNoteContent } from '../../../utils';

interface NotePreviewCardProps {
  note: Note;
  currentImageIndex: number;
  onImageIndexChange: (index: number) => void;
}

export const NotePreviewCard: React.FC<NotePreviewCardProps> = ({
  note,
  currentImageIndex,
  onImageIndexChange
}) => {
  const allImages = [...(note.images || [])];
  if (note.sketch) allImages.push(note.sketch);

  return (
    <div
      className="fixed top-4 left-4 z-[1000] w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in slide-in-from-left-8 duration-500 ease-out pointer-events-auto flex flex-col"
      style={{ maxHeight: 'calc(100vh - 2rem)' }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="p-4 pb-2 flex items-start justify-between gap-3 border-b border-gray-100 shrink-0">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {note.emoji && (
            <span className="text-2xl mt-0.5 shrink-0">{note.emoji}</span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-gray-900 leading-tight line-clamp-2 break-words">
              {parseNoteContent(note.text || '').title || 'Untitled Note'}
            </h3>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {note.text && (() => {
          const { detail } = parseNoteContent(note.text);
          if (!detail.trim()) return null;
          return (
            <div className="px-4 py-3 text-gray-800 text-sm leading-relaxed break-words border-b border-gray-50 bg-gray-50/30 mapping-preview-markdown">
              <ReactMarkdown>{detail}</ReactMarkdown>
              <style>{`
                .mapping-preview-markdown p { margin-bottom: 0.5rem; }
                .mapping-preview-markdown p:last-child { margin-bottom: 0; }
                .mapping-preview-markdown h1 { font-size: 1.25rem; font-weight: 800; margin: 0.8rem 0 0.4rem; }
                .mapping-preview-markdown h2 { font-size: 1.1rem; font-weight: 700; margin: 0.7rem 0 0.3rem; }
                .mapping-preview-markdown h3 { font-size: 1rem; font-weight: 600; margin: 0.6rem 0 0.2rem; }
                .mapping-preview-markdown ul, .mapping-preview-markdown ol { margin-bottom: 0.5rem; padding-left: 1.2rem; }
                .mapping-preview-markdown li { margin-bottom: 0.2rem; }
                .mapping-preview-markdown blockquote { border-left: 3px solid #e5e7eb; padding-left: 0.8rem; color: #6b7280; font-style: italic; margin: 0.5rem 0; }
                .mapping-preview-markdown code { background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85em; font-family: monospace; }
                .mapping-preview-markdown pre { background: #f9fafb; padding: 0.5rem; border-radius: 6px; overflow-x: auto; margin: 0.5rem 0; border: 1px solid #f3f4f6; }
              `}</style>
            </div>
          );
        })()}

        {allImages.length > 0 && (
          <div className="relative group aspect-[4/3] bg-gray-100 flex items-center justify-center shrink-0">
            <img
              src={allImages[currentImageIndex]}
              alt="Preview"
              className="w-full h-full object-cover"
            />
            {allImages.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onImageIndexChange((currentImageIndex - 1 + allImages.length) % allImages.length);
                  }}
                  className="absolute left-2 p-1.5 bg-black/30 hover:bg-black/50 text-white rounded-full transition-colors backdrop-blur-sm"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onImageIndexChange((currentImageIndex + 1) % allImages.length);
                  }}
                  className="absolute right-2 p-1.5 bg-black/30 hover:bg-black/50 text-white rounded-full transition-colors backdrop-blur-sm"
                >
                  <ChevronRight size={18} />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 px-2 py-1 bg-black/20 backdrop-blur-md rounded-full">
                  {allImages.map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-1 h-1 rounded-full transition-all ${
                        idx === currentImageIndex ? 'bg-white w-2' : 'bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
      `}</style>
    </div>
  );
};
