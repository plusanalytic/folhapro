import { useState, useEffect } from 'react';
import { Moon, Sun, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TopBar() {
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
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-30">
      <p className="text-sm text-muted-foreground capitalize">{today}</p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} className="h-9 w-9">
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Bell className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}