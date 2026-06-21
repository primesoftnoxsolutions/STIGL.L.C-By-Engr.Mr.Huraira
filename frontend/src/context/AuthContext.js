import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const AuthContext = createContext();
const AUTH_BOOT_TIMEOUT_MS = Number(process.env.REACT_APP_AUTH_TIMEOUT_MS || 8000);

const shouldDebugAuth = () => {
  if (process.env.REACT_APP_AUTH_DEBUG === 'true') return true;
  try {
    return window.localStorage?.getItem('debug_auth') === '1';
  } catch {
    return false;
  }
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authTimeout, setAuthTimeout] = useState(false);

  const logout = useCallback((options = {}) => {
    const { silent = false } = options;
    if (shouldDebugAuth()) {
      console.debug('[auth] logout called', { silent });
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    if (!silent) {
      toast.success('Logged out successfully');
    }
  }, []);

  useEffect(() => {
    // Check if user is logged in
    let isMounted = true;
    let didTimeout = false;
    setAuthTimeout(false);
    const timeoutId = setTimeout(() => {
      if (!isMounted) return;
      didTimeout = true;
      setAuthTimeout(true);
      setLoading(false);
      if (shouldDebugAuth()) {
        console.warn('[auth] init timed out');
      }
      toast.error('Connection timed out. Please check the backend and refresh.');
    }, AUTH_BOOT_TIMEOUT_MS);

    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (shouldDebugAuth()) {
      console.debug('[auth] init', {
        hasToken: Boolean(token),
        hasSavedUser: Boolean(savedUser),
        path: window.location?.pathname
      });
    }

    let parsedUser = null;
    if (savedUser) {
      try {
        parsedUser = JSON.parse(savedUser);
        if (parsedUser) {
          if (shouldDebugAuth()) {
            console.debug('[auth] loaded user from storage', { id: parsedUser?.id, role: parsedUser?.role });
          }
          setUser(parsedUser);
        }
      } catch (error) {
        localStorage.removeItem('user');
        if (shouldDebugAuth()) {
          console.warn('[auth] failed to parse stored user, cleared');
        }
      }
    }

    if (!token) {
      if (savedUser) {
        localStorage.removeItem('user');
      }
      setUser(null);
      clearTimeout(timeoutId);
      if (isMounted) {
        setLoading(false);
      }
      if (shouldDebugAuth()) {
        console.debug('[auth] no token, done loading');
      }
      return;
    }

    if (parsedUser) {
      // Allow UI to render immediately using cached user, verify in background.
      clearTimeout(timeoutId);
      if (isMounted) {
        setLoading(false);
      }
    } else if (token) {
      // Do not block public routes (e.g. login) while token verification runs.
      clearTimeout(timeoutId);
      if (isMounted) {
        setLoading(false);
      }
    }

    // Verify token is still valid (even if saved user is missing)
    if (shouldDebugAuth()) {
      console.debug('[auth] verifying token via /auth/me');
    }
    api.get('/auth/me')
      .then(res => {
        if (shouldDebugAuth()) {
          console.debug('[auth] /auth/me success', { id: res?.data?.data?.id, role: res?.data?.data?.role });
        }
        setUser(res.data.data);
        localStorage.setItem('user', JSON.stringify(res.data.data));
        if (isMounted) {
          setAuthTimeout(false);
        }
      })
      .catch((error) => {
        if (shouldDebugAuth()) {
          console.warn('[auth] /auth/me failed', {
            status: error?.response?.status,
            message: error?.response?.data?.message || error?.message
          });
        }
        if (error.response?.status === 401) {
          logout({ silent: true });
        }
      })
      .finally(() => {
        if (!isMounted || didTimeout) return;
        clearTimeout(timeoutId);
        if (!parsedUser) {
          setLoading(false);
          if (shouldDebugAuth()) {
            console.debug('[auth] init finished, loading=false');
          }
        }
      });
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [logout]);

  const login = useCallback(async (email, password, role) => {
    try {
      if (shouldDebugAuth()) {
        console.debug('[auth] login attempt', { email, role });
      }
      const identifier = (email || '').trim();
      const response = await api.post('/auth/login', {
        identifier,
        email: identifier,
        username: identifier,
        emailOrUsername: identifier,
        password,
        role,
        userType: role
      });
      const { token, data } = response.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(data));
      setUser(data);
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      
      toast.success('Logged in successfully');
      if (shouldDebugAuth()) {
        console.debug('[auth] login success', { id: data?.id, role: data?.role });
      }
      return { success: true };
    } catch (error) {
      let message = error.response?.data?.message;
      if (!message) {
        if (error.code === 'ECONNABORTED') {
          message = 'Login request timed out. Please check backend connectivity and try again.';
        } else if (error.message === 'Network Error') {
          message = 'Unable to reach backend API. Please verify backend is running.';
        } else {
          message = error.message || 'Login failed';
        }
      }
      if (shouldDebugAuth()) {
        console.warn('[auth] login failed', {
          status: error?.response?.status,
          code: error?.code,
          url: error?.config?.url,
          baseURL: error?.config?.baseURL,
          message
        });
      }
      toast.error(message);
      return { success: false, message };
    }
  }, []);

  useEffect(() => {
    const handleLogout = () => logout({ silent: true });
    if (typeof window !== 'undefined') {
      window.addEventListener('auth:logout', handleLogout);
      return () => window.removeEventListener('auth:logout', handleLogout);
    }
    return undefined;
  }, [logout]);

  const updateSignature = useCallback(async (signature) => {
    try {
      const response = await api.put('/auth/signature', { signature });
      const nextSignature = response.data.data.signature;
      setUser((previousUser) => {
        const updatedUser = { ...(previousUser || {}), signature: nextSignature };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        return updatedUser;
      });
      toast.success('Signature updated successfully');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to update signature';
      toast.error(message);
      return { success: false, message };
    }
  }, []);

  const hasPermission = useCallback((requiredRole) => {
    if (!user) return false;

    const normalizedUserRole = user.role === 'admin' ? 'manager' : user.role;
    const normalizedRequiredRole = requiredRole === 'admin' ? 'manager' : requiredRole;

    const roleHierarchy = {
      super_admin: 3,
      manager: 2,
      employee: 1
    };

    return (roleHierarchy[normalizedUserRole] || 0) >= (roleHierarchy[normalizedRequiredRole] || 0);
  }, [user]);

  const value = useMemo(() => ({
    user,
    loading,
    authTimeout,
    login,
    logout,
    updateSignature,
    hasPermission,
    isSuperAdmin: user?.role === 'super_admin',
    isManager: user?.role === 'manager',
    isEmployee: user?.role === 'employee'
  }), [user, loading, authTimeout, login, logout, updateSignature, hasPermission]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
