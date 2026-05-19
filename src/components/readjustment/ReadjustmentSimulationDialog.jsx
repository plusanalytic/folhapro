import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { formatCurrency, getMonthName } from '@/lib/payrollCalculations';

function r(v) { return Math.round((v ?? 0) * 100) / 100; }

function computeSimulation(entry, rule) {
  const cltMotoBase = entry.clt_moto_base_salary ?? 0;
  const cltMotoDays = Number(entry.clt_moto_worked_days ?? 30);
  const cltMotoEffective = entry.clt_moto_effective_salary
    ?? (cltMotoBase > 0 ? r((cltMotoBase / 30) * cltMotoDays) : (entry.base_salary ?? 0));

  const fullMonthDays = entry.full_month_contract_working_days ?? 0;
  const contractDays  = entry.contract_working_days ?? 0;
  const motoRatio = fullMonthDays > 0 ? contractDays / fullMonthDays : 1;

  const salaryFactor = 1 + (rule.effective_salary_pct ?? 0) / 100;
  const motoFactor   = 1 + (rule.motorcycle_rental_pct ?? 0) / 100;
  const foodFactor   = 1 + (rule.food_voucher_day_value_pct ?? 0) / 100;
  const mealFactor   = 1 + (rule.meal_voucher_day_value_pct ?? 0) / 100;
  const hazardPct    = (rule.hazard_pay_pct_on_salary ?? 30) / 100;

  const origEffSalary     = cltMotoEffective;
  const origHazardPay     = entry.hazard_pay ?? 0;
  const origMotoRentalEff = r((entry.motorcycle_rental ?? 0) * motoRatio);
  const origFoodVEff      = r((entry.food_voucher ?? 0) * motoRatio);
  const origMealVDayValue = entry.meal_voucher_day_value ?? 0;
  const origMealVoucher   = r(origMealVDayValue * (entry.meal_voucher_days ?? 0));

  const newEffSalary     = r(origEffSalary * salaryFactor);
  const newHazardPay     = r(newEffSalary * hazardPct);
  const newMotoRentalFull= r((entry.motorcycle_rental ?? 0) * motoFactor);
  const newMotoRentalEff = r(newMotoRentalFull * motoRatio);
  const newFoodVFull     = r((entry.food_voucher ?? 0) * foodFactor);
  const newFoodVEff      = r(newFoodVFull * motoRatio);
  const newMealVDayValue = r(origMealVDayValue * mealFactor);
  const newMealVoucher   = r(newMealVDayValue * (entry.meal_voucher_days ?? 0));

  const inssPct       = (entry.inss_pct ?? 0) / 100;
  const inssGrossNew  = r((newEffSalary + newHazardPay) * inssPct);
  const inssNetNew    = Math.max(0, r(inssGrossNew - Math.min(entry.inss_discount ?? 0, inssGrossNew)));
  const unionContrib  = entry.union_contribution_value ?? 35;
  const lifeIns       = entry.life_insurance ?? 0;
  const mealVDiscount = r(newMealVoucher * ((entry.meal_voucher_discount_pct ?? 0) / 100));

  const newGrossTotal = r(newEffSalary + newMotoRentalEff + newMealVoucher + newHazardPay);
  const newNetTotal   = r(newGrossTotal - inssNetNew - unionContrib - mealVDiscount - lifeIns);

  const origNetTotal  = entry.net_total ?? 0;
  const splitFirst    = entry.first_period_split ?? 0.5;
  const origFirstBase = r(origNetTotal * splitFirst);

  const kmBonus    = r((entry.km_bonus_qty ?? 0) * (entry.km_bonus_value ?? 0));
  const costAllow  = r((entry.cost_allowance ?? 0) * motoRatio);
  const absSecond  = entry.absence_discount_second ?? 0;
  const secDiscount= entry.second_period_discount ?? 0;

  const newSecondPeriodNet = r(newNetTotal - origFirstBase + newFoodVEff + kmBonus + costAllow - secDiscount - absSecond);

  return {
    rows: [
      { label: 'Salário Efetivo CLT', orig: origEffSalary, novo: newEffSalary },
      { label: 'Periculosidade (30%)', orig: origHazardPay, novo: newHazardPay },
      { label: 'Aluguel da Moto (efetivo)', orig: origMotoRentalEff, novo: newMotoRentalEff },
      { label: 'Vale Alimentação (efetivo)', orig: origFoodVEff, novo: newFoodVEff },
      { label: 'Vale Refeição (valor/dia)', orig: origMealVDayValue, novo: newMealVDayValue, isCurrency: true },
      { label: 'Total Bruto', orig: entry.gross_total ?? 0, novo: newGrossTotal, bold: true },
      { label: 'Total Líquido', orig: origNetTotal, novo: newNetTotal, bold: true },
      { label: '1ª Quinzena (CONGELADA)', orig: entry.first_period_net ?? 0, novo: entry.first_period_net ?? 0, frozen: true },
      { label: '2ª Quinzena (com retroativo)', orig: entry.second_period_net ?? 0, novo: newSecondPeriodNet, highlight: true, bold: true },
    ],
    retroativo: r(newNetTotal - origNetTotal),
  };
}

