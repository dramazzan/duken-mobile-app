import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import type {
  CartLine,
  CustomerInfo,
  DebtorSummary,
  PaymentMethod,
  Sale,
  SaleFilter,
  SaleItem,
  SaleStatus,
} from '../lib/types';
import type { Json, SaleItemRow, SaleRow } from '../types/database.types';

type SaleWithItemsRow = SaleRow & {
  sale_items?: SaleItemRow[] | null;
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Наличные',
  transfer: 'Перевод',
  debt: 'Долг',
  home_payment: 'Оплата из дома',
};

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  paid: 'Оплачено',
  unpaid: 'Долг',
  pending: 'Ожидает',
};

export const SALE_FILTER_LABELS: Record<SaleFilter, string> = {
  all: 'Все',
  cash: 'Наличные',
  transfer: 'Перевод',
  debt: 'Долг',
  home_payment: 'Из дома',
  paid: 'Оплачено',
  unpaid: 'Не оплачено',
  pending: 'Ожидает',
};

function normalizeSupabaseError(message: string) {
  if (
    message.includes("Could not find the table 'public.sales'") ||
    message.includes("Could not find the table 'public.sale_items'") ||
    message.includes('public.sales') && message.includes('schema cache') ||
    message.includes('public.sale_items') && message.includes('schema cache')
  ) {
    return 'В Supabase не созданы таблицы продаж. Выполните SQL migration supabase/migrations/202605110003_create_sales.sql и перезапустите приложение.';
  }

  if (
    message.includes('Could not find the function public.create_sale') ||
    message.includes('create_sale') && message.includes('schema cache')
  ) {
    return 'В Supabase не создана функция create_sale. Выполните SQL migration supabase/migrations/202605110003_create_sales.sql и перезапустите приложение.';
  }

  if (
    message.includes('Could not find the function public.create_manual_debt') ||
    message.includes('create_manual_debt') && message.includes('schema cache')
  ) {
    return 'В Supabase не создана функция create_manual_debt. Выполните SQL migration supabase/migrations/202605110005_manual_debts.sql и перезапустите приложение.';
  }

  if (message.includes('not enough stock')) {
    return 'В Supabase еще действует старый запрет на продажу при нулевом остатке. Выполните обновленную SQL migration supabase/migrations/202605110003_create_sales.sql.';
  }

  if (message.includes('customer name is required')) {
    return 'Укажите имя клиента.';
  }

  if (message.includes('cart_items must be a non-empty array')) {
    return 'Корзина пустая.';
  }

  if (message.includes('total amount must be greater than zero')) {
    return 'Укажите сумму долга больше нуля.';
  }

  if (message.includes('invalid payment method')) {
    return 'Выберите корректный способ оплаты.';
  }

  return message;
}

export function mapSaleItemRow(row: SaleItemRow): SaleItem {
  return {
    id: row.id,
    saleId: row.sale_id,
    productId: row.product_id,
    productName: row.product_name,
    productBarcode: row.product_barcode,
    productImageUrl: row.product_image_url,
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
    lineTotal: Number(row.line_total),
    createdAt: row.created_at,
  };
}

