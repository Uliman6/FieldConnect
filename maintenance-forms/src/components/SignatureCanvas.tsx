import { useState, useRef, useEffect, useCallback } from 'react';

interface SignatureCanvasProps {
  value: string | undefined;
  onChange: (value: string) => void;
  label: string;
}

export default function SignatureCanvas({ value, onChange, label }: SignatureCanvasProps) {
  const [isOpen, setIsOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Initialize canvas when modal opens
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // Set drawing style
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // If there's an existing signature, load it
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = value;
    }
  }, [isOpen, value]);

  // Get coordinates from event (works for both mouse and touch)
  const getCoordinates = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      // Touch event
      const touch = e.touches[0];
      if (!touch) return null;
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    } else {
      // Mouse event
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  }, []);

  // Start drawing
  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  }, [getCoordinates]);

  // Continue drawing
  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;

    const coords = getCoordinates(e);
    if (!coords || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  }, [isDrawing, getCoordinates]);

  // Stop drawing
  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // Clear canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }, []);

  // Save signature
  const saveSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    onChange(dataUrl);
    setIsOpen(false);
  }, [onChange]);

  // Cancel without saving
  const cancelSignature = useCallback(() => {
    setIsOpen(false);
    setHasDrawn(false);
  }, []);

  return (
    <>
      {/* Signature preview/trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center hover:border-blue-400 hover:bg-blue-50 transition-colors"
      >
        {value ? (
          <img
            src={value}
            alt="Signature"
            className="max-h-20 max-w-full object-contain"
          />
        ) : (
          <div className="text-gray-400 text-center">
            <svg
              className="w-8 h-8 mx-auto mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
            <span className="text-sm">İmza için dokunun</span>
          </div>
        )}
      </button>

      {/* Fullscreen signature modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col">
          {/* Header */}
          <div className="bg-gray-800 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={cancelSignature}
              className="text-white hover:text-gray-300 px-3 py-1"
            >
              İptal
            </button>
            <span className="font-medium text-sm truncate mx-2">{label}</span>
            <button
              type="button"
              onClick={clearCanvas}
              className="text-orange-400 hover:text-orange-300 px-3 py-1"
            >
              Temizle
            </button>
          </div>

          {/* Canvas container - takes remaining space */}
          <div className="flex-1 bg-white m-2 rounded-lg overflow-hidden relative">
            {/* Instruction overlay */}
            {!hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-gray-300 text-xl">Buraya imzalayın</p>
              </div>
            )}

            {/* Signature line */}
            <div className="absolute bottom-8 left-8 right-8 border-b-2 border-gray-200 pointer-events-none" />

            <canvas
              ref={canvasRef}
              className="w-full h-full touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              onTouchCancel={stopDrawing}
            />
          </div>

          {/* Footer with save button */}
          <div className="bg-gray-800 px-4 py-3 shrink-0">
            <button
              type="button"
              onClick={saveSignature}
              disabled={!hasDrawn}
              className={`w-full py-3 rounded-lg font-semibold text-lg transition-colors ${
                hasDrawn
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              İmzayı Kaydet
            </button>
          </div>

          {/* Rotate hint for portrait mode */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-white text-xs bg-black bg-opacity-50 px-3 py-1 rounded-full landscape:hidden">
            Yatay çevirin / Rotate for easier signing
          </div>
        </div>
      )}
    </>
  );
}
