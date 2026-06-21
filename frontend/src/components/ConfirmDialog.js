import React, { memo } from 'react';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

const ConfirmDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  type = "warning" // warning, danger, info
}) => {
  if (!isOpen) return null;

  const typeStyles = {
    warning: {
      icon: 'bg-gradient-to-br from-yellow-500 to-orange-600',
      button: 'bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700',
      border: 'border-yellow-500/50',
      glow: 'shadow-yellow-500/20'
    },
    danger: {
      icon: 'bg-gradient-to-br from-red-500 to-pink-600',
      button: 'bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700',
      border: 'border-red-500/50',
      glow: 'shadow-red-500/20'
    },
    info: {
      icon: 'bg-gradient-to-br from-blue-500 to-purple-600',
      button: 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700',
      border: 'border-blue-500/50',
      glow: 'shadow-blue-500/20'
    }
  };

  const styles = typeStyles[type] || typeStyles.warning;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      {/* Backdrop with blur */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div 
          className="relative glass-modal max-w-md w-full p-6 sm:p-8 shadow-2xl transform transition-all duration-300 scale-100 animate-fadeIn"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>

          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className={`${styles.icon} ${styles.glow} p-4 rounded-2xl shadow-xl animate-pulse`}>
              <ExclamationTriangleIcon className="h-8 w-8 text-white" />
            </div>
          </div>

          {/* Title */}
          <h3 className="text-xl sm:text-2xl font-bold text-center text-gray-900 mb-3">
            {title}
          </h3>

          {/* Message */}
          <p className="text-sm sm:text-base text-center text-gray-600 mb-6 sm:mb-8 leading-relaxed">
            {message}
          </p>

          {/* Action Buttons */}
          <div className={`flex flex-col sm:flex-row gap-3 sm:gap-4 ${!cancelText ? 'justify-center' : ''}`}>
            {cancelText && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 border-2 border-gray-300 rounded-xl text-sm sm:text-base font-semibold text-gray-700 hover:bg-gray-50 transition-all duration-200 hover:scale-105"
              >
                {cancelText}
              </button>
            )}
            <button
              type="button"
              onClick={onConfirm}
              className={`${cancelText ? 'flex-1' : 'w-full'} px-4 sm:px-6 py-2.5 sm:py-3 ${styles.button} rounded-xl text-sm sm:text-base font-semibold text-white transition-all duration-200 hover:scale-105 shadow-lg ${styles.glow}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}} />
    </div>
  );
};

export default memo(ConfirmDialog);
