
import React, { useRef, useState, useEffect } from 'react';
import { Eraser, Pencil, Trash2, Check, X } from 'lucide-react';

interface DrawingCanvasProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  initialData?: string;
  backgroundColor?: string;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ onSave, onCancel, initialData, backgroundColor = '#ffffff' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [mode, setMode] = useState<'draw' | 'erase'>('draw');

  // Initialize and Resize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const { width, height } = container.getBoundingClientRect();
      
      if (width === 0 || height === 0) return;

      // Check if size actually changed to avoid unnecessary redraws
      if (canvas.width === width && canvas.height === height) return;

      // Save content
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx && canvas.width > 0 && canvas.height > 0) {
          tempCtx.drawImage(canvas, 0, 0);
      }

      // Resize
      canvas.width = width;
      canvas.height = height;

      // Restore
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          // Fill background
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, width, height);
          
          if (tempCtx && tempCanvas.width > 0) {
              ctx.drawImage(tempCanvas, 0, 0);
          }
      }
    };

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);
    
    // Initial resize
    resizeCanvas();

    return () => observer.disconnect();
  }, [backgroundColor]);

  // Load Initial Data
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && initialData) {
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = initialData;
      img.onload = () => {
        if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      };
    }
  }, [initialData]);

  const getPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    setIsDrawing(true);
    canvas.setPointerCapture(e.pointerId);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset context properties to ensure they are correct
    ctx.strokeStyle = mode === 'erase' ? backgroundColor : color;
    ctx.lineWidth = mode === 'erase' ? 20 : 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const { x, y } = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    const { x, y } = getPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isDrawing) {
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.releasePointerCapture(e.pointerId);
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.beginPath(); // Close path
        }
    }
  };

  const handleDone = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (canvasRef.current) {
          onSave(canvasRef.current.toDataURL());
      }
  };

  const clearCanvas = (e: React.MouseEvent) => {
      e.stopPropagation();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none cursor-crosshair relative z-0"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={endDrawing}
        // Remove onPointerLeave to prevent accidental stops near edges, relying on setPointerCapture
      />

      {/* Floating Toolbar */}
      <div 
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white/95 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-gray-100"
        onPointerDown={(e) => e.stopPropagation()}
      >
         <button onClick={(e) => { e.stopPropagation(); onCancel(); }} className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors">
            <X size={20} />
         </button>

         <div className="w-px h-6 bg-gray-200"></div>

         <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setMode('draw')}
              className={`p-1.5 rounded-md transition-all ${mode === 'draw' ? 'bg-white text-yellow-600 shadow-sm' : 'text-gray-400'}`}
            >
              <Pencil size={18} />
            </button>
            <button
              onClick={() => setMode('erase')}
              className={`p-1.5 rounded-md transition-all ${mode === 'erase' ? 'bg-white text-yellow-600 shadow-sm' : 'text-gray-400'}`}
            >
              <Eraser size={18} />
            </button>
         </div>

         <div className="flex gap-1.5">
            {['#000000', '#EF4444', '#F59E0B', '#10B981', '#3B82F6'].map(c => (
                <button
                    key={c}
                    onClick={() => { setColor(c); setMode('draw'); }}
                    className={`w-5 h-5 rounded-full border border-black/10 transition-transform ${color === c && mode === 'draw' ? 'scale-125 ring-1 ring-gray-400' : ''}`}
                    style={{ backgroundColor: c }}
                />
            ))}
         </div>

         <div className="w-px h-6 bg-gray-200"></div>

         <button onClick={handleDone} className="p-2 bg-yellow-400 text-yellow-950 rounded-full hover:bg-yellow-300 shadow-sm active:scale-95 transition-all">
            <Check size={20} />
         </button>
      </div>

      {/* Tipping Trash Can Clear Button - Moved to Top Left */}
      <button 
        onClick={clearCanvas}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-4 left-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-50 group"
        title="Clear"
      >
        <div className="group-hover:rotate-12 transition-transform duration-300 origin-bottom-right">
             <div className="rotate-45">
                <Trash2 size={24} />
             </div>
        </div>
      </button>
    </div>
  );
};
