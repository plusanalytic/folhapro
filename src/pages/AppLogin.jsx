import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Eye, EyeOff } from 'lucide-react';

export default function AppLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const all = await base44.entities.UserAccess.list();
      // Garante usuário admin padrão se não existir nenhum
      const hasAdmin = all.some(u => u.username === 'admin');
      if (all.length === 0 || !hasAdmin) {
        await base44.entities.UserAccess.create({
          username: 'admin',
          password: 'admin',
          full_name: 'Administrador',
          profile: 'admin',
          allowed_modules: ['dashboard','companies','employees','payroll','payments','cashout','reports','job-roles','workplaces','point-adjustments','settings','access'],
          is_active: true,
        });
        // Recarrega
        const refreshed = await base44.entities.UserAccess.list();
        const found = refreshed.find(u => u.username === username.trim() && u.password === password);
        if (!found || !found.is_active) { setError('Usuário ou senha inválidos.'); setLoading(false); return; }
        onLogin(found);
        return;
      }
      const found = all.find(u => u.username === username.trim() && u.password === password);
      if (!found) { setError('Usuário ou senha inválidos.'); setLoading(false); return; }
      if (!found.is_active) { setError('Usuário inativo. Contate o administrador.'); setLoading(false); return; }
      onLogin(found);
    } catch {
      setError('Erro ao conectar. Tente novamente.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#6a3eaf] to-[#239BB6]">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#6a3eaf] to-[#239BB6] flex items-center justify-center mb-3">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-800">Folha de Pagamento</h1>
          <p className="text-sm text-gray-500 mt-1">Faça login para continuar</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label className="text-sm font-medium text-gray-700">Usuário</Label>
            <Input
              className="mt-1"
              placeholder="Digite seu usuário"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </div>
          <div>
            <Label className="text-sm font-medium text-gray-700">Senha</Label>
            <div className="relative mt-1">
              <Input
                type={showPwd ? 'text' : 'password'}
                placeholder="Digite sua senha"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPwd(v => !v)}
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full mt-2" disabled={loading || !username || !password}>
            {loading ? 'Verificando...' : 'Entrar'}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Acesso restrito
        </p>
      </div>
    </div>
  );
}