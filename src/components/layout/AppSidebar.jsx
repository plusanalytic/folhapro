import { Link, useLocation } from 'react-router-dom';
import { Building2, Users, FileText, BarChart3, Settings, ChevronRight, Banknote, ArrowDownCircle, MapPin, Briefcase, ClipboardCheck, CreditCard, ShieldCheck } from 'lucide-react';
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

export default function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 flex flex-col z-40" style={{ backgroundColor: '#6a3eaf' }}>
      <div className="p-5 flex items-center justify-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
        <img
          src="https://media.base44.com/images/public/69dfcba2fae1c77226b7a4da/324c9c675_LOGOCONTACTA-SEMFUNDO-DEITADO1.png"
          alt="Contacta"
          className="h-10 w-auto object-contain"
          style={{ filter: 'brightness(0) invert(1)' }}
        />
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
          return (
            <Link
              key={path}
              to={path}
              style={active ? { backgroundColor: '#239BB6' } : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                active
                  ? 'text-white'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
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
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-all"
        >
          <Settings className="w-4 h-4" />
          <span>Configurações</span>
        </Link>
      </div>
    </aside>
  );
}