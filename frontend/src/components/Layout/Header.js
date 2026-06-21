import React, { memo } from 'react';
import { Bars3Icon } from '@heroicons/react/24/outline';

const MOBILE_COMPANY_NAME = 'SYED TAYYAB INDUSTRIAL GASES LLC';

const Header = ({ setSidebarOpen }) => {
  return (
    <header className="lg:hidden glass-card mx-1.5 sm:mx-4 mt-1.5 sm:mt-4 mb-0 overflow-hidden">
      <div className="flex items-center px-3 sm:px-6 py-2.5 sm:py-4">
        <button
          type="button"
          className="text-gray-700 hover:text-purple-600 transition-colors glass-button p-2"
          onClick={() => setSidebarOpen(true)}
        >
          <Bars3Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>

        <div className="ml-2.5 min-w-0 flex-1 text-right sm:ml-3">
          <p className="truncate text-[14px] sm:text-sm font-bold uppercase tracking-[0.05em] text-purple-700">
            {MOBILE_COMPANY_NAME}
          </p>
        </div>
      </div>
    </header>
  );
};

export default memo(Header);
