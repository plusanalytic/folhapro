import { useState, useEffect } from 'react';
import { Moon, Sun, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TopBar({ appUser, onLogout, onToggleSidebar, onMobileMenu, sidebarOpen }) {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [dark]);

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-3 md:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-2">
        {/* Mobile hamburger */}
        <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" onClick={onMobileMenu}>
          <Menu className="w-5 h-5" />
        </Button>
        {/* Desktop collapse toggle */}
        <Button variant="ghost" size="icon" className="h-9 w-9 hidden lg:flex" onClick={onToggleSidebar} title={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}>
          {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </Button>
        <p className="text-sm text-muted-foreground capitalize hidden sm:block">{today}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} className="h-9 w-9">
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        {appUser && (
          <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-1.5">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white">
              {(appUser.full_name || appUser.username || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="text-xs">
              <div className="font-medium leading-none">{appUser.full_name || appUser.username}</div>
              <div className="text-muted-foreground capitalize leading-none mt-0.5">{appUser.profile}</div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" title="Sair" onClick={onLogout}>
              <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}