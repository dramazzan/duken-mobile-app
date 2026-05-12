import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import type { ProductCategory } from '../lib/types';
import type {
  ProductCategoryInsert,
  ProductCategoryRow,
  ProductCategoryUpdate,
} from '../types/database.types';

export type ProductCategoryRealtimePayload = RealtimePostgresChangesPayload<ProductCategoryRow>;

export function mapProductCategoryRow(row: ProductCategoryRow): ProductCategory {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeProductCategoryError(message: string) {
  if (
    message.includes("Could not find the table 'public.product_categories'") ||
    (message.includes('product_categories') && message.includes('schema cache'))
  ) {
    return 'В Supabase не создан справочник категорий. Выполните SQL migration supabase/migrations/202605110011_create_product_categories.sql и перезапустите приложение.';
  }

  if (
    message.includes("Could not find the 'category' column") ||
    (message.includes('category') && message.includes('schema cache'))
  ) {
    return 'В Supabase не добавлена категория товаров. Выполните SQL migration supabase/migrations/202605110010_add_product_categories.sql и перезапустите приложение.';
  }

  if (
    message.includes('duplicate key') ||
    message.includes('product_categories_name_unique_idx')
  ) {
    return 'Такая категория уже есть.';
  }

  return message;
}

export async function getAllProductCategories() {
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Не удалось загрузить категории: ${normalizeProductCategoryError(error.message)}`);
  }

  return (data ?? []).map(mapProductCategoryRow);
}

export async function createProductCategory(name: string) {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error('Введите название категории.');
  }

  const payload: ProductCategoryInsert = {
    name: normalizedName,
  };
  const { data, error } = await supabase
    .from('product_categories')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(normalizeProductCategoryError(error.message));
  }

  return mapProductCategoryRow(data);
}

export async function updateProductCategory(id: string, name: string) {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error('Введите название категории.');
  }

  const current = await getProductCategoryById(id);

  if (!current) {
    throw new Error('Категория не найдена.');
  }

  const payload: ProductCategoryUpdate = {
    name: normalizedName,
  };
  const { data, error } = await supabase
    .from('product_categories')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(normalizeProductCategoryError(error.message));
  }

  const { error: productsError } = await supabase
    .from('products')
    .update({ category: normalizedName })
    .eq('category', current.name);

  if (productsError) {
    throw new Error(`Не удалось обновить товары: ${normalizeProductCategoryError(productsError.message)}`);
  }

  return mapProductCategoryRow(data);
}

export async function deleteProductCategory(category: ProductCategory) {
  const { error: productsError } = await supabase
    .from('products')
    .update({ category: null })
    .eq('category', category.name);

  if (productsError) {
    throw new Error(`Не удалось обновить товары: ${normalizeProductCategoryError(productsError.message)}`);
  }

  const { error } = await supabase
    .from('product_categories')
    .delete()
    .eq('id', category.id);

  if (error) {
    throw new Error(`Не удалось удалить категорию: ${normalizeProductCategoryError(error.message)}`);
  }
}

async function getProductCategoryById(id: string) {
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось найти категорию: ${normalizeProductCategoryError(error.message)}`);
  }

  return data ? mapProductCategoryRow(data) : null;
}

export function subscribeToProductCategories(
  onChange: (payload: ProductCategoryRealtimePayload) => void
) {
  const channel = supabase
    .channel('product-categories-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'product_categories' },
      (payload) => onChange(payload as ProductCategoryRealtimePayload)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
