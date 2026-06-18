import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import MultiSearchableSelect from '@/components/ui/MultiSearchableSelect';

const currentMonth = new Date().toISOString().slice(0, 7);

export default function CashOutFilters({
  search, onSearchChange,
  filterMonths, onFilterMonthsChange, monthOptions,
  filterCompanies, onFilterCompaniesChange,
  filterEmployees, onFilterEmployeesChange,
  companies, employees,
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar colaborador ou descrição..."
              className="pl-9 h-9"
              value={search}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
          <MultiSearchableSelect
            values={filterMonths}
            onValuesChange={onFilterMonthsChange}
            placeholder="Mês"
            className="w-48"
            allLabel="Todos os Meses"
            selectedLabel="meses"
            options={monthOptions}
            scrollToValue={currentMonth}
          />
          <MultiSearchableSelect
            values={filterCompanies}
            onValuesChange={v => { onFilterCompaniesChange(v); onFilterEmployeesChange([]); }}
            placeholder="Empresa"
            className="w-44"
            allLabel="Todas as Empresas"
            selectedLabel="empresas"
            options={companies.map(c => ({ value: c.id, label: c.name }))}
          />
          <MultiSearchableSelect
            values={filterEmployees}
            onValuesChange={onFilterEmployeesChange}
            placeholder="Colaborador"
            className="w-52"
            allLabel="Todos os Colaboradores"
            selectedLabel="colaboradores"
            options={(filterCompanies.length > 0 ? employees.filter(e => filterCompanies.includes(e.company_id)) : employees).map(e => ({ value: e.id, label: e.name }))}
          />
        </div>
      </CardContent>
    </Card>
  );
}