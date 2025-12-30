import React, { useRef, useEffect } from 'react';

interface SearchBarContainerProps {
  children: React.ReactNode;
}

export const SearchBarContainer: React.FC<SearchBarContainerProps> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleCaptureStart = (e: Event) => {
      // Stop event from reaching map container in capture phase
      e.stopPropagation();
    };

    // Use capture phase to intercept events before they reach map container
    // Mark as passive since we only call stopPropagation(), not preventDefault()
    container.addEventListener('mousedown', handleCaptureStart, { capture: true, passive: true });
    container.addEventListener('touchstart', handleCaptureStart, { capture: true, passive: true });
    container.addEventListener('pointerdown', handleCaptureStart, { capture: true, passive: true });

    return () => {
      container.removeEventListener('mousedown', handleCaptureStart, { capture: true });
      container.removeEventListener('touchstart', handleCaptureStart, { capture: true });
      container.removeEventListener('pointerdown', handleCaptureStart, { capture: true });
    };
  }, []);

  return <div ref={containerRef}>{children}</div>;
};
