'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardContent, Badge } from '@/components/ui';
import { useAppStore } from '@/stores/app-store';
import { Loader2, TrendingUp, Receipt, Wine, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';

interface AESummaryItem {
  ae_id: string;
  ae_name: string;
  ae_nickname: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_account_name: string | null;
  entry_count: number;
  total_subtotal: number;
  total_commission: number;
  total_tax: number;
  total_net: number;
  entries: Array<Record<string, unknown>>;
}

interface BottleSummaryItem {
  staff_id: string;
  staff_name: string;
  entry_count: number;
  total_bottles: number;
  total_net: number;
  entries: Array<Record<string, unknown>>;
}

interface SummaryData {
  month: string;
  ae_summary: AESummaryItem[];
  bottle_summary: BottleSummaryItem[];
  grand_total: {
    ae_total_net: number;
    ae_total_entries: number;
    bottle_total_net: number;
    bottle_total_entries: number;
    total_payout: number;
  };
}

function formatCurrency(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function CommissionDashboard() {
  const t = useTranslations('commission');
  const { currentStoreId } = useAppStore();
  const [month, setMonth] = useState(getCurrentMonth());
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedAE, setExpandedAE] = useState<string | null>(null);
  const [expandedBottle, setExpandedBottle] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (currentStoreId) params.set('store_id', currentStoreId);
      const res = await fetch(`/api/commission/summary?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [month, currentStoreId]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  return (
    <div className="space-y-4">
      {/* Month picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.month')}</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : !data ? (
        <p className="py-8 text-center text-gray-500">{t('dashboard.loadError')}</p>
      ) : (
        <>
          {/* Grand Total Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
                    <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">AE Commission</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {formatCurrency(data.grand_total.ae_total_net)}
                    </p>
                    <p className="text-xs text-gray-400">{data.grand_total.ae_total_entries} {t('dashboard.entries')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-900/30">
                    <Wine className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Bottle Commission</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {formatCurrency(data.grand_total.bottle_total_net)}
                    </p>
                    <p className="text-xs text-gray-400">{data.grand_total.bottle_total_entries} {t('dashboard.entries')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                    <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.totalPayout')}</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(data.grand_total.total_payout)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {data.grand_total.ae_total_entries + data.grand_total.bottle_total_entries} {t('dashboard.entries')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* AE Commission Summary */}
          <Card>
            <CardHeader title="AE Commission" />
            <CardContent>
              {data.ae_summary.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">{t('dashboard.noDataThisMonth')}</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {data.ae_summary.map((ae) => (
                    <div key={ae.ae_id}>
                      <button
                        onClick={() => setExpandedAE(expandedAE === ae.ae_id ? null : ae.ae_id)}
                        className="flex w-full items-center justify-between px-2 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {ae.ae_name}
                            {ae.ae_nickname && (
                              <span className="ml-1 text-sm text-gray-400">({ae.ae_nickname})</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {ae.entry_count} {t('dashboard.bills')} | {t('dashboard.subtotal')} {formatCurrency(ae.total_subtotal)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-right">
                          <div>
                            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                              {formatCurrency(ae.total_net)}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {t('dashboard.commission')} {formatCurrency(ae.total_commission)} - {t('dashboard.tax')} {formatCurrency(ae.total_tax)}
                            </p>
                          </div>
                          {expandedAE === ae.ae_id ? (
                            <ChevronUp className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {expandedAE === ae.ae_id && (
                        <div className="bg-gray-50 px-4 py-2 dark:bg-gray-800/30">
                          {/* Bank info */}
                          {ae.bank_name && (
                            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                              {t('dashboard.bank')}: {ae.bank_name} | {t('dashboard.accountNo')}: {ae.bank_account_no} | {t('dashboard.accountName')}: {ae.bank_account_name}
                            </p>
                          )}
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 dark:text-gray-400">
                                <th className="py-1 text-left">{t('dashboard.date')}</th>
                                <th className="py-1 text-left">{t('dashboard.receipt')}</th>
                                <th className="py-1 text-right">{t('dashboard.subtotal')}</th>
                                <th className="py-1 text-right">{t('dashboard.net')}</th>
                              </tr>
                            </thead>
                            <tbody className="text-gray-700 dark:text-gray-300">
                              {ae.entries.map((entry: Record<string, unknown>) => (
                                <tr key={entry.id as string} className="border-t border-gray-100 dark:border-gray-700">
                                  <td className="py-1">{entry.bill_date as string}</td>
                                  <td className="py-1">{(entry.receipt_no as string) || '-'}</td>
                                  <td className="py-1 text-right">{formatCurrency(Number(entry.subtotal_amount) || 0)}</td>
                                  <td className="py-1 text-right font-medium">{formatCurrency(Number(entry.net_amount) || 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottle Commission Summary */}
          <Card>
            <CardHeader title="Bottle Commission" />
            <CardContent>
              {data.bottle_summary.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">{t('dashboard.noDataThisMonth')}</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {data.bottle_summary.map((item) => (
                    <div key={item.staff_id}>
                      <button
                        onClick={() => setExpandedBottle(expandedBottle === item.staff_id ? null : item.staff_id)}
                        className="flex w-full items-center justify-between px-2 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{item.staff_name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {item.total_bottles} {t('dashboard.bottles')} | {item.entry_count} {t('dashboard.entries')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                            {formatCurrency(item.total_net)}
                          </p>
                          {expandedBottle === item.staff_id ? (
                            <ChevronUp className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {expandedBottle === item.staff_id && (
                        <div className="bg-gray-50 px-4 py-2 dark:bg-gray-800/30">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 dark:text-gray-400">
                                <th className="py-1 text-left">{t('dashboard.date')}</th>
                                <th className="py-1 text-left">{t('dashboard.receipt')}</th>
                                <th className="py-1 text-right">{t('dashboard.bottleCount')}</th>
                                <th className="py-1 text-right">{t('dashboard.amount')}</th>
                              </tr>
                            </thead>
                            <tbody className="text-gray-700 dark:text-gray-300">
                              {item.entries.map((entry: Record<string, unknown>) => (
                                <tr key={entry.id as string} className="border-t border-gray-100 dark:border-gray-700">
                                  <td className="py-1">{entry.bill_date as string}</td>
                                  <td className="py-1">{(entry.receipt_no as string) || '-'}</td>
                                  <td className="py-1 text-right">{Number(entry.bottle_count) || 0}</td>
                                  <td className="py-1 text-right font-medium">{formatCurrency(Number(entry.net_amount) || 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
