import * as SecureStore from 'expo-secure-store';

import { supabase } from '../lib/supabase';
import type { ThemeMode } from '../lib/theme';
import type { Sale } from '../lib/types';
import type { CashRegisterResetInsert, CashRegisterResetRow, SaleItemRow, SaleRow } from '../types/database.types';
import { mapSaleWithItems } from './sales.service';

const themeStorageKey = 'duken_theme_mode';

type SaleWithItemsRow = SaleRow & {
  sale_items?: SaleItemRow[] | null;
};

export type CashRegisterSummary = {
  lastResetAt: string | null;
  totalAmount: number;
  cashAmount: number;
  transferAmount: number;
  salesCount: number;
};

function normalizeSupabaseError(message: string) {
  if (message.includes('deleted_at')) {
    return 'В Supabase не добавлено мягкое удаление истории. Выполните SQL migration supabase/migrations/202605110009_settings_and_deleted_sales.sql.';
  }

  if (
    message.includes("Could not find the table 'public.cash_register_resets'") ||
    (message.includes('public.cash_register_resets') && message.includes('schema cache'))
  ) {
    return 'В Supabase не создана таблица обнуления кассы. Выполните SQL migration supabase/migrations/202605110009_settings_and_deleted_sales.sql.';
  }

  return message;
}

export async function loadThemeMode(): Promise<ThemeMode> {
  const value = await SecureStore.getItemAsync(themeStorageKey);
  return value === 'dark' ? 'dark' : 'light';
}

export async function saveThemeMode(mode: ThemeMode) {
  await SecureStore.setItemAsync(themeStorageKey, mode);
}

async function getLatestCashReset() {
  const { data, error } = await supabase
    .from('cash_register_resets')
    .select('*')
    .order('reset_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(normalizeSupabaseError(error.message));
  }

  return data;
}

export async function getCashRegisterSummary(): Promise<CashRegisterSummary> {
  const latestReset = await getLatestCashReset();
  let query = supabase
    .from('sales')
    .select('id,total_amount,paid_amount,payment_method,status,created_at,deleted_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (latestReset?.reset_at) {
    query = query.gte('created_at', latestReset.reset_at);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(normalizeSupabaseError(error.message));
  }

  const rows = data ?? [];
  const paidRows = rows.filter((sale) => sale.status === 'paid');
  const cashRows = paidRows.filter((sale) => sale.payment_method === 'cash');
  const transferRows = paidRows.filter((sale) => sale.payment_method === 'transfer');
  const sumPaid = (sales: typeof rows) =>
    sales.reduce((sum, sale) => sum + Number(sale.paid_amount ?? sale.total_amount ?? 0), 0);

  return {
    lastResetAt: latestReset?.reset_at ?? null,
    totalAmount: sumPaid(paidRows),
    cashAmount: sumPaid(cashRows),
    transferAmount: sumPaid(transferRows),
    salesCount: paidRows.length,
  };
}

export async function resetCashRegister(summary: CashRegisterSummary) {
  const payload: CashRegisterResetInsert = {
    total_amount: summary.totalAmount,
    cash_amount: summary.cashAmount,
    transfer_amount: summary.transferAmount,
    sales_count: summary.salesCount,
  };

  const { data, error } = await supabase
    .from('cash_register_resets')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Не удалось обнулить кассу: ${normalizeSupabaseError(error.message)}`);
  }

  return data as CashRegisterResetRow;
}

export async function clearSalesHistory() {
  const { data, error } = await supabase
    .from('sales')
    .update({ deleted_at: new Date().toISOString() })
    .is('deleted_at', null)
    .select('id');

  if (error) {
    throw new Error(`Не удалось очистить историю: ${normalizeSupabaseError(error.message)}`);
  }

  return data?.length ?? 0;
}

export async function getDeletedSales(limit = 30): Promise<Sale[]> {
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Не удалось загрузить удаленную историю: ${normalizeSupabaseError(error.message)}`);
  }

  return ((data ?? []) as SaleWithItemsRow[]).map(mapSaleWithItems);
}

export async function restoreSaleHistory(saleId: string) {
  const { data, error } = await supabase
    .from('sales')
    .update({ deleted_at: null })
    .eq('id', saleId)
    .select('*, sale_items(*)')
    .single();

  if (error) {
    throw new Error(`Не удалось восстановить продажу: ${normalizeSupabaseError(error.message)}`);
  }

  return mapSaleWithItems(data as SaleWithItemsRow);
}

export async function restoreAllDeletedSales() {
  const { data, error } = await supabase
    .from('sales')
    .update({ deleted_at: null })
    .not('deleted_at', 'is', null)
    .select('id');

  if (error) {
    throw new Error(`Не удалось восстановить историю: ${normalizeSupabaseError(error.message)}`);
  }

  return data?.length ?? 0;
}
