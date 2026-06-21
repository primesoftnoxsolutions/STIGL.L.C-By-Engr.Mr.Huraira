import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const BootLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 px-4">
    <div className="rounded-2xl border border-slate-200 bg-white/90 px-5 py-3 text-sm font-medium text-slate-600 shadow-sm">
      Loading session...
    </div>
  </div>
);

const PrivateRoute = ({ children, requiredRole }) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return <BootLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && !hasPermission(requiredRole)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">403</h1>
          <p className="text-xl text-gray-600">Access Denied</p>
          <p className="text-gray-500 mt-2">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return children;
};

export default PrivateRoute;
