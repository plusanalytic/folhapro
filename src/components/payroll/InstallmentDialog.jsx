import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/payrollCalculations';
import { CreditCard, Calendar } from 'lucide-react';

// Adiciona N meses a uma string YYYY-MM
function addMonths(yearMonth, n) {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[m - 1]}/${y}`;
}

export default function InstallmentDialog({ open, onClose, onConfirm, referenceMonth, period }) {
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [installments, setInstallments] = useState('');
  const [startDate, setStartDate] = useState(() => {
    // Default: dia 15 para 1ª quinzena, dia 30 para 2ª
    const [y, m] = referenceMonth.split('-');
    return `${y}-${m}-${period === 'first' ? '15' : '30'}`;
  });

  const total = parseFloat(totalAmount) || 0;
  const qty = parseInt(installments) || 0;
  const installmentValue = qty > 0 ? total / qty : 0;

  const preview = qty > 0 && total > 0
    ? Array.from({ length: qty }, (_, i) => ({
        month: addMonths(referenceMonth, i),
        label: getMonthLabel(addMonths(referenceMonth, i)),
        value: installmentValue,
      }))
    : [];

  const handleConfirm = () => {
    if (!description || !total || !qty || qty < 1) return;
    onConfirm({ description, totalAmount: total, installments: qty, installmentValue, startDate, preview });
    setDescription('');
    setTotalAmount('');
    setInstallments('');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            Lançar Parcelas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Descrição</Label>
            <Input
              className="mt-1"
              placeholder="Ex: Empréstimo, Compra de uniforme..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor Total (R$)</Label>
              <Input
                className="mt-1 font-mono"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={totalAmount}
                onChange={e => setTotalAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Nº de Parcelas</Label>
              <Input
                className="mt-1 font-mono"
                type="number"
                step="1"
                min="1"
                placeholder="Ex: 3"
                value={installments}
                onChange={e => setInstallments(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Data de referência (1ª parcela)</Label>
            <Input
              className="mt-1 font-mono"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>

          {installmentValue > 0 && (
            <div className="bg-primary/10 rounded-lg px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">Valor por parcela</p>
              <p className="font-mono font-bold text-primary text-2xl">{formatCurrency(installmentValue)}</p>
            </div>
          )}

          {preview.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Parcelas geradas
              </p>
              <div className="flex flex-wrap gap-2">
                {preview.map((p, i) => (
                  <Badge key={i} variant="outline" className="text-xs gap-1">
                    <span className="font-medium">{i + 1}ª</span> {p.label} — {formatCurrency(p.value)}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                A 1ª parcela será adicionada aos descontos desta quinzena. As demais deverão ser lançadas manualmente no módulo Saída de Caixa nos meses seguintes.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button
              className="flex-1"
              disabled={!description || !total || qty < 1}
              onClick={handleConfirm}
            >
              Confirmar Parcelas
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}