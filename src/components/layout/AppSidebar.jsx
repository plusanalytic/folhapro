import { Link, useLocation } from 'react-router-dom';
import { Building2, Users, FileText, BarChart3, Settings, ChevronRight, Banknote, ArrowDownCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: BarChart3, label: 'Dashboard' },
  { path: '/companies', icon: Building2, label: 'Empresas' },
  { path: '/employees', icon: Users, label: 'Colaboradores' },
  { path: '/payroll', icon: Banknote, label: 'Folha de Pagamento' },
  { path: '/cashout', icon: ArrowDownCircle, label: 'Saída de Caixa' },
  { path: '/reports', icon: FileText, label: 'Relatórios' },
];

export default function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-sidebar flex flex-col z-40">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Banknote className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sidebar-foreground font-semibold text-sm">FolhaPro</p>
            <p className="text-sidebar-foreground/50 text-xs">Gestão de Folha</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="w-3 h-3 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <Link
          to="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-all"
        >
          <Settings className="w-4 h-4" />
          <span>Configurações</span>
        </Link>
      </div>
    </aside>
  );
}