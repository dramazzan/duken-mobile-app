import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import type { Expense, ExpenseCategory, ExpenseInput } from '../lib/types';
import type { ExpenseInsert, ExpenseRow } from '../types/database.types';

export type ExpenseRealtimePayload = RealtimePostgresChangesPayload<ExpenseRow>;

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  purchase: 'Закуп товара',
  rent: 'Аренда',
  salary: 'Зарплата',
  delivery: 'Доставка',
  utility: 'Коммунальные',
  other: 'Другое',
};

function normalizeSupabaseError(message: string) {
  if (
    message.includes("Could not find the table 'public.expenses'") ||
    (message.includes('public.expenses') && message.includes('schema cache'))
  ) {
    return 'В Supabase не создана таблица расходов. Выполните SQL migration supabase/migrations/202605110007_create_expenses.sql и перезапустите приложение.';
  }

  if (message.includes('amount') && message.includes('check')) {
    return 'Укажите сумму расхода больше нуля.';
  }

  if (message.includes('category') && message.includes('check')) {
    return 'Выберите корректную категорию расхода.';
  }

  return message;
}

export function mapExpenseRow(row: ExpenseRow): Expense {
  return {
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    category: row.category,
    comment: row.comment,
    expenseDate: row.expense_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createExpense(input: ExpenseInput) {
  const payload: ExpenseInsert = {
    title: input.title.trim(),
    amount: input.amount,
    category: input.category,
    comment: input.comment?.trim() || null,
    expense_date: input.expenseDate,
  };

  const { data, error } = await supabase
    .from('expenses')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Не удалось записать расход: ${normalizeSupabaseError(error.message)}`);
  }

  return mapExpenseRow(data);
}

export async function getAllExpenses() {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Не удалось загрузить расходы: ${normalizeSupabaseError(error.message)}`);
  }

  return (data ?? []).map(mapExpenseRow);
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.from('expenses').delete().eq('id', id);

  if (error) {
    throw new Error(`Не удалось удалить расход: ${normalizeSupabaseError(error.message)}`);
  }
}

export function subscribeToExpenses(onChange: (payload: ExpenseRealtimePayload) => void) {
  const channel = supabase
    .channel('expenses-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expenses' },
      (payload) => onChange(payload as ExpenseRealtimePayload)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
