import { useState, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from 'sonner'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Companies from '@/pages/Companies';
import Employees from '@/pages/Employees';
import Payroll from '@/pages/Payroll';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import CashOut from '@/pages/CashOut';
import Workplaces from '@/pages/Workplaces';
import JobRoles from '@/pages/JobRoles';
import PointAdjustments from '@/pages/PointAdjustments';
import Payments from '@/pages/Payments';
import AccessManagement from '@/pages/AccessManagement';
import AppLogin from '@/pages/AppLogin';
import { AppUserContext } from '@/lib/AppUserContext';
import { Navigate } from 'react-router-dom';

const SESSION_KEY = 'app_user_session';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const [appUser, setAppUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
  });

  const handleLogin = (user) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    setAppUser(user);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setAppUser(null);
  };

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  if (!appUser) {
    return <AppLogin onLogin={handleLogin} />;
  }

  const allowed = appUser?.allowed_modules;
  const can = (key) => !allowed || allowed.includes(key);

  return (
    <AppUserContext.Provider value={appUser}>
    <Routes>
      <Route element={<AppLayout appUser={appUser} onLogout={handleLogout} />}>
        <Route path="/" element={can('dashboard') ? <Dashboard /> : <Navigate to={allowed?.[0] ? `/${allowed[0] === 'dashboard' ? '' : allowed[0]}` : '/'} replace />} />
        <Route path="/companies"         element={can('companies')         ? <Companies />    : <Navigate to="/" replace />} />
        <Route path="/employees"         element={can('employees')         ? <Employees />    : <Navigate to="/" replace />} />
        <Route path="/payroll"           element={can('payroll')           ? <Payroll />      : <Navigate to="/" replace />} />
        <Route path="/reports"           element={can('reports')           ? <Reports />      : <Navigate to="/" replace />} />
        <Route path="/settings"          element={can('settings')          ? <Settings />     : <Navigate to="/" replace />} />
        <Route path="/cashout"           element={can('cashout')           ? <CashOut />      : <Navigate to="/" replace />} />
        <Route path="/workplaces"        element={can('workplaces')        ? <Workplaces />   : <Navigate to="/" replace />} />
        <Route path="/job-roles"         element={can('job-roles')         ? <JobRoles />     : <Navigate to="/" replace />} />
        <Route path="/point-adjustments" element={can('point-adjustments') ? <PointAdjustments /> : <Navigate to="/" replace />} />
        <Route path="/payments"          element={can('payments')          ? <Payments />     : <Navigate to="/" replace />} />
        <Route path="/access"            element={can('access')            ? <AccessManagement currentAppUser={appUser} /> : <Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </AppUserContext.Provider>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <SonnerToaster position="top-right" richColors />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App