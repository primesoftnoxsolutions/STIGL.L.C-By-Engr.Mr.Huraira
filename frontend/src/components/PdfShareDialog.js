import React from 'react';
import {
  XMarkIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline';

const PdfShareDialog = ({ shareData, onClose }) => {
  if (!shareData) return null;

  const shareWithNativeShare = async (label) => {
    if (!shareData.file || !navigator?.share || !navigator?.canShare) {
      return false;
    }

    try {
      if (!navigator.canShare({ files: [shareData.file] })) {
        return false;
      }

      await navigator.share({
        files: [shareData.file],
        title: shareData.title,
        text: shareData.text
      });
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') {
        return true;
      }
      console.error(`[PDF Share] ${label} share failed:`, error);
      return false;
    }
  };

  const handleWhatsAppShare = async () => {
    const shared = await shareWithNativeShare('WhatsApp');
    if (shared) return;

    const message = shareData.whatsappMessage
      || `${shareData.title} is ready. The PDF has already been downloaded as ${shareData.filename}. Please attach it from your device.`;

    window.open(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleEmailShare = async () => {
    const shared = await shareWithNativeShare('Email');
    if (shared) return;

    const subject = shareData.emailSubject || shareData.title;
    const body = shareData.emailBody
      || `${shareData.title} is ready.\n\nThe PDF has already been downloaded as ${shareData.filename}. Please attach that file before sending.`;

    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Share PDF</h3>
            <p className="mt-1 text-sm text-gray-600">
              PDF download ho chuki hai. Ab aap WhatsApp ya email share kar sakte hain.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700"
          >
            <ChatBubbleLeftRightIcon className="h-5 w-5" />
            Share on WhatsApp
          </button>
          <button
            type="button"
            onClick={handleEmailShare}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <EnvelopeIcon className="h-5 w-5" />
            Share via Email
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Agar browser attachment directly share na kare to downloaded PDF file manually attach kar dein.
        </p>
      </div>
    </div>
  );
};

export default PdfShareDialog;