export default function ReadjustmentSimulationDialog({ rule, onClose }) {
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const entryQuery = { reference_month: rule.reference_month };
      if (rule.readjustment_scope === 'employee' && rule.employee_id) entryQuery.employee_id = rule.employee_id;

      const [allEntries, allEmployees, allJobRoles] = await Promise.all([
        base44.entities.PayrollEntry.filter(entryQuery),
        base44.entities.Employee.filter({ is_active: true }),
        base44.entities.JobRole.list(),
      ]);

      let cltMotoEntries;
      if (rule.readjustment_scope === 'payroll_type' && rule.payroll_type) {
        const matchingRoles = allJobRoles.filter(jr => jr.payroll_type === rule.payroll_type);
        const roleIds = new Set(matchingRoles.map(jr => String(jr.tangerino_id)).filter(Boolean));
        const relevantEmployeeIds = new Set(
          allEmployees
            .filter(e => e.job_role_tangerino_id && roleIds.has(String(e.job_role_tangerino_id)))
            .map(e => e.id)
        );
        cltMotoEntries = allEntries.filter(e => relevantEmployeeIds.has(e.employee_id) && (e.clt_moto_base_salary ?? 0) > 0);
      } else {
        cltMotoEntries = allEntries.filter(e => (e.clt_moto_base_salary ?? 0) > 0);
      }

      setEntries(cltMotoEntries);
      setEmployees(allEmployees);
      if (cltMotoEntries.length === 1) setSelectedEntryId(cltMotoEntries[0].id);
      setLoading(false);
    }
    load();
  }, [rule]);

  const employeeName = (employeeId) => employees.find(e => e.id === employeeId)?.name ?? employeeId;

  const handleSimulate = () => {
    const entry = entries.find(e => e.id === selectedEntryId);
    if (!entry) return;
    setSimulation(computeSimulation(entry, rule));
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Simulação — {rule.description || getMonthName(rule.reference_month)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Percentuais da regra */}
          <div className="grid grid-cols-2 gap-2 bg-muted/30 rounded-lg p-4 text-sm">
            <div><span className="text-muted-foreground">Salário Efetivo:</span> <strong>+{rule.effective_salary_pct ?? 0}%</strong></div>
            <div><span className="text-muted-foreground">Aluguel da Moto:</span> <strong>+{rule.motorcycle_rental_pct ?? 0}%</strong></div>
            <div><span className="text-muted-foreground">Vale Refeição:</span> <strong>+{rule.meal_voucher_day_value_pct ?? 0}%</strong></div>
            <div><span className="text-muted-foreground">Vale Alimentação:</span> <strong>+{rule.food_voucher_day_value_pct ?? 0}%</strong></div>
            <div><span className="text-muted-foreground">Periculosidade:</span> <strong>{rule.hazard_pay_pct_on_salary ?? 30}% do novo salário</strong></div>
            <div><span className="text-muted-foreground">Mês:</span> <strong>{getMonthName(rule.reference_month)}</strong></div>
          </div>

          {/* Seleção de colaborador */}
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando folhas...</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-destructive">Nenhuma folha CLT Moto encontrada para este escopo e mês.</p>
          ) : (
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">Selecione o Colaborador</p>
                <Select value={selectedEntryId} onValueChange={setSelectedEntryId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {entries.map(e => (
                      <SelectItem key={e.id} value={e.id}>{employeeName(e.employee_id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSimulate} disabled={!selectedEntryId}>Simular</Button>
            </div>
          )}

          {/* Resultado da simulação */}
          {simulation && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">Resultado da Simulação</p>
                <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
                  Diferença total: {formatCurrency(simulation.retroativo)}
                </Badge>
              </div>

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-2 border rounded-tl-md">Item</th>
                    <th className="text-right p-2 border">Valor Original</th>
                    <th className="text-right p-2 border">Valor Reajustado</th>
                    <th className="text-right p-2 border rounded-tr-md">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.rows.map((row, i) => {
                    const diff = r(row.novo - row.orig);
                    return (
                      <tr
                        key={i}
                        className={
                          row.highlight ? 'bg-purple-50 border-purple-200' :
                          row.frozen ? 'bg-blue-50 opacity-75' :
                          i % 2 === 0 ? 'bg-white' : 'bg-muted/20'
                        }
                      >
                        <td className={`p-2 border ${row.bold ? 'font-semibold' : ''}`}>
                          {row.label}
                          {row.frozen && <span className="ml-1 text-xs text-blue-500">(já paga)</span>}
                        </td>
                        <td className="p-2 border text-right font-mono text-muted-foreground">{formatCurrency(row.orig)}</td>
                        <td className={`p-2 border text-right font-mono font-semibold ${row.frozen ? 'text-muted-foreground' : 'text-purple-700'}`}>
                          {formatCurrency(row.novo)}
                        </td>
                        <td className={`p-2 border text-right font-mono text-xs ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {diff === 0 ? '—' : (diff > 0 ? '+' : '') + formatCurrency(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2">
                💡 A 1ª quinzena já foi paga e permanece congelada. O retroativo de <strong>{formatCurrency(simulation.retroativo)}</strong> é absorvido integralmente pela 2ª quinzena.
              </p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}