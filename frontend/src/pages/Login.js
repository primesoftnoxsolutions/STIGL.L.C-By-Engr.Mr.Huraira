import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  LockClosedIcon,
  EnvelopeIcon,
  BeakerIcon,
  TruckIcon,
  CircleStackIcon,
  ChevronDownIcon,
  ShieldCheckIcon,
  BriefcaseIcon,
  UserIcon,
  CheckIcon
} from '@heroicons/react/24/outline';

const ROLE_OPTIONS = [
  {
    value: 'super_admin',
    label: 'Super Administrator',
    description: 'Full system access and control',
    icon: ShieldCheckIcon,
    accent: 'from-violet-500 to-indigo-600',
    ring: 'ring-violet-200'
  },
  {
    value: 'manager',
    label: 'Manager',
    description: 'Operations, stock and team oversight',
    icon: BriefcaseIcon,
    accent: 'from-blue-500 to-cyan-600',
    ring: 'ring-blue-200'
  },
  {
    value: 'employee',
    label: 'Employee',
    description: 'Field sales and assigned stock tasks',
    icon: UserIcon,
    accent: 'from-emerald-500 to-teal-600',
    ring: 'ring-emerald-200'
  }
];

const RoleTypeSelect = ({ value, onChange, onOpenChange }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = ROLE_OPTIONS.find((option) => option.value === value) || ROLE_OPTIONS[0];
  const SelectedIcon = selected.icon;

  const setMenuOpen = (nextOpen) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleSelect = (nextValue) => {
    onChange(nextValue);
    setMenuOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${open ? 'z-[200]' : 'z-0'}`}>
      <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-slate-500">
        User Type
      </label>
      <button
        type="button"
        id="role"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen(!open);
        }}
        className={`mt-1 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-sm transition-all duration-200 ${
          open
            ? 'border-blue-500 bg-white shadow-[0_0_0_3px_rgba(37,99,235,0.18)]'
            : 'border-slate-300 bg-white hover:border-slate-400'
        }`}
        style={{ backgroundColor: '#ffffff' }}
      >
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${selected.accent} text-white shadow-sm`}>
          <SelectedIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm sm:text-base font-semibold text-slate-900">{selected.label}</span>
          <span className="block truncate text-[11px] sm:text-xs text-slate-500">{selected.description}</span>
        </span>
        <ChevronDownIcon className={`h-5 w-5 flex-shrink-0 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="User Type"
          className="absolute left-0 right-0 top-full z-[210] mt-2 overflow-hidden rounded-2xl border border-slate-300 p-1.5 shadow-2xl"
          style={{ backgroundColor: '#ffffff' }}
          onClick={(event) => event.stopPropagation()}
        >
          {ROLE_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleSelect(option.value);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
                    isSelected
                      ? 'bg-blue-50 ring-2 ring-blue-500'
                      : 'bg-white hover:bg-slate-100'
                  }`}
                  style={{ backgroundColor: isSelected ? '#eff6ff' : '#ffffff' }}
                >
                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${option.accent} text-white shadow-sm`}>
                    <OptionIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                    <span className="block text-[11px] text-slate-600">{option.description}</span>
                  </span>
                  {isSelected && (
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                      <CheckIcon className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const industryHighlights = [
  {
    icon: CircleStackIcon,
    title: 'Cylinder Visibility',
    description: 'Track full, empty, and moving inventory across teams without blind spots.'
  },
  {
    icon: TruckIcon,
    title: 'Dispatch Control',
    description: 'Coordinate deliveries, returns, and field movement from one live dashboard.'
  },
  {
    icon: BeakerIcon,
    title: 'Gas Sales Accuracy',
    description: 'Maintain reliable invoicing, collections, and reports for industrial operations.'
  }
];

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('super_admin');
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/', { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (!role) {
        toast.error('Please select a user type');
        setSubmitting(false);
        return;
      }
      const result = await login(email, password, role);
      if (!result.success) throw new Error(result.message || 'Login failed');
      toast.success('Login successful!');
      navigate('/');
    } catch (error) {
      toast.error(error.message || error.response?.data?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="theme-azure h-[100dvh] relative overflow-hidden px-3 sm:px-6 lg:px-8">
      <div className="absolute top-6 left-6 w-44 h-44 sm:w-72 sm:h-72 bg-sky-300 rounded-full mix-blend-multiply filter blur-lg sm:blur-xl opacity-25 sm:opacity-30 animate-float" />
      <div className="absolute top-6 right-6 w-44 h-44 sm:w-72 sm:h-72 bg-cyan-300 rounded-full mix-blend-multiply filter blur-lg sm:blur-xl opacity-25 sm:opacity-30 animate-float" style={{ animationDelay: '2s' }} />
      <div className="absolute -bottom-10 left-12 w-44 h-44 sm:w-72 sm:h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-lg sm:blur-xl opacity-25 sm:opacity-30 animate-float" style={{ animationDelay: '4s' }} />

      <div className="relative z-10 mx-auto w-full max-w-7xl h-full flex items-center">
        <div className="glass-modal w-full rounded-3xl max-h-[96dvh] overflow-hidden border border-white/40 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr]">
            <section className="hidden lg:block relative p-10 xl:p-12 border-r border-white/40 bg-gradient-to-br from-blue-100/55 via-slate-100/45 to-cyan-100/60">
              <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-cyan-300/35 blur-3xl" />
              <div className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-blue-300/35 blur-3xl" />

              <div className="relative z-10 h-full flex flex-col">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/70 px-4 py-2 text-xs font-semibold tracking-wide text-blue-700 uppercase">
                    <span className="h-2 w-2 rounded-full bg-cyan-500" />
                    Industrial Gas Operations
                  </div>

                  <h1 className="mt-4 sm:mt-6 text-4xl xl:text-5xl font-extrabold leading-tight tracking-tight text-slate-900">
                    SYED TAYYAB
                    <span className="block bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-600 bg-clip-text text-transparent">
                      INDUSTRIAL GASES LLC
                    </span>
                  </h1>

                  <p className="mt-5 max-w-xl text-sm xl:text-base text-slate-600 leading-relaxed">
                    Secure platform for industrial gas operations with cleaner dispatch flow, tighter stock control,
                    and consistent collection records.
                  </p>
                </div>

                <div className="mt-8 space-y-4">
                  {industryHighlights.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-md">
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 p-2.5 text-white shadow">
                          <item.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800">{item.title}</p>
                          <p className="mt-1 text-xs text-slate-600 leading-relaxed">{item.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-4 sm:pt-6 border-t border-slate-200/80">
                  <p className="text-xs text-slate-600">
                    "From cylinder dispatch to payment closure - one controlled workflow."
                  </p>
                </div>
              </div>
            </section>

            <section className="p-4 sm:p-7 lg:p-8 xl:p-10 bg-gradient-to-b from-white/45 to-white/25 flex items-center">
              <div className="w-full max-w-xl mx-auto">
                <div className="glass-card rounded-3xl border border-white/75 bg-white/78 p-3 sm:p-6 lg:p-7 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.6)] backdrop-blur-xl">
                  <div className="mb-4 sm:mb-5">
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/90 bg-emerald-50/90 px-3 py-1.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Authorized Access
                    </div>
                    <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold leading-tight text-slate-900">
                      Sign In
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-slate-600">
                      Enter your credentials to continue
                    </p>
                  </div>

                  <form className="relative space-y-3 sm:space-y-4" onSubmit={handleSubmit}>
                    <div
                      className={`relative overflow-visible rounded-2xl border border-slate-200 bg-white px-3 sm:px-4 py-2.5 shadow-sm transition-all duration-200 ${
                        roleMenuOpen ? 'z-[180]' : 'z-10'
                      }`}
                      style={{ backgroundColor: '#ffffff' }}
                    >
                      <RoleTypeSelect
                        value={role}
                        onChange={setRole}
                        onOpenChange={setRoleMenuOpen}
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/90 px-3 sm:px-4 py-2.5 shadow-sm transition-all duration-200 focus-within:border-blue-400/80 focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.14)]">
                      <label htmlFor="email" className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Email or Username
                      </label>
                      <div className="relative mt-1">
                        <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none">
                          <EnvelopeIcon className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400" />
                        </div>
                        <input
                          id="email"
                          name="email"
                          type="text"
                          autoComplete="username"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="block w-full bg-transparent pl-7 sm:pl-8 pr-1 text-sm sm:text-base text-slate-900 placeholder-slate-400 focus:outline-none"
                          placeholder="admin@example.com or admin"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/90 px-3 sm:px-4 py-2.5 shadow-sm transition-all duration-200 focus-within:border-blue-400/80 focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.14)]">
                      <label htmlFor="password" className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Password
                      </label>
                      <div className="relative mt-1">
                        <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none">
                          <LockClosedIcon className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400" />
                        </div>
                        <input
                          id="password"
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="block w-full bg-transparent pl-7 sm:pl-8 pr-1 text-sm sm:text-base text-slate-900 placeholder-slate-400 focus:outline-none"
                          placeholder="........"
                        />
                      </div>
                    </div>

                    <div className="pt-1">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full flex justify-center rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 py-2.5 sm:py-3 px-4 text-sm sm:text-base text-white font-semibold shadow-[0_14px_30px_-18px_rgba(37,99,235,0.9)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-16px_rgba(14,116,144,0.9)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                      >
                        {submitting ? (
                          <div className="flex items-center">
                            <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-white mr-2" />
                            <span className="text-sm sm:text-base">Signing in...</span>
                          </div>
                        ) : (
                          'Sign in'
                        )}
                      </button>
                    </div>
                  </form>

                  <div className="mt-3 sm:mt-4 rounded-2xl border border-blue-100/80 bg-blue-50/75 px-3.5 sm:px-4 py-2.5 sm:py-3">
                    <p className="text-[11px] sm:text-xs font-semibold tracking-wide text-slate-700 uppercase">Demo Credentials</p>
                    <p className="mt-1 text-[11px] sm:text-sm text-slate-600">
                      <span className="font-medium text-slate-700">Email:</span> admin@example.com
                    </p>
                    <p className="text-[11px] sm:text-sm text-slate-600">
                      <span className="font-medium text-slate-700">Password:</span> admin123
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
