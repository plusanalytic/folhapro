import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

export default function AddEsporadicoDialog({ companyId, referenceMonth, existingEntries, onAdded, onClose }) {
  const [allEsporadicos, setAllEsporadicos] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Employee.list().then(list => {
      setAllEsporadicos(list.filter(e => e.contract_type === 'ESPORADICO' && e.is_active !== false));
      setLoading(false);
    });
  }, []);

  const alreadyAdded = new Set(existingEntries.map(e => e.employee_id));

  const filtered = allEsporadicos.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.cpf_cnpj || '').includes(search)
  );

  const handleAdd = async (emp) => {
    // Cria um PayrollEntry vínculando o prestador à empresa selecionada neste mês
    await base44.entities.PayrollEntry.create({
      employee_id: emp.id,
      company_id: companyId,
      reference_month: referenceMonth,
      base_salary: emp.base_salary || 0,
      status: 'open',
    });
    toast.success(`${emp.name} adicionado à folha!`);
    onAdded();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">Adicionar Prestador Esporádico</h2>
            <p className="text-sm text-muted-foreground">Selecione o prestador para incluir neste mês</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome ou CPF/CNPJ..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading && <p className="text-center text-muted-foreground py-8 text-sm">Carregando...</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Nenhum prestador esporádico encontrado.
              <br />
              <span className="text-xs">Cadastre colaboradores com contrato "ESPORÁDICO" em Colaboradores.</span>
            </p>
          )}
          {filtered.map(emp => {
            const already = alreadyAdded.has(emp.id);
            return (
              <div key={emp.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-primary">
                    {emp.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{emp.name}</p>
                    <p className="text-xs text-muted-foreground">{emp.cpf_cnpj || 'CPF não informado'} · {emp.position || 'Sem cargo'}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={already ? 'outline' : 'default'}
                  disabled={already}
                  className="gap-1.5"
                  onClick={() => handleAdd(emp)}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {already ? 'Adicionado' : 'Adicionar'}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}