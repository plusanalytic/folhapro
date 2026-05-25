import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Building2, Users, FileText, BarChart3, Settings, ChevronRight, ChevronLeft, Banknote, ArrowDownCircle, MapPin, Briefcase, ClipboardCheck, CreditCard, ShieldCheck, X, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppUser } from '@/lib/AppUserContext';

const ALL_NAV_ITEMS = [
{ path: '/', moduleKey: 'dashboard', icon: BarChart3, label: 'Dashboard' },
{ path: '/companies', moduleKey: 'companies', icon: Building2, label: 'Empresas' },
{ path: '/employees', moduleKey: 'employees', icon: Users, label: 'Colaboradores' },
{ path: '/workplaces', moduleKey: 'workplaces', icon: MapPin, label: 'Locais de Trabalho' },
{ path: '/job-roles', moduleKey: 'job-roles', icon: Briefcase, label: 'Cargos / Folha' },
{ path: '/payroll', moduleKey: 'payroll', icon: Banknote, label: 'Folha de Pagamento' },
{ path: '/cashout', moduleKey: 'cashout', icon: ArrowDownCircle, label: 'Saída de Caixa' },
{ path: '/point-adjustments', moduleKey: 'point-adjustments', icon: ClipboardCheck, label: 'Ajustes de Ponto' },
{ path: '/payments', moduleKey: 'payments', icon: CreditCard, label: 'Pagamentos' },
{ path: '/reports', moduleKey: 'reports', icon: FileText, label: 'Relatórios' },
{ path: '/access', moduleKey: 'access', icon: ShieldCheck, label: 'Gestão de Acessos' },
{ path: '/readjustment', moduleKey: 'readjustment', icon: TrendingUp, label: 'Reajuste Salarial' }];


export default function AppSidebar({ collapsed: collapsedProp, mobileOpen, onMobileClose }) {
  const [collapsed, setCollapsed] = useState(collapsedProp ?? false);
  const location = useLocation();
  const appUser = useAppUser();
  const allowedModules = appUser?.allowed_modules;
  const navItems = allowedModules ?
  ALL_NAV_ITEMS.filter((item) => allowedModules.includes(item.moduleKey)) :
  ALL_NAV_ITEMS;
  const settingsAllowed = !allowedModules || allowedModules.includes('settings');

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen flex flex-col z-40 transition-all duration-300 hidden lg:flex',
          collapsed ? 'w-16' : 'w-60'
        )}
        style={{ backgroundColor: '#6a3eaf' }}>
        
{/* Logo area */}
<div className={`flex flex-col items-center border-b border-white/20 transition-all duration-300 ${collapsed ? 'px-1 py-3 gap-3' : 'px-3 pt-4 pb-3 gap-4'}`}>
  {!collapsed &&
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69aee345ac5d3a8418bfc552/93c0376ec_LOGOCONTACTA-SEMFUNDO-EMP-atual.png"
            alt="Contacta RH"
            className="object-contain brightness-0 invert mx-auto h-24" />

          }

  {collapsed &&
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
      <span className="text-white font-bold text-sm">C</span>
    </div>
          }

  <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors mt-1">
            
    {collapsed ? <ChevronRight size={16} /> : null}
  </button>
</div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path || path !== '/' && location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                title={collapsed ? label : undefined}
                style={active ? { backgroundColor: '#239BB6' } : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                  collapsed ? 'justify-center px-2' : '',
                  active ? 'text-white' : 'text-white/80 hover:text-white hover:bg-white/10'
                )}>
                
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{label}</span>}
                {!collapsed && active && <ChevronRight className="w-3 h-3 opacity-80" />}
              </Link>);

          })}
        </nav>

        {settingsAllowed &&
        <div className="p-2" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            {collapsed ?
          <Link to="/settings" title="Configurações" className="flex items-center justify-center p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-all">
                <Settings className="w-4 h-4" />
              </Link> :

          <Link to="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-all">
                <Settings className="w-4 h-4" />
                <span>Configurações</span>
              </Link>
          }
          </div>
        }
      </aside>

      {/* Mobile sidebar (drawer) */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-72 flex flex-col z-40 transition-transform duration-300 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ backgroundColor: '#6a3eaf' }}>
        
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', minHeight: '64px' }}>
          <img
            src="https://media.base44.com/images/public/69dfcba2fae1c77226b7a4da/324c9c675_LOGOCONTACTA-SEMFUNDO-DEITADO1.png"
            alt="Contacta"
            className="h-8 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }} />
          
          <button onClick={onMobileClose} className="text-white/70 hover:text-white p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path || path !== '/' && location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                onClick={onMobileClose}
                style={active ? { backgroundColor: '#239BB6' } : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all',
                  active ? 'text-white' : 'text-white/80 hover:text-white hover:bg-white/10'
                )}>
                
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="w-3 h-3 opacity-80" />}
              </Link>);

          })}
        </nav>

        {settingsAllowed &&
        <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            <Link
            to="/settings"
            onClick={onMobileClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-all">
            
              <Settings className="w-4 h-4" />
              <span>Configurações</span>
            </Link>
          </div>
        }
      </aside>
    </>);

}