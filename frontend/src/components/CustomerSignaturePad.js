import React, { useRef, useState, useEffect } from 'react';
import { XMarkIcon, ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { createPortal } from 'react-dom';

const CustomerSignaturePad = ({ onSave, onClose, buttonLabel = 'Confirm Signature' }) => {
  const canvasRef = useRef(null);
  const errorTimeoutRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [errors, setErrors] = useState({ name: false, signature: false });
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000';
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  const startDrawing = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setIsEmpty(false);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const saveSignature = () => {
    const nameEmpty = !customerName || customerName.trim() === '';
    const signatureEmpty = isEmpty;
    
    setErrors({ name: nameEmpty, signature: signatureEmpty });
    
    if (nameEmpty || signatureEmpty) {
      setShowError(true);
      // Auto-hide error after 5 seconds
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = setTimeout(() => {
        setShowError(false);
        errorTimeoutRef.current = null;
      }, 5000);
      return;
    }
    
    const canvas = canvasRef.current;
    const signatureData = canvas.toDataURL('image/png');
    
    try {
      onSave(signatureData, customerName.trim());
    } catch (err) {
      console.error('[SignaturePad] Error in onSave callback:', err);
    }
  };
  
  const handleCancel = () => {
    try {
      onClose();
    } catch (err) {
      console.error('[SignaturePad] Error in onClose callback:', err);
    }
  };

  // Clear error when user starts typing or drawing
  const handleNameChange = (e) => {
    setCustomerName(e.target.value);
    if (e.target.value.trim()) {
      setErrors(prev => ({ ...prev, name: false }));
    }
  };

  const handleStartDrawing = (e) => {
    startDrawing(e);
    setErrors(prev => ({ ...prev, signature: false }));
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] overflow-hidden">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancel} />
      
      {/* Modal */}
      <div className="flex h-screen items-center justify-center px-3 py-3 sm:px-4 sm:py-4">
        <div
          className="relative bg-white rounded-xl max-w-xl w-full p-4 sm:p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={handleCancel}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100 z-10"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>

          {/* Title */}
          <div className="mb-3">
            <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
              Customer Signature Required
            </h3>
            <p className="text-xs sm:text-sm text-gray-600">
              Please enter the customer's name and collect their signature to confirm receipt of goods/services.
            </p>
          </div>

          {/* Error Alert */}
          {showError && (errors.name || errors.signature) && (
            <div className="mb-3">
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <div className="flex items-start gap-2">
                  <ExclamationCircleIcon className="h-5 w-5 text-red-500 mt-0.5" />
                  <div className="flex-1 text-sm text-red-700">
                    {errors.name && <div>Please enter the customer name.</div>}
                    {errors.signature && <div>Please provide customer signature.</div>}
                  </div>
                  <button onClick={() => setShowError(false)} className="text-red-400 hover:text-red-600 transition-colors">
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Customer Name Input */}
          <div className="mb-3">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Received By (Customer Name) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={customerName}
                onChange={handleNameChange}
                placeholder="Enter customer name"
                className={`block w-full px-3 py-2.5 border-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 text-base transition-all ${
                  errors.name 
                    ? 'border-red-400 bg-red-50 focus:ring-red-500 focus:border-red-500' 
                    : customerName.trim() 
                      ? 'border-green-400 bg-green-50 focus:ring-green-500 focus:border-green-500'
                      : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
                autoFocus
              />
              {customerName.trim() && !errors.name && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <CheckCircleIcon className="h-5 w-5 text-green-500" />
                </div>
              )}
              {errors.name && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
                </div>
              )}
            </div>
            {errors.name && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <ExclamationCircleIcon className="h-4 w-4" />
                Customer name is required
              </p>
            )}
          </div>

          {/* Instructions */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Customer Signature <span className="text-red-500">*</span>
              </p>
              <p className="text-xs text-gray-500">
                Sign using your finger (touch) or mouse in the box below
              </p>
            </div>
            {!isEmpty && !errors.signature && (
              <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                <CheckCircleIcon className="h-4 w-4" />
                Signed
              </span>
            )}
          </div>

          {/* Canvas */}
          <div className={`border-2 border-dashed rounded-lg overflow-hidden mb-6 transition-all ${
            errors.signature 
              ? 'border-red-400 bg-red-50' 
              : !isEmpty 
                ? 'border-green-400 bg-green-50'
                : 'border-blue-300 bg-blue-50'
          }`}>
            <canvas
              ref={canvasRef}
              className="signature-canvas w-full h-36 sm:h-44 touch-none cursor-crosshair bg-white"
              onMouseDown={handleStartDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={handleStartDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>
          {errors.signature && (
            <p className="mb-2 -mt-3 text-xs text-red-600 flex items-center gap-1">
              <ExclamationCircleIcon className="h-4 w-4" />
              Customer signature is required
            </p>
          )}

          {/* Important Notice */}
          <div className="mb-3 p-2 bg-yellow-50 border-l-4 border-yellow-400 rounded">
            <p className="text-xs text-yellow-800">
              <strong>Important:</strong> Both customer name and signature are mandatory. 
              The invoice cannot be saved without completing both fields.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={clearSignature}
              className="px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
            >
              Clear Signature
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveSignature}
              className="px-3 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg text-sm font-semibold text-white transition-all shadow-lg"
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
};

export default CustomerSignaturePad;
