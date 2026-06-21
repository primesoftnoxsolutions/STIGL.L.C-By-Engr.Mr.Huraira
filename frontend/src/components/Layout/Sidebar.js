import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  HomeIcon,
  UsersIcon,
  CircleStackIcon,
  ShoppingCartIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  BanknotesIcon,
  CurrencyDollarIcon,
  CubeIcon,
  ChartBarIcon,
  ArrowRightOnRectangleIcon,
  TruckIcon,
  ShoppingBagIcon,
  ArrowsRightLeftIcon,
  BellAlertIcon,
  ReceiptPercentIcon,
  WalletIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import ConfirmDialog from '../ConfirmDialog';

const Sidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const location = useLocation();
  const { user, isSuperAdmin, isManager, isEmployee, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = useCallback(() => {
    setShowLogoutConfirm(true);
  }, []);

  const confirmLogout = useCallback(() => {
    setShowLogoutConfirm(false);
    logout();
  }, [logout]);

  const canManageCatalog = isManager || isSuperAdmin;
  const matchesPath = useCallback((href) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname === href || location.pathname.startsWith(`${href}/`);
  }, [location.pathname]);

  const registrationNavigation = useMemo(() => [
    { name: 'Product Management', href: '/products', icon: CubeIcon, show: canManageCatalog },
    { name: 'Supplier Management', href: '/suppliers', icon: TruckIcon, show: canManageCatalog },
    { name: 'Purchase Management', href: '/purchases', icon: ShoppingBagIcon, show: true },
    { name: 'Customer Management', href: '/customers', icon: UsersIcon, show: canManageCatalog },
    { name: 'Staff Management', href: '/employees', icon: UsersIcon, show: isSuperAdmin }
  ].filter(item => item.show), [canManageCatalog, isSuperAdmin]);

  const linkNavigation = useMemo(() => [
    { type: 'link', name: 'Dashboard', href: '/', icon: HomeIcon, show: true },
    { type: 'link', name: 'Inventory', href: '/cylinders', icon: CircleStackIcon, show: true },
    { type: 'link', name: 'Transfer/Accept', href: '/stock-transfers', icon: ArrowsRightLeftIcon, show: isSuperAdmin || isManager || isEmployee },
    { type: 'link', name: 'Sales Invoices', href: '/sales', icon: ShoppingCartIcon, show: true },
    { type: 'link', name: 'Quotations', href: '/quotations', icon: DocumentTextIcon, show: !isEmployee },
    { type: 'link', name: 'Customer Item Rates', href: '/customer-item-rates', icon: CurrencyDollarIcon, show: canManageCatalog },
    { type: 'link', name: 'Deposit / Return', href: '/deposits', icon: BanknotesIcon, show: canManageCatalog },
    { type: 'link', name: 'Daily Stock Report', href: '/reports/daily-stock', icon: DocumentTextIcon, show: true },
    { type: 'link', name: 'Reports', href: '/reports', icon: ChartBarIcon, show: true },
    { type: 'link', name: 'Collection', href: '/collections', icon: BanknotesIcon, show: !isEmployee },
    { type: 'link', name: 'Rental Collection', href: '/rentals', icon: ClipboardDocumentListIcon, show: !isEmployee },
    { type: 'link', name: 'Expenses', href: '/expenses', icon: ReceiptPercentIcon, show: true },
    { type: 'link', name: 'Staff Salary', href: '/staff-salary', icon: WalletIcon, show: isSuperAdmin },
    { type: 'link', name: 'Notifications', href: '/notifications', icon: BellAlertIcon, show: true }
  ].filter(item => item.show), [canManageCatalog, isEmployee, isSuperAdmin, isManager]);

  const allNavigableHrefs = useMemo(() => [
    ...registrationNavigation.map(item => item.href),
    ...linkNavigation.map(item => item.href)
  ], [registrationNavigation, linkNavigation]);

  const activeHref = useMemo(() => (
    allNavigableHrefs
      .filter(href => matchesPath(href))
      .sort((a, b) => b.length - a.length)[0] || null
  ), [allNavigableHrefs, matchesPath]);

  const registrationActive = useMemo(
    () => registrationNavigation.some(item => item.href === activeHref),
    [registrationNavigation, activeHref]
  );
  const [registrationOpen, setRegistrationOpen] = useState(registrationActive);

  useEffect(() => {
    if (registrationActive) {
      setRegistrationOpen(true);
    }
  }, [registrationActive]);

  const navigation = useMemo(() => [
    { type: 'link', name: 'Dashboard', href: '/', icon: HomeIcon, show: true },
    {
      type: 'group',
      name: 'Registration',
      icon: ClipboardDocumentListIcon,
      show: registrationNavigation.length > 0,
      children: registrationNavigation
    },
    ...linkNavigation.filter(item => item.name !== 'Dashboard')
  ].filter(item => item.show), [registrationNavigation, linkNavigation]);

  return (
    <>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 sm:w-72 lg:w-64 glass-sidebar transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* User Info */}
          <div className="border-b border-white/10 px-3 py-3 sm:px-4 sm:py-4">
            <div className="flex cursor-pointer items-center glass-card p-2.5 hover-lift sm:p-3">
              <div className="flex-shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold shadow-lg glow-purple sm:h-10 sm:w-10">
                  {user?.fullName?.charAt(0).toUpperCase()}
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-white">{user?.fullName}</p>
                <p className="text-xs text-purple-300 capitalize">Role: {user?.role?.replace('_', ' ')}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5 sm:px-3 sm:py-4 sm:space-y-1">
            {navigation.map((item) => {
              if (item.type === 'group') {
                const isGroupActive = item.children.some(child => child.href === activeHref);
                return (
                  <div key={item.name} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setRegistrationOpen(prev => !prev)}
                      className={`group flex w-full items-center rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-[11px] sm:text-sm font-medium transition-all duration-300 ${
                        isGroupActive
                          ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg glow-purple'
                          : 'text-gray-300 hover:bg-white/10 hover:text-white hover-lift'
                      }`}
                    >
                      <item.icon
                        className={`mr-2 sm:mr-3 flex-shrink-0 h-4 w-4 sm:h-5 sm:w-5 transition-transform duration-300 ${
                          isGroupActive ? 'scale-110' : 'group-hover:scale-110'
                        }`}
                      />
                      <span className="truncate flex-1 text-left">{item.name}</span>
                      {registrationOpen ? (
                        <ChevronDownIcon className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                      )}
                    </button>

                    {registrationOpen && (
                      <div className="ml-3 space-y-0.5 border-l border-white/10 pl-2.5 sm:ml-4 sm:space-y-1 sm:pl-3">
                        {item.children.map((child) => {
                          const isChildActive = child.href === activeHref;
                          return (
                            <Link
                              key={child.name}
                              to={child.href}
                              className={`group flex items-center rounded-lg px-3 py-1.5 text-[11px] sm:py-2 sm:text-sm font-medium transition-all duration-300 ${
                                isChildActive
                                  ? 'bg-white/20 text-white shadow-md'
                                  : 'text-gray-300 hover:bg-white/10 hover:text-white'
                              }`}
                              onClick={() => setSidebarOpen(false)}
                            >
                              <child.icon
                                className={`mr-2 flex-shrink-0 h-4 w-4 transition-transform duration-300 ${
                                  isChildActive ? 'scale-110' : 'group-hover:scale-110'
                                }`}
                              />
                              <span className="truncate">{child.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              const isActive = item.href === activeHref;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-[11px] sm:text-sm font-medium transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg glow-purple'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white hover-lift'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon
                    className={`mr-2 sm:mr-3 flex-shrink-0 h-4 w-4 sm:h-5 sm:w-5 transition-transform duration-300 ${
                      isActive ? 'scale-110' : 'group-hover:scale-110'
                    }`}
                  />
                  <span className="truncate">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Logout Button */}
          <div className="border-t border-white/10 px-3 py-2.5 sm:py-3">
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-4 py-2.5 text-sm font-medium text-white transition-all duration-300 hover:from-red-600 hover:to-red-700 hover:shadow-red-500/30 sm:py-3"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
              Logout
            </button>
          </div>

          {/* Footer */}
          <div className="border-t border-white/10 px-3 py-2.5 sm:px-4 sm:py-3">
            <p className="text-xs text-gray-400 text-center">
              (c) 2026 Cylinder ERP
            </p>
          </div>
        </div>
      </div>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        title="Logout Confirmation"
        message="Are you sure you want to logout? Any unsaved changes will be lost."
        confirmText="Yes, Logout"
        cancelText="Cancel"
        type="warning"
      />
    </>
  );
};

export default memo(Sidebar);