export function mapSaleRow(row: SaleRow): Sale {
  return {
    id: row.id,
    saleNumber: row.sale_number,
    totalAmount: Number(row.total_amount),
    paymentMethod: row.payment_method,
    status: row.status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSaleWithItems(row: SaleWithItemsRow): Sale {
  return {
    ...mapSaleRow(row),
    items: (row.sale_items ?? []).map(mapSaleItemRow),
  };
}

function normalizeCustomerName(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ') || 'Клиент не указан';
}

function normalizeCustomerPhone(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ') || null;
}

function getCustomerKey(name: string | null | undefined, phone: string | null | undefined) {
  return `${normalizeCustomerName(name).toLocaleLowerCase('ru-RU')}|${normalizeCustomerPhone(phone) ?? ''}`;
}

function saleMatchesFilter(sale: Sale, filter: SaleFilter) {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'cash' || filter === 'transfer' || filter === 'debt' || filter === 'home_payment') {
    return sale.paymentMethod === filter;
  }

  return sale.status === filter;
}

function saleMatchesQuery(sale: Sale, query: string) {
  const term = query.trim().toLocaleLowerCase('ru-RU');

  if (!term) {
    return true;
  }

  const itemTexts = (sale.items ?? []).flatMap((item) => [
    item.productName,
    item.productBarcode ?? '',
  ]);

  const haystack = [
    sale.saleNumber,
    String(Math.round(sale.totalAmount)),
    PAYMENT_METHOD_LABELS[sale.paymentMethod],
    sale.paymentMethod,
    SALE_STATUS_LABELS[sale.status],
    sale.status,
    sale.customerName ?? '',
    sale.customerPhone ?? '',
    sale.comment ?? '',
    new Date(sale.createdAt).toLocaleString('ru-RU'),
    ...itemTexts,
  ]
    .join(' ')
    .toLocaleLowerCase('ru-RU');

  return haystack.includes(term);
}

export async function createSale(
  cartItems: CartLine[],
  paymentMethod: PaymentMethod,
  customerInfo: CustomerInfo = {}
) {
  try {
    const payload = cartItems.map((line) => ({
      product_id: line.product.id,
      quantity: line.quantity,
    })) as Json;

    const { data, error } = await supabase.rpc('create_sale', {
      cart_items: payload,
      payment_method: paymentMethod,
      customer_name: customerInfo.name?.trim() || null,
      customer_phone: customerInfo.phone?.trim() || null,
      sale_comment: customerInfo.comment?.trim() || null,
    });

    if (error) {
      throw new Error(normalizeSupabaseError(error.message));
    }

    return mapSaleRow(data);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Не удалось создать продажу.');
  }
}

export async function createManualDebt(input: {
  customerName: string;
  customerPhone?: string | null;
  totalAmount: number;
  comment?: string | null;
}) {
  try {
    const { data, error } = await supabase.rpc('create_manual_debt', {
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone?.trim() || null,
      total_amount: input.totalAmount,
      sale_comment: input.comment?.trim() || null,
    });

    if (error) {
      throw new Error(normalizeSupabaseError(error.message));
    }

    return mapSaleRow(data);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Не удалось добавить долг.');
  }
}

export async function getAllSales() {
  try {
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(normalizeSupabaseError(error.message));
    }

    return ((data ?? []) as SaleWithItemsRow[]).map(mapSaleWithItems);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Не удалось загрузить продажи.');
  }
}

export async function getSaleById(id: string) {
  try {
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(normalizeSupabaseError(error.message));
    }

    return mapSaleWithItems(data as SaleWithItemsRow);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Не удалось открыть продажу.');
  }
}

export async function searchSales(query = '', filter: SaleFilter = 'all') {
  try {
    const sales = await getAllSales();
    return sales.filter((sale) => saleMatchesFilter(sale, filter) && saleMatchesQuery(sale, query));
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Не удалось найти продажи.');
  }
}

export async function getSaleItems(saleId: string) {
  try {
    const { data, error } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(normalizeSupabaseError(error.message));
    }

    return (data ?? []).map(mapSaleItemRow);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Не удалось загрузить товары продажи.');
  }
}

export async function confirmSalePayment(saleId: string) {
  try {
    const { data, error } = await supabase
      .from('sales')
      .update({ status: 'paid' })
      .eq('id', saleId)
      .select('*')
      .single();

    if (error) {
      throw new Error(normalizeSupabaseError(error.message));
    }

    return mapSaleRow(data);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Не удалось подтвердить оплату.');
  }
}

export async function confirmSalesPayment(saleIds: string[]) {
  try {
    if (!saleIds.length) {
      return [];
    }

    const { data, error } = await supabase
      .from('sales')
      .update({ status: 'paid' })
      .in('id', saleIds)
      .select('*');

    if (error) {
      throw new Error(normalizeSupabaseError(error.message));
    }

    return (data ?? []).map(mapSaleRow);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Не удалось подтвердить оплаты.');
  }
}

