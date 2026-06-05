import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Wrench, Loader2 } from 'lucide-react';

const r = (v) => Math.round((v ?? 0) * 100) / 100;
const fmt = (v) => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FixLockedBasesDialog({ rule, employees, onClose, onDone }) {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const snapshot = rule.affected_payroll_entries_snapshot ?? [];
    if (snapshot.length === 0) {
      toast.error('Snapshot não encontrado na regra');
      onClose();
      return;
    }

    const allEntries = await base44.entities.PayrollEntry.filter({ reference_month: rule.reference_month });

    const snapshotById = {};
    for (const s of snapshot) {
      if (s.id) snapshotById[s.id] = s;
    }

    const candidates = [];
    for (const entry of allEntries) {
      if (!entry.first_period_base_locked) continue;
      const snap = snapshotById[entry.id];
      if (!snap) continue;
      const snapBase = snap.first_period_base ?? 0;
      const currBase = entry.first_period_base ?? 0;
      const diff = r(snapBase - currBase);
      if (Math.abs(diff) < 0.001) continue;

      const emp = employees.find(e => e.id === entry.employee_id);
      candidates.push({
        entry_id: entry.id,
        employee_id: entry.employee_id,
        employee_name: emp?.name ?? entry.employee_id,
        current_first_base: currBase,
        snapshot_first_base: snapBase,
        diff,
      });
    }

    setItems(candidates);
    setSelected(new Set(candidates.map(c => c.employee_id)));
    setLoading(false);
  };

  const toggleAll = (checked) => {
    setSelected(checked ? new Set(items.map(i => i.employee_id)) : new Set());
  };

  const toggleOne = (id, checked) => {
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    setSelected(next);
  };

  const handleApply = async () => {
    if (selected.size === 0) return;
    setApplying(true);
    const res = await base44.functions.invoke('fixLockedBasesAfterReadjustment', {
      ruleId: rule.id,
      employeeIds: Array.from(selected),
    });
    setApplying(false);
    if (res.data?.success) {
      toast.success(`${res.data.fixedCount} folha(s) corrigida(s) com sucesso`);
      onDone();
    } else {
      toast.error(res.data?.error ?? 'Erro ao corrigir');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-lg w-full shadow-xl space-y-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-base">Corrigir Bases Bloqueadas</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Colaboradores com 1ª quinzena já paga cuja base foi alterada pelo reajuste.
          A diferença será restaurada na base da 1ª quinzena e adicionada à 2ª quinzena.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhuma folha com base bloqueada e diferença encontrada. ✅
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="flex items-center gap-2 p-2 border-b text-sm font-medium mb-1">
              <Checkbox
                checked={selected.size === items.length && items.length > 0}
                onCheckedChange={toggleAll}
              />
              <span>Selecionar todos ({items.length})</span>
            </div>
            <div className="space-y-1">
              {items.map(item => (
                <div key={item.employee_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40">
                  <Checkbox
                    checked={selected.has(item.employee_id)}
                    onCheckedChange={(c) => toggleOne(item.employee_id, c)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.employee_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Base 1ª quinz: <span className="line-through">R$ {fmt(item.current_first_base)}</span>
                      {' → '}
                      <span className="text-green-700 font-medium">R$ {fmt(item.snapshot_first_base)}</span>
                      <span className="text-orange-600 font-medium ml-2">(+R$ {fmt(item.diff)} na 2ª quinz.)</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={applying}>Cancelar</Button>
          <Button
            onClick={handleApply}
            disabled={applying || selected.size === 0 || loading || items.length === 0}
            className="gap-1.5"
          >
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            Corrigir {selected.size > 0 ? `(${selected.size})` : ''} folha(s)
          </Button>
        </div>
      </div>
    </div>
  );
}