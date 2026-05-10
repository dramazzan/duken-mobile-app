import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import type { Product, ProductInput } from '../lib/types';
import type { ProductInsert, ProductRow, ProductUpdate } from '../types/database.types';
import { uploadProductImage } from './storage.service';

export type ProductRealtimePayload = RealtimePostgresChangesPayload<ProductRow>;

export function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    price: Number(row.price),
    quantity: Number(row.quantity),
    imageUri: row.image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSupabaseError(message: string) {
  if (message.includes('duplicate key') || message.includes('products_barcode_key')) {
    return 'Такой штрих-код уже есть.';
  }

  if (
    message.includes("Could not find the table 'public.products'") ||
    message.includes('public.products') && message.includes('schema cache')
  ) {
    return 'В Supabase не создана таблица products. Откройте Supabase SQL Editor и выполните SQL из supabase/migrations/202605110001_create_products.sql, затем перезапустите приложение.';
  }

  if (
    message.includes('Could not find the function public.decrease_product') ||
    message.includes('decrease_product') && message.includes('schema cache')
  ) {
    return 'В Supabase не созданы функции списания остатков. Выполните SQL migration supabase/migrations/202605110001_create_products.sql и перезапустите приложение.';
  }

  return message;
}

export async function getAllProducts(searchTerm = '') {
  const term = searchTerm.trim();
  let query = supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true })
    .order('created_at', { ascending: false });

  if (term) {
    const escapedTerm = term.replaceAll('%', '\\%').replaceAll('_', '\\_');
    query = query.or(`name.ilike.%${escapedTerm}%,barcode.ilike.%${escapedTerm}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Не удалось загрузить товары: ${normalizeSupabaseError(error.message)}`);
  }

  return (data ?? []).map(mapProductRow);
}

export async function getProductById(id: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось найти товар: ${normalizeSupabaseError(error.message)}`);
  }

  return data ? mapProductRow(data) : null;
}

export async function getProductByBarcode(barcode: string | null | undefined) {
  const normalizedBarcode = barcode?.trim();

  if (!normalizedBarcode) {
    return null;
  }

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('barcode', normalizedBarcode)
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось найти товар: ${normalizeSupabaseError(error.message)}`);
  }

  return data ? mapProductRow(data) : null;
}

export async function createProduct(input: ProductInput) {
  const imageUrl = input.imageUri
    ? await uploadProductImage(input.imageUri, input.barcode ?? input.name)
    : null;
  const payload: ProductInsert = {
    name: input.name.trim(),
    barcode: input.barcode?.trim() || null,
    price: input.price,
    quantity: input.quantity,
    image_url: imageUrl,
  };

  const { data, error } = await supabase
    .from('products')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(normalizeSupabaseError(error.message));
  }

  return mapProductRow(data);
}

export async function updateProduct(id: string, input: ProductInput) {
  const imageUrl = input.imageUri
    ? await uploadProductImage(input.imageUri, id)
    : null;
  const payload: ProductUpdate = {
    name: input.name.trim(),
    barcode: input.barcode?.trim() || null,
    price: input.price,
    quantity: input.quantity,
    image_url: imageUrl,
  };

  const { data, error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(normalizeSupabaseError(error.message));
  }

  return mapProductRow(data);
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from('products').delete().eq('id', id);

  if (error) {
    throw new Error(`Не удалось удалить товар: ${normalizeSupabaseError(error.message)}`);
  }
}

export async function decreaseProductQuantity(productId: string, amount: number) {
  const { data, error } = await supabase.rpc('decrease_product_quantity', {
    product_id: productId,
    amount,
  });

  if (error) {
    throw new Error(`Не удалось обновить остаток: ${normalizeSupabaseError(error.message)}`);
  }

  return mapProductRow(data);
}

export async function decreaseProductsQuantity(
  lines: Array<{ productId: string; amount: number }>
) {
  const items = lines.map((line) => ({
    product_id: line.productId,
    amount: line.amount,
  }));
  const { data, error } = await supabase.rpc('decrease_product_quantities', {
    items,
  });

  if (error) {
    throw new Error(`Не удалось обновить остатки: ${normalizeSupabaseError(error.message)}`);
  }

  return (data ?? []).map(mapProductRow);
}

export function subscribeToProducts(onChange: (payload: ProductRealtimePayload) => void) {
  const channel = supabase
    .channel('products-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products' },
      (payload) => onChange(payload as ProductRealtimePayload)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