export async function moveHomePaymentToDebt(saleId: string) {
  try {
    const { data, error } = await supabase
      .from('sales')
      .update({ payment_method: 'debt', status: 'unpaid' })
      .eq('id', saleId)
      .select('*')
      .single();

    if (error) {
      throw new Error(normalizeSupabaseError(error.message));
    }

    return mapSaleRow(data);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Не удалось переместить оплату в долг.');
  }
}

async function getSalesByPaymentAndStatus(paymentMethod: PaymentMethod, status: SaleStatus) {
  try {
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('payment_method', paymentMethod)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(normalizeSupabaseError(error.message));
    }

    return ((data ?? []) as SaleWithItemsRow[]).map(mapSaleWithItems);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Не удалось загрузить задолженности.');
  }
}

export function filterSalesBySmartQuery(sales: Sale[], query: string) {
  return sales.filter((sale) => saleMatchesQuery(sale, query));
}

export function groupSalesByCustomer(sales: Sale[], query = ''): DebtorSummary[] {
  const groups = new Map<string, DebtorSummary>();

  sales.forEach((sale) => {
    const name = normalizeCustomerName(sale.customerName);
    const phone = normalizeCustomerPhone(sale.customerPhone);
    const key = getCustomerKey(name, phone);
    const current = groups.get(key);

    if (current) {
      current.totalAmount += sale.totalAmount;
      current.salesCount += 1;
      current.sales.push(sale);

      if (new Date(sale.createdAt).getTime() > new Date(current.latestAt).getTime()) {
        current.latestAt = sale.createdAt;
      }

      return;
    }

    groups.set(key, {
      key,
      name,
      phone,
      totalAmount: sale.totalAmount,
      salesCount: 1,
      latestAt: sale.createdAt,
      sales: [sale],
    });
  });

  const term = query.trim().toLocaleLowerCase('ru-RU');
  const summaries = Array.from(groups.values()).map((group) => ({
    ...group,
    sales: [...group.sales].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    ),
  }));

  return summaries
    .filter((group) => {
      if (!term) {
        return true;
      }

      const groupHaystack = [
        group.name,
        group.phone ?? '',
        String(Math.round(group.totalAmount)),
        new Date(group.latestAt).toLocaleString('ru-RU'),
      ]
        .join(' ')
        .toLocaleLowerCase('ru-RU');

      return groupHaystack.includes(term) || group.sales.some((sale) => saleMatchesQuery(sale, query));
    })
    .sort((left, right) => new Date(right.latestAt).getTime() - new Date(left.latestAt).getTime());
}

export async function getDebts() {
  return getSalesByPaymentAndStatus('debt', 'unpaid');
}

export async function getDebtCustomers(query = '') {
  const debts = await getDebts();
  return groupSalesByCustomer(debts, query);
}

export async function getHomePayments() {
  return getSalesByPaymentAndStatus('home_payment', 'pending');
}

export async function getCustomerSuggestions(query = '') {
  const sales = await getAllSales();
  const withCustomer = sales.filter((sale) => sale.customerName?.trim());
  const customers = groupSalesByCustomer(withCustomer, query);
  const debtTotals = new Map(
    groupSalesByCustomer(
      withCustomer.filter((sale) => sale.paymentMethod === 'debt' && sale.status === 'unpaid')
    ).map((customer) => [customer.key, customer.totalAmount])
  );

  return customers
    .map((customer) => ({
      ...customer,
      totalAmount: debtTotals.get(customer.key) ?? 0,
    }))
    .slice(0, 12);
}

export function subscribeToSales(onChange: () => void) {
  const channels: RealtimeChannel[] = [
    supabase
      .channel(`sales-realtime-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, onChange)
      .subscribe(),
    supabase
      .channel(`sale-items-realtime-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, onChange)
      .subscribe(),
  ];

  return () => {
    channels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
  };
}
