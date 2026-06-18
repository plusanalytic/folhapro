import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Multi-select dropdown with search.
 * values: string[] — selected values
 * onValuesChange: (values: string[]) => void
 * options: { value: string, label: string }[]
 * placeholder: string
 * allLabel: string — label when nothing selected
 */
export default function MultiSearchableSelect({ values = [], onValuesChange, options = [], placeholder = 'Selecionar', allLabel = 'Todos', className, selectedLabel, scrollToValue }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  const listRef = useRef(null);
  const scrollTargetRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && scrollToValue && scrollTargetRef.current) {
      scrollTargetRef.current.scrollIntoView({ block: 'center' });
    }
  }, [open, scrollToValue]);

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  const toggle = (val) => {
    if (values.includes(val)) {
      onValuesChange(values.filter(v => v !== val));
    } else {
      onValuesChange([...values, val]);
    }
  };

  const label = values.length === 0
    ? allLabel
    : values.length === 1
      ? options.find(o => o.value === values[0])?.label || values[0]
      : selectedLabel
        ? `${values.length} ${selectedLabel}`
        : `${values.length} selecionados`;

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className={cn('truncate', values.length === 0 ? 'text-muted-foreground' : 'text-foreground')}>{label}</span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {values.length > 0 && (
            <X
              className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground"
              onClick={e => { e.stopPropagation(); onValuesChange([]); }}
            />
          )}
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-md border border-border bg-popover shadow-md">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              className="w-full rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
            />
          </div>
          <div ref={listRef} className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum resultado</div>
            )}
            {filtered.map(opt => (
              <button
                key={opt.value}
                ref={scrollToValue && opt.value === scrollToValue ? scrollTargetRef : null}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={e => { e.preventDefault(); toggle(opt.value); }}
              >
                <div className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                  values.includes(opt.value) ? 'bg-primary border-primary' : 'border-input'
                )}>
                  {values.includes(opt.value) && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}