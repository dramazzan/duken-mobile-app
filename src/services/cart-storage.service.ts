import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CartLine } from '../lib/types';

const CART_STORAGE_KEY = 'duken.cart.v1';

function isValidCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const line = value as CartLine;
  return (
    Boolean(line.product?.id) &&
    Boolean(line.product?.name) &&
    typeof line.product.price === 'number' &&
    typeof line.product.quantity === 'number' &&
    Number.isInteger(line.quantity) &&
    line.quantity > 0
  );
}

export async function loadPersistedCart() {
  const rawCart = await AsyncStorage.getItem(CART_STORAGE_KEY);

  if (!rawCart) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawCart);
    return Array.isArray(parsed) ? parsed.filter(isValidCartLine) : [];
  } catch {
    return [];
  }
}

export async function savePersistedCart(cart: CartLine[]) {
  await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

export async function clearPersistedCart() {
  await AsyncStorage.removeItem(CART_STORAGE_KEY);
}
