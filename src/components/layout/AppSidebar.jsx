import { Link, useLocation } from 'react-router-dom';
import { Building2, Users, FileText, BarChart3, Settings, ChevronRight, Banknote, ArrowDownCircle, MapPin, Briefcase, ClipboardCheck, CreditCard, ShieldCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: BarChart3, label: 'Dashboard' },
  { path: '/companies', icon: Building2, label: 'Empresas' },
  { path: '/employees', icon: Users, label: 'Colaboradores' },
  { path: '/workplaces', icon: MapPin, label: 'Locais de Trabalho' },
  { path: '/job-roles', icon: Briefcase, label: 'Cargos / Folha' },
  { path: '/payroll', icon: Banknote, label: 'Folha de Pagamento' },
  { path: '/cashout', icon: ArrowDownCircle, label: 'Saída de Caixa' },
  { path: '/point-adjustments', icon: ClipboardCheck, label: 'Ajustes de Ponto' },
  { path: '/payments', icon: CreditCard, label: 'Pagamentos' },
  { path: '/reports', icon: FileText, label: 'Relatórios' },
  { path: '/access', icon: ShieldCheck, label: 'Gestão de Acessos' },
];

export default function AppSidebar({ collapsed, mobileOpen, onMobileClose }) {
  const location = useLocation();

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen flex flex-col z-40 transition-all duration-300 hidden lg:flex',
          collapsed ? 'w-16' : 'w-60'
        )}
        style={{ backgroundColor: '#6a3eaf' }}
      >
        <div className="p-3 flex items-center justify-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', minHeight: '64px' }}>
          {!collapsed ? (
            <img
              src="https://media.base44.com/images/public/69dfcba2fae1c77226b7a4da/324c9c675_LOGOCONTACTA-SEMFUNDO-DEITADO1.png"
              alt="Contacta"
              className="h-9 w-auto object-contain"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">C</div>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
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
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{label}</span>}
                {!collapsed && active && <ChevronRight className="w-3 h-3 opacity-80" />}
              </Link>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="p-2" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            <Link
              to="/settings"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-all"
            >
              <Settings className="w-4 h-4" />
              <span>Configurações</span>
            </Link>
          </div>
        )}
        {collapsed && (
          <div className="p-2" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            <Link to="/settings" title="Configurações" className="flex items-center justify-center p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-all">
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        )}
      </aside>

      {/* Mobile sidebar (drawer) */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-72 flex flex-col z-40 transition-transform duration-300 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ backgroundColor: '#6a3eaf' }}
      >
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', minHeight: '64px' }}>
          <img
            src="https://media.base44.com/images/public/69dfcba2fae1c77226b7a4da/324c9c675_LOGOCONTACTA-SEMFUNDO-DEITADO1.png"
            alt="Contacta"
            className="h-8 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <button onClick={onMobileClose} className="text-white/70 hover:text-white p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
            return (
              <Link
                key={path}
                to={path}
                onClick={onMobileClose}
                style={active ? { backgroundColor: '#239BB6' } : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all',
                  active ? 'text-white' : 'text-white/80 hover:text-white hover:bg-white/10'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="w-3 h-3 opacity-80" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          <Link
            to="/settings"
            onClick={onMobileClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-all"
          >
            <Settings className="w-4 h-4" />
            <span>Configurações</span>
          </Link>
        </div>
      </aside>
    </>
  );
}