import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Printer, X } from 'lucide-react';
import { formatCurrency, numberToWords, getMonthName } from '@/lib/payrollCalculations';

function HoleriteContent({ employee, entry, month }) {
  const inss = entry?.inss || 0;
  const irrf = entry?.irrf || 0;
  const fgts = entry?.fgts || 0;
  const pjRet = entry?.pj_retention || 0;

  return (
    <div className="p-8 bg-white text-black text-sm font-sans" style={{ width: '210mm', minHeight: '297mm', fontFamily: 'Arial, sans-serif' }}>
      <div className="border-2 border-gray-800 p-6">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold uppercase">RECIBO DE PAGAMENTO DE SALÁRIO</h1>
          <p className="text-gray-600">Referência: {getMonthName(month)}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 border border-gray-300 p-4">
          <div>
            <p className="text-xs text-gray-500 uppercase">Colaborador</p>
            <p className="font-semibold">{employee.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">CPF/CNPJ</p>
            <p className="font-semibold">{employee.cpf_cnpj || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Cargo</p>
            <p className="font-semibold">{employee.position || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Tipo de Contrato</p>
            <p className="font-semibold">{employee.contract_type}</p>
          </div>
        </div>

        <table className="w-full border-collapse mb-6">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-left text-xs uppercase">Descrição</th>
              <th className="border border-gray-300 p-2 text-right text-xs uppercase">Proventos</th>
              <th className="border border-gray-300 p-2 text-right text-xs uppercase">Descontos</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 p-2">Salário Base</td>
              <td className="border border-gray-300 p-2 text-right">{formatCurrency(entry?.base_salary)}</td>
              <td className="border border-gray-300 p-2 text-right">—</td>
            </tr>
            {(entry?.absence_discount || 0) > 0 && (
              <tr>
                <td className="border border-gray-300 p-2">Desconto por Faltas</td>
                <td className="border border-gray-300 p-2 text-right">—</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(entry.absence_discount)}</td>
              </tr>
            )}
            {(entry?.meal_voucher || 0) > 0 && (
              <tr>
                <td className="border border-gray-300 p-2">Vale Refeição</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(entry.meal_voucher)}</td>
                <td className="border border-gray-300 p-2 text-right">—</td>
              </tr>
            )}
            {(entry?.transport_voucher || 0) > 0 && (
              <tr>
                <td className="border border-gray-300 p-2">Vale Transporte</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(entry.transport_voucher)}</td>
                <td className="border border-gray-300 p-2 text-right">—</td>
              </tr>
            )}
            {(entry?.km_bonus || 0) > 0 && (
              <tr>
                <td className="border border-gray-300 p-2">Adicional KM</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(entry.km_bonus)}</td>
                <td className="border border-gray-300 p-2 text-right">—</td>
              </tr>
            )}
            {(entry?.bonus || 0) > 0 && (
              <tr>
                <td className="border border-gray-300 p-2">Bonificação</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(entry.bonus)}</td>
                <td className="border border-gray-300 p-2 text-right">—</td>
              </tr>
            )}
            {inss > 0 && (
              <tr>
                <td className="border border-gray-300 p-2">INSS</td>
                <td className="border border-gray-300 p-2 text-right">—</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(inss)}</td>
              </tr>
            )}
            {irrf > 0 && (
              <tr>
                <td className="border border-gray-300 p-2">IRRF</td>
                <td className="border border-gray-300 p-2 text-right">—</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(irrf)}</td>
              </tr>
            )}
            {pjRet > 0 && (
              <tr>
                <td className="border border-gray-300 p-2">Retenção PJ</td>
                <td className="border border-gray-300 p-2 text-right">—</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(pjRet)}</td>
              </tr>
            )}
            <tr className="bg-gray-50 font-bold">
              <td className="border border-gray-300 p-2">TOTAL</td>
              <td className="border border-gray-300 p-2 text-right">{formatCurrency(entry?.gross_total)}</td>
              <td className="border border-gray-300 p-2 text-right">{formatCurrency(inss + irrf + pjRet)}</td>
            </tr>
          </tbody>
        </table>

        <div className="border-2 border-gray-800 p-4 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500 uppercase">FGTS (8%)</p>
              <p className="font-bold">{formatCurrency(fgts)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase">Valor Líquido</p>
              <p className="text-2xl font-bold">{formatCurrency(entry?.net_total)}</p>
              <p className="text-xs text-gray-600 capitalize">{numberToWords(entry?.net_total || 0)}</p>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-4 border-t border-gray-400 text-center">
          <p className="text-xs text-gray-500">Assinatura do Colaborador</p>
          <p className="font-semibold mt-1">{employee.name}</p>
        </div>
      </div>
    </div>
  );
}

function SimpleReceiptContent({ employee, entry, month, type }) {
  const value = type === 'moto' ? (entry?.km_bonus || entry?.other_benefits || 0) : (entry?.meal_voucher || 0);
  const label = type === 'moto' ? 'Aluguel da Moto' : 'Vale Refeição';
  const monthName = getMonthName(month);

  const text = type === 'moto'
    ? `Eu, ${employee.name}, portador do CPF ${employee.cpf_cnpj || '_______________'}, recebi a importância de ${formatCurrency(value)} (${numberToWords(value)}) em espécie, correspondente ao Aluguel da Moto do mês de ${monthName}.`
    : `Eu, ${employee.name}, portador do CPF ${employee.cpf_cnpj || '_______________'}, recebi a importância de ${formatCurrency(value)} (${numberToWords(value)}) em espécie, correspondente ao Vale Refeição do mês de ${monthName}. Está sendo desta forma por opção minha.`;

  return (
    <div className="p-12 bg-white text-black" style={{ width: '210mm', fontFamily: 'Arial, sans-serif' }}>
      <div className="border border-gray-300 p-8">
        <h2 className="text-center text-lg font-bold uppercase mb-8 pb-4 border-b border-gray-200">
          Recibo de {label}
        </h2>
        <p className="text-base leading-relaxed text-justify mb-12">{text}</p>
        <div className="mt-16 text-center">
          <div className="border-t border-gray-400 pt-2 w-64 mx-auto">
            <p className="font-semibold">{employee.name}</p>
            <p className="text-sm text-gray-600">{employee.cpf_cnpj}</p>
          </div>
          <p className="mt-6 text-sm text-gray-500">Data: _____ / _____ / _________</p>
        </div>
      </div>
    </div>
  );
}

export default function PDFReceiptDialog({ employee, entry, receiptType, referenceMonth, onClose }) {
  const printRef = useRef();

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Recibo</title>
      <style>
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
        @media print { body { print-color-adjust: exact; } }
      </style>
      </head><body>${content}</body></html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  const title = receiptType === 'holerite' ? 'Holerite' : receiptType === 'moto' ? 'Recibo Aluguel Moto' : 'Recibo Vale Refeição';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{title} — {employee.name}</DialogTitle>
            <Button onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" /> Imprimir / PDF
            </Button>
          </div>
        </DialogHeader>
        <div ref={printRef} className="overflow-auto">
          {receiptType === 'holerite' ? (
            <HoleriteContent employee={employee} entry={entry} month={referenceMonth} />
          ) : (
            <SimpleReceiptContent employee={employee} entry={entry} month={referenceMonth} type={receiptType} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}