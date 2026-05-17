import { useState, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

/**
 * Select dropdown com campo de busca interno.
 * Props:
 *   value, onValueChange — igual ao Select normal
 *   placeholder — texto do trigger
 *   className — classe do trigger
 *   allLabel — texto da opção "todos" (default: "Todos")
 *   allValue — valor da opção "todos" (default: "all")
 *   options — array de { value, label }
 */
export default function SearchableSelect({
  value,
  onValueChange,
  placeholder = 'Selecionar',
  className = 'w-48',
  allLabel = 'Todos',
  allValue = 'all',
  options = [],
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Select
      value={value}
      onValueChange={v => { onValueChange(v); setSearch(''); }}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent onCloseAutoFocus={e => e.preventDefault()}>
        {/* Campo de busca fixo no topo */}
        <div className="px-2 py-1.5 sticky top-0 bg-popover z-10 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              ref={inputRef}
              className="h-7 text-xs pl-7 pr-2"
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
        <SelectItem value={allValue}>{allLabel}</SelectItem>
        {filtered.map(o => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-3">Nenhum resultado</div>
        )}
      </SelectContent>
    </Select>
  );
}