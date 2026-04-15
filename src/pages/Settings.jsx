import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const INSS_TABLE = [
  { range: 'Até R$ 1.518,00', rate: '7,5%' },
  { range: 'R$ 1.518,01 a R$ 2.793,88', rate: '9%' },
  { range: 'R$ 2.793,89 a R$ 4.190,83', rate: '12%' },
  { range: 'R$ 4.190,84 a R$ 8.157,41', rate: '14%' },
];

const IRRF_TABLE = [
  { range: 'Até R$ 2.824,00', rate: 'Isento', deduction: '—' },
  { range: 'R$ 2.824,01 a R$ 3.751,05', rate: '7,5%', deduction: 'R$ 211,80' },
  { range: 'R$ 3.751,06 a R$ 4.664,68', rate: '15%', deduction: 'R$ 492,95' },
  { range: 'R$ 4.664,69 a R$ 6.101,06', rate: '22,5%', deduction: 'R$ 842,38' },
  { range: 'Acima de R$ 6.101,06', rate: '27,5%', deduction: 'R$ 1.147,23' },
];

export default function Settings() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Tabelas e parâmetros vigentes</p>
      </div>

      <div className="flex gap-2">
        <Badge variant="default">2026</Badge>
        <Badge variant="outline">INSS Progressivo</Badge>
        <Badge variant="outline">IRRF Progressivo</Badge>
        <Badge variant="outline">FGTS 8%</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Tabela INSS 2026 (Progressiva)</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2 text-muted-foreground font-medium">Faixa</th>
                  <th className="text-right pb-2 text-muted-foreground font-medium">Alíquota</th>
                </tr>
              </thead>
              <tbody className="space-y-2">
                {INSS_TABLE.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 text-foreground">{row.range}</td>
                    <td className="py-2 text-right font-mono font-semibold text-primary">{row.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Tabela IRRF 2026</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2 text-muted-foreground font-medium">Base de Cálculo</th>
                  <th className="text-right pb-2 text-muted-foreground font-medium">Alíquota</th>
                  <th className="text-right pb-2 text-muted-foreground font-medium">Dedução</th>
                </tr>
              </thead>
              <tbody>
                {IRRF_TABLE.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 text-foreground text-xs">{row.range}</td>
                    <td className="py-2 text-right font-mono font-semibold text-primary">{row.rate}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">{row.deduction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Outros Parâmetros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-muted/40 rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase">FGTS</p>
              <p className="text-xl font-bold text-primary mt-1">8%</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase">Dedução por Dependente</p>
              <p className="text-xl font-bold text-primary mt-1">R$ 189,59</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase">Salário Mínimo 2026</p>
              <p className="text-xl font-bold text-primary mt-1">R$ 1.518,00</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}