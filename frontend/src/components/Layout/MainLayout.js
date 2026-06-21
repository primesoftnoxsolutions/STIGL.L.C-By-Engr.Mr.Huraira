import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isDashboard = location.pathname === '/';
  const layoutClass = `flex h-screen max-w-full overflow-x-hidden${
    isDashboard ? ' bg-[#f8f9fb]' : ' bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50'
  }`;
  const contentShellClass = `flex-1 min-w-0 flex flex-col overflow-hidden${
    isDashboard ? ' dashboard-shell' : ' theme-azure'
  }`;
  const mainClass = isDashboard
    ? 'dashboard-main hide-scrollbar flex-1 w-full overflow-y-auto overflow-x-hidden'
    : 'hide-scrollbar flex-1 w-full overflow-y-auto overflow-x-hidden p-1.5 sm:p-3 md:p-4 lg:p-4 theme-azure-main';

  return (
    <div className={layoutClass}>
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      
      <div className={contentShellClass}>
        <Header setSidebarOpen={setSidebarOpen} />
        
        <main className={mainClass}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
