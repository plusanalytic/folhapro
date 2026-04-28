import { useState, useCallback } from 'react';

/**
 * Hook para inputs numéricos que:
 * - Mantém o foco sem pular para outro campo durante digitação
 * - Permite zerar o campo (mostra "" ao invés de "0" quando apagado)
 * - Salva como número no estado externo somente no blur
 *
 * Uso:
 *   const bind = useNumericInput(form.base_salary, v => setNum('base_salary', v));
 *   <Input {...bind} />
 */
export function useNumericInput(externalValue, onChange) {
  // Estado local como string para não interferir na digitação
  const [localValue, setLocalValue] = useState(null); // null = não está sendo editado

  const handleFocus = useCallback((e) => {
    // Ao focar: usa o valor externo como string local; se for 0, mostra vazio
    const val = externalValue === 0 || externalValue === '0' ? '' : String(externalValue ?? '');
    setLocalValue(val);
    // Seleciona tudo para facilitar substituição
    setTimeout(() => e.target.select(), 0);
  }, [externalValue]);

  const handleChange = useCallback((e) => {
    setLocalValue(e.target.value);
  }, []);

  const handleBlur = useCallback(() => {
    const parsed = parseFloat(localValue);
    const numVal = isNaN(parsed) ? 0 : parsed;
    onChange(numVal);
    setLocalValue(null); // Volta a usar valor externo
  }, [localValue, onChange]);

  // Se está sendo editado, usa o valor local; caso contrário, usa o externo
  const displayValue = localValue !== null ? localValue : (externalValue === 0 ? '' : (externalValue ?? ''));

  return {
    type: 'number',
    value: displayValue,
    onFocus: handleFocus,
    onChange: handleChange,
    onBlur: handleBlur,
  };
}