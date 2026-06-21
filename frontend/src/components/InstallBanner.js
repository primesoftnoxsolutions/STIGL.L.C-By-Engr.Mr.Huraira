import React, { useEffect, useState } from 'react';

const isStandaloneMode = () => {
  if (window.matchMedia) {
    return window.matchMedia('(display-mode: standalone)').matches;
  }
  return window.navigator.standalone === true;
};

const InstallBanner = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandaloneMode()) return;

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setVisible(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setVisible(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-0 right-0 z-50 px-4 print:hidden">
      <div className="mx-auto max-w-2xl glass-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 sm:p-5 shadow-2xl">
        <div>
          <p className="text-sm sm:text-base font-semibold text-gray-900">Install Cylinder ERP</p>
          <p className="text-xs sm:text-sm text-gray-600">
            Add this app to your home screen for a fast, native-like experience.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleInstall}
            className="glass-button-primary px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-white w-full sm:w-auto whitespace-nowrap"
          >
            Install App
          </button>
          <button
            onClick={handleDismiss}
            className="glass-button px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-gray-700 w-full sm:w-auto whitespace-nowrap"
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallBanner;
