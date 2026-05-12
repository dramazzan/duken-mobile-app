import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import type { Seller, SellerInput } from '../lib/types';
import type { SellerInsert, SellerRow, SellerUpdate } from '../types/database.types';

export type SellerRealtimePayload = RealtimePostgresChangesPayload<SellerRow>;

function normalizeSupabaseError(message: string) {
  if (
    message.includes("Could not find the table 'public.sellers'") ||
    (message.includes('public.sellers') && message.includes('schema cache'))
  ) {
    return 'В Supabase не создана таблица продавцов. Выполните SQL migration supabase/migrations/202605110008_create_sellers.sql и перезапустите приложение.';
  }

  if (
    message.includes('Could not find the function public.set_default_seller') ||
    (message.includes('set_default_seller') && message.includes('schema cache'))
  ) {
    return 'В Supabase не создана функция продавца по умолчанию. Выполните SQL migration supabase/migrations/202605110008_create_sellers.sql.';
  }

  if (message.includes('duplicate key') && message.includes('sellers_single_default_idx')) {
    return 'Продавец по умолчанию уже выбран.';
  }

  if (message.includes('seller not found')) {
    return 'Продавец не найден или отключен.';
  }

  return message;
}

export function mapSellerRow(row: SellerRow): Seller {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    isActive: row.is_active,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAllSellers() {
  const { data, error } = await supabase
    .from('sellers')
    .select('*')
    .order('is_active', { ascending: false })
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Не удалось загрузить продавцов: ${normalizeSupabaseError(error.message)}`);
  }

  return (data ?? []).map(mapSellerRow);
}

export async function createSeller(input: SellerInput) {
  const payload: SellerInsert = {
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    is_active: input.isActive ?? true,
  };

  const { data, error } = await supabase
    .from('sellers')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Не удалось добавить продавца: ${normalizeSupabaseError(error.message)}`);
  }

  return mapSellerRow(data);
}

export async function updateSeller(id: string, input: SellerInput) {
  const payload: SellerUpdate = {
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    is_active: input.isActive ?? true,
  };

  const { data, error } = await supabase
    .from('sellers')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Не удалось обновить продавца: ${normalizeSupabaseError(error.message)}`);
  }

  return mapSellerRow(data);
}

export async function setDefaultSeller(id: string) {
  const { data, error } = await supabase.rpc('set_default_seller', {
    seller_id: id,
  });

  if (error) {
    throw new Error(`Не удалось выбрать продавца по умолчанию: ${normalizeSupabaseError(error.message)}`);
  }

  return mapSellerRow(data);
}

export function getDefaultSeller(sellers: Seller[]) {
  return sellers.find((seller) => seller.isActive && seller.isDefault) ??
    sellers.find((seller) => seller.isActive) ??
    null;
}

export function subscribeToSellers(onChange: (payload: SellerRealtimePayload) => void) {
  const channel = supabase
    .channel('sellers-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sellers' },
      (payload) => onChange(payload as SellerRealtimePayload)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
