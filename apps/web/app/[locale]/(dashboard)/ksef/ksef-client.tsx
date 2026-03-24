'use client';

import { useState, useId } from 'react';
import { useTranslations } from 'next-intl';
import {
  FileText,
  Plus,
  Trash2,
  Send,
  Save,
  Download,
  Eye,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Wifi,
  WifiOff,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  useInvoices,
  useCreateInvoice,
  useSubmitInvoice,
  useGtuCodes,
  useKsefStatus,
  type Invoice,
  type InvoiceStatus,
  type InvoiceLine,
  type InvoiceType,
  type PaymentMethod,
  type VatRate,
  type CreateInvoicePayload,
} from '@/hooks/use-ksef';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TabKey = 'invoices' | 'createInvoice' | 'gtuCodes' | 'status';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatPln(grosze: number): string {
  return (grosze / 100).toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: InvoiceStatus;
  t: ReturnType<typeof useTranslations<'dashboard.ksef'>>;
}

function StatusBadge({ status, t }: StatusBadgeProps) {
  const config: Record<InvoiceStatus, { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }> = {
    draft: {
      label: t('draft'),
      className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      Icon: FileText,
    },
    pending: {
      label: t('pending'),
      className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      Icon: Clock,
    },
    submitted: {
      label: t('submitted'),
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      Icon: Send,
    },
    accepted: {
      label: t('accepted'),
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      Icon: CheckCircle2,
    },
    rejected: {
      label: t('rejected'),
      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      Icon: XCircle,
    },
    offline: {
      label: t('offline'),
      className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      Icon: AlertCircle,
    },
  };

  const { label, className, Icon } = config[status] ?? config.draft;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InvoicesTab
// ─────────────────────────────────────────────────────────────────────────────

function InvoicesTab({ t }: { t: ReturnType<typeof useTranslations<'dashboard.ksef'>> }) {
  const { data, isLoading, error, refetch } = useInvoices();

  const invoices = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10 p-6 text-center">
        <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-red-700 dark:text-red-400">{error.message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" />
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('noInvoices')}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-800">
          <tr>
            {[
              t('invoiceNumber'),
              t('date'),
              t('buyerNip'),
              t('netAmount'),
              t('vatAmount'),
              t('grossAmount'),
              t('status'),
              t('ksefNumber'),
              '',
            ].map((col, i) => (
              <th
                key={i}
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {invoices.map((inv) => (
            <InvoiceRow key={inv.id} invoice={inv} t={t} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InvoiceRow (separated so useSubmitInvoice gets stable id)
// ─────────────────────────────────────────────────────────────────────────────

function InvoiceRow({
  invoice,
  t,
}: {
  invoice: Invoice;
  t: ReturnType<typeof useTranslations<'dashboard.ksef'>>;
}) {
  const submit = useSubmitInvoice(invoice.id);

  return (
    <tr className="bg-white dark:bg-slate-950/50 hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors">
      <td className="px-4 py-3">
        <span className="font-medium text-slate-900 dark:text-white text-xs">
          {invoice.invoiceNumber}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {formatDate(invoice.issueDate)}
      </td>
      <td className="px-4 py-3 text-xs font-mono text-slate-600 dark:text-slate-300">
        {invoice.buyerNip}
      </td>
      <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">
        {formatPln(invoice.netTotal)} PLN
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {formatPln(invoice.vatTotal)} PLN
      </td>
      <td className="px-4 py-3 text-xs font-semibold text-slate-900 dark:text-white whitespace-nowrap">
        {formatPln(invoice.grossTotal)} PLN
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={invoice.status} t={t} />
      </td>
      <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400 max-w-[120px] truncate">
        {invoice.ksefNumber ?? '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={t('preview')}
            className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t('download')}
            className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          {(invoice.status === 'draft' || invoice.status === 'offline') && (
            <button
              type="button"
              title={t('submitToKsef')}
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
              className="rounded p-1 text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
            >
              {submit.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Line item state
// ─────────────────────────────────────────────────────────────────────────────

interface LineItemState {
  productName: string;
  quantity: string;
  unitPriceNet: string;
  vatRate: VatRate;
}

function emptyLine(): LineItemState {
  return { productName: '', quantity: '1', unitPriceNet: '', vatRate: 23 };
}

function calcLine(line: LineItemState): { net: number; gross: number } {
  const qty = parseFloat(line.quantity) || 0;
  const price = parseFloat(line.unitPriceNet) || 0;
  const net = qty * price;
  const gross = net * (1 + line.vatRate / 100);
  return { net, gross };
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateInvoiceTab
// ─────────────────────────────────────────────────────────────────────────────

function CreateInvoiceTab({ t }: { t: ReturnType<typeof useTranslations<'dashboard.ksef'>> }) {
  const formId = useId();
  const createInvoice = useCreateInvoice();

  const [invoiceType, setInvoiceType] = useState<InvoiceType>('VAT');
  const [buyerNip, setBuyerNip] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [lines, setLines] = useState<LineItemState[]>([emptyLine()]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('przelew');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [nipValidating, setNipValidating] = useState(false);
  const [nipStatus, setNipStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');

  // Totals
  const totals = lines.reduce(
    (acc, line) => {
      const { net, gross } = calcLine(line);
      return { net: acc.net + net, gross: acc.gross + gross };
    },
    { net: 0, gross: 0 },
  );
  const vatTotal = totals.gross - totals.net;

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, key: keyof LineItemState, value: string | VatRate) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)),
    );
  }

  async function handleValidateNip() {
    if (!buyerNip.trim()) return;
    setNipValidating(true);
    // Simulate VIES validation call
    try {
      const resp = await fetch(`/api/v1/verification/vies?vat=${encodeURIComponent(buyerNip)}&countryCode=PL`);
      if (resp.ok) {
        const json = await resp.json() as { valid?: boolean; name?: string; address?: string };
        if (json.valid) {
          setNipStatus('valid');
          if (json.name) setBuyerName(json.name);
          if (json.address) setBuyerAddress(json.address);
        } else {
          setNipStatus('invalid');
        }
      } else {
        setNipStatus('invalid');
      }
    } catch {
      setNipStatus('invalid');
    } finally {
      setNipValidating(false);
    }
  }

  function buildPayload(asDraft: boolean): CreateInvoicePayload {
    return {
      invoiceType,
      issueDate,
      dueDate,
      buyerNip: buyerNip.trim(),
      buyerName: buyerName.trim(),
      buyerAddress: buyerAddress.trim(),
      paymentMethod,
      lines: lines.map((l) => ({
        productName: l.productName,
        quantity: parseFloat(l.quantity) || 0,
        unitPriceNet: Math.round(parseFloat(l.unitPriceNet) * 100) || 0,
        vatRate: l.vatRate,
      })),
    };
  }

  function handleSaveDraft(e: React.FormEvent) {
    e.preventDefault();
    createInvoice.mutate(buildPayload(true));
  }

  function handleSubmitToKsef(e: React.MouseEvent) {
    e.preventDefault();
    createInvoice.mutate(buildPayload(false));
  }

  const inputCls = 'h-8 text-xs px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 w-full';
  const labelCls = 'block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1';

  return (
    <form onSubmit={handleSaveDraft} className="space-y-5">
      {/* Invoice type */}
      <div className="flex gap-2">
        {(['VAT', 'KOR', 'ZAL'] as InvoiceType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setInvoiceType(type)}
            className={cn(
              'rounded-lg border px-4 py-2 text-xs font-semibold transition-all',
              invoiceType === type
                ? 'border-brand-500 bg-brand-600/10 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600',
            )}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Buyer section */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Nabywca
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-nip`} className={labelCls}>
              {t('buyerNip')}
            </label>
            <div className="flex gap-2">
              <Input
                id={`${formId}-nip`}
                value={buyerNip}
                onChange={(e) => {
                  setBuyerNip(e.target.value);
                  setNipStatus('idle');
                }}
                placeholder="0000000000"
                className="h-9 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={nipValidating || !buyerNip.trim()}
                onClick={() => void handleValidateNip()}
                className="shrink-0"
              >
                {nipValidating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : nipStatus === 'valid' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                ) : nipStatus === 'invalid' ? (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                ) : null}
                <span className="ml-1">{t('validateNip')}</span>
              </Button>
            </div>
          </div>
          <div>
            <label htmlFor={`${formId}-buyerName`} className={labelCls}>
              Nazwa nabywcy
            </label>
            <Input
              id={`${formId}-buyerName`}
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${formId}-buyerAddress`} className={labelCls}>
              Adres
            </label>
            <Input
              id={`${formId}-buyerAddress`}
              value={buyerAddress}
              onChange={(e) => setBuyerAddress(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Dates & payment */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${formId}-issueDate`} className={labelCls}>
            {t('issueDate')}
          </label>
          <input
            id={`${formId}-issueDate`}
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-dueDate`} className={labelCls}>
            {t('dueDate')}
          </label>
          <input
            id={`${formId}-dueDate`}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-payment`} className={labelCls}>
            {t('paymentMethod')}
          </label>
          <select
            id={`${formId}-payment`}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className={inputCls}
          >
            <option value="przelew">Przelew</option>
            <option value="gotowka">Gotówka</option>
            <option value="karta">Karta</option>
            <option value="blik">BLIK</option>
          </select>
        </div>
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-900/80 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Pozycje
          </h3>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {t('addLine')}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-100 dark:border-slate-800">
              <tr>
                {[t('productName'), t('quantity'), t('unitPrice'), t('vatRate'), t('netAmount'), t('grossAmount'), ''].map((col, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lines.map((line, idx) => {
                const { net, gross } = calcLine(line);
                return (
                  <tr key={idx} className="bg-white dark:bg-slate-950/50">
                    <td className="px-3 py-2 min-w-[160px]">
                      <input
                        type="text"
                        value={line.productName}
                        onChange={(e) => updateLine(idx, 'productName', e.target.value)}
                        placeholder={t('productName')}
                        className={inputCls}
                      />
                    </td>
                    <td className="px-3 py-2 w-20">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                        className={inputCls}
                      />
                    </td>
                    <td className="px-3 py-2 w-28">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPriceNet}
                        onChange={(e) => updateLine(idx, 'unitPriceNet', e.target.value)}
                        className={inputCls}
                      />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <select
                        value={line.vatRate}
                        onChange={(e) => updateLine(idx, 'vatRate', Number(e.target.value) as VatRate)}
                        className={inputCls}
                      >
                        <option value={23}>23%</option>
                        <option value={8}>8%</option>
                        <option value={5}>5%</option>
                        <option value={0}>0%</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 w-28 text-right font-medium text-slate-700 dark:text-slate-200">
                      {net.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 w-28 text-right font-semibold text-slate-900 dark:text-white">
                      {gross.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 w-10">
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="rounded p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {t('netAmount')}:
                </td>
                <td className="px-3 py-2 text-right text-xs font-bold text-slate-900 dark:text-white">
                  {totals.net.toFixed(2)} PLN
                </td>
                <td colSpan={2} />
              </tr>
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {t('vatAmount')}:
                </td>
                <td className="px-3 py-2 text-right text-xs font-bold text-slate-900 dark:text-white">
                  {vatTotal.toFixed(2)} PLN
                </td>
                <td colSpan={2} />
              </tr>
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t('grossAmount')}:
                </td>
                <td className="px-3 py-2 text-right text-sm font-black text-slate-900 dark:text-white">
                  {totals.gross.toFixed(2)} PLN
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {createInvoice.error && (
        <p className="text-xs text-red-600 dark:text-red-400">{createInvoice.error.message}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <Button type="submit" variant="outline" size="sm" disabled={createInvoice.isPending}>
          {createInvoice.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-2" />
          )}
          {t('saveDraft')}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={createInvoice.isPending}
          onClick={(e) => void handleSubmitToKsef(e)}
        >
          {createInvoice.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5 mr-2" />
          )}
          {t('submitToKsef')}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GtuCodesTab
// ─────────────────────────────────────────────────────────────────────────────

function GtuCodesTab({ t }: { t: ReturnType<typeof useTranslations<'dashboard.ksef'>> }) {
  const { data, isLoading, error } = useGtuCodes();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10 p-6 text-center">
        <p className="text-sm text-red-700 dark:text-red-400">{error.message}</p>
      </div>
    );
  }

  const codes = data ?? [];

  // Fallback static data when API is not yet connected
  const displayCodes =
    codes.length > 0
      ? codes
      : [
          { code: 'GTU_01', description: 'Alkohol etylowy', whenToUse: 'Napoje alkoholowe, wyroby tytoniowe' },
          { code: 'GTU_02', description: 'Paliwa silnikowe', whenToUse: 'Benzyna, diesel, LPG' },
          { code: 'GTU_03', description: 'Olej opałowy', whenToUse: 'Oleje do ogrzewania' },
          { code: 'GTU_04', description: 'Tabak i papierosy', whenToUse: 'Wyroby tytoniowe' },
          { code: 'GTU_05', description: 'Odpady niebezpieczne', whenToUse: 'Odpad z metali szlachetnych' },
          { code: 'GTU_06', description: 'Urządzenia elektroniczne', whenToUse: 'Smartfony, tablety, laptopy' },
          { code: 'GTU_07', description: 'Pojazdy', whenToUse: 'Samochody, motocykle' },
          { code: 'GTU_08', description: 'Metale szlachetne', whenToUse: 'Złoto, srebro' },
          { code: 'GTU_09', description: 'Usługi budowlane', whenToUse: 'Roboty budowlane' },
          { code: 'GTU_10', description: 'Nieruchomości', whenToUse: 'Najem nieruchomości' },
          { code: 'GTU_11', description: 'Usługi niematerialne', whenToUse: 'Licencje, prawa, usługi doradcze' },
          { code: 'GTU_12', description: 'Usługi przewozu osób', whenToUse: 'Transport pasażerski' },
          { code: 'GTU_13', description: 'Usługi transportowe', whenToUse: 'Transport towarów, logistyka' },
        ];

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-800">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">
              Kod
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Opis
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Kiedy stosować
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {displayCodes.map((gtu) => (
            <tr
              key={gtu.code}
              className="bg-white dark:bg-slate-950/50 hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors"
            >
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-md bg-brand-600/10 px-2 py-1 text-xs font-bold text-brand-700 dark:text-brand-300">
                  {gtu.code}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                {gtu.description}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                {gtu.whenToUse}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusTab
// ─────────────────────────────────────────────────────────────────────────────

function StatusTab({ t }: { t: ReturnType<typeof useTranslations<'dashboard.ksef'>> }) {
  const { data, isLoading, refetch, dataUpdatedAt } = useKsefStatus();

  const lastChecked = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('pl-PL')
    : '—';

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('status')}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => void refetch()}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {isLoading && !data ? (
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            <span className="text-sm text-slate-500 dark:text-slate-400">Sprawdzanie...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Connection indicator */}
            <div className="flex items-center gap-3">
              {data?.connected ? (
                <>
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <Wifi className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-white dark:border-slate-900" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                      Połączono z KSeF
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      System dostępny
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                    <WifiOff className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                      Brak połączenia z KSeF
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {data?.message ?? 'System niedostępny'}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Ostatnie sprawdzenie: <span className="font-medium text-slate-500 dark:text-slate-400">{lastChecked}</span>
              </p>
              {data?.lastChecked && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Serwer KSeF: {new Date(data.lastChecked).toLocaleString('pl-PL')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main KsefClient
// ─────────────────────────────────────────────────────────────────────────────

export function KsefClient() {
  const t = useTranslations('dashboard.ksef');
  const [activeTab, setActiveTab] = useState<TabKey>('invoices');

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'invoices', label: t('invoices') },
    { key: 'createInvoice', label: t('createInvoice') },
    { key: 'gtuCodes', label: t('gtuCodes') },
    { key: 'status', label: t('status') },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600/15">
          <FileText className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {t('title')}
        </h1>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-100 dark:border-slate-800 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'text-slate-900 dark:text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-brand-500 after:rounded-t-full'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'invoices' && <InvoicesTab t={t} />}
        {activeTab === 'createInvoice' && <CreateInvoiceTab t={t} />}
        {activeTab === 'gtuCodes' && <GtuCodesTab t={t} />}
        {activeTab === 'status' && <StatusTab t={t} />}
      </div>
    </div>
  );
}
