import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Barcode, Minus, Plus, ScanLine, Search, ShoppingCart, Trash2 } from 'lucide-react-native';

import { ActionButton } from '../components/ActionButton';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { formatMoney } from '../lib/format';
import { colors, shadow } from '../lib/theme';
import {
  decreaseProductsQuantity,
  getAllProducts,
  getProductByBarcode,
  getProductById,
  mapProductRow,
  subscribeToProducts,
} from '../services/products.service';
import type { CartLine, Product } from '../lib/types';

type CashierScreenProps = {
  cart: CartLine[];
  setCart: Dispatch<SetStateAction<CartLine[]>>;
  onAddUnknownBarcode: (barcode: string) => void;
  onInventoryChanged: () => void;
};

function isSameProduct(left: Product, right: Product) {
  return (
    left.id === right.id ||
    Boolean(left.barcode && right.barcode && left.barcode === right.barcode)
  );
}

function CounterButton({
  label,
  onPress,
  danger = false,
}: {
  label: React.ReactNode;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.counterButton,
        danger ? styles.counterDanger : null,
        pressed ? styles.counterPressed : null,
      ]}
    >
      {label}
    </Pressable>
  );
}

export function CashierScreen({
  cart,
  setCart,
  onAddUnknownBarcode,
  onInventoryChanged,
}: CashierScreenProps) {
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [manualResults, setManualResults] = useState<Product[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [cart]
  );

  useEffect(() => {
    return subscribeToProducts((payload) => {
      if (payload.eventType === 'DELETE') {
        const deletedId = payload.old.id;
        setCart((current) => current.filter((line) => line.product.id !== deletedId));
        return;
      }

      const updatedProduct = mapProductRow(payload.new);
      setCart((current) =>
        current.map((line) =>
          isSameProduct(line.product, updatedProduct)
            ? { ...line, product: updatedProduct }
            : line
        )
      );
    });
  }, [setCart]);

  useEffect(() => {
    const term = manualSearch.trim();
    let cancelled = false;

    if (term.length < 2) {
      setManualResults([]);
      setManualError(null);
      setManualLoading(false);
      return;
    }

    setManualLoading(true);
    setManualError(null);

    const timeout = setTimeout(async () => {
      try {
        const rows = await getAllProducts(term);

        if (!cancelled) {
          setManualResults(rows.slice(0, 8));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось найти товары.';

        if (!cancelled) {
          setManualError(message);
          setManualResults([]);
        }
      } finally {
        if (!cancelled) {
          setManualLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [manualSearch]);

  const addProductToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => isSameProduct(line.product, product));

      if (existing) {
        return current.map((line) =>
          isSameProduct(line.product, product)
            ? { ...line, product, quantity: line.quantity + 1 }
            : line
        );
      }

      return [...current, { product, quantity: 1 }];
    });
  };

  const addManualProduct = (product: Product) => {
    addProductToCart(product);
    setManualSearch('');
    setManualResults([]);
    setManualError(null);
  };

  const handleScanned = async (barcode: string) => {
    setScannerVisible(false);

    try {
      setScanLoading(true);
      const product = await getProductByBarcode(barcode);

      if (product) {
        addProductToCart(product);
        return;
      }

      Alert.alert('Товар не найден', `Штрих-код ${barcode} отсутствует в базе.`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Добавить товар', onPress: () => onAddUnknownBarcode(barcode) },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось найти товар.';
      Alert.alert('Ошибка сканирования', message);
    } finally {
      setScanLoading(false);
    }
  };

  const increment = (productId: string) => {
    setCart((current) =>
      current.map((line) =>
        line.product.id === productId ? { ...line, quantity: line.quantity + 1 } : line
      )
    );
  };

  const decrement = (productId: string) => {
    setCart((current) =>
      current
        .map((line) =>
          line.product.id === productId ? { ...line, quantity: line.quantity - 1 } : line
        )
        .filter((line) => line.quantity > 0)
    );
  };

  const removeLine = (productId: string) => {
    setCart((current) => current.filter((line) => line.product.id !== productId));
  };

  const clearCart = () => {
    if (!cart.length) {
      return;
    }

    Alert.alert('Очистить корзину?', 'Все позиции будут удалены.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Очистить', style: 'destructive', onPress: () => setCart([]) },
    ]);
  };

  const finishSale = async () => {
    if (!cart.length) {
      Alert.alert('Корзина пустая', 'Сначала добавьте товары сканированием.');
      return;
    }

    try {
      setCompleting(true);
      await decreaseProductsQuantity(
        cart.map((line) => ({
          productId: line.product.id,
          amount: line.quantity,
        }))
      );
      Alert.alert('Продажа завершена', `Итого: ${formatMoney(total)}`);
      setCart([]);
      onInventoryChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось завершить продажу.';
      Alert.alert('Ошибка продажи', message);
    } finally {
      setCompleting(false);
    }
  };

  const confirmSale = async () => {
    if (!cart.length) {
      Alert.alert('Корзина пустая', 'Сначала добавьте товары сканированием.');
      return;
    }

    try {
      const latestProducts = await Promise.all(
        cart.map((line) => getProductById(line.product.id))
      );
      const shortages = cart
        .map((line, index) => ({
          line,
          stock: latestProducts[index]?.quantity ?? 0,
        }))
        .filter(({ line, stock }) => line.quantity > stock);

      if (!shortages.length) {
        await finishSale();
        return;
      }

      const shortageText = shortages
        .map(
          ({ line, stock }, index) =>
            `${index + 1}. ${line.product.name}: в корзине ${line.quantity}, остаток ${stock}`
        )
        .join('\n');

      Alert.alert(
        'Не хватает остатков',
        `${shortageText}\n\nПродажа уведет остаток в минус.`,
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Все равно продать', style: 'destructive', onPress: finishSale },
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось проверить остатки.';
      Alert.alert('Ошибка продажи', message);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Касса</Text>
          </View>
          <View style={styles.cartBadge}>
            <ShoppingCart color={colors.primary} size={22} />
            <Text style={styles.cartBadgeText}>{cart.length}</Text>
          </View>
        </View>

        <ActionButton
          icon={<ScanLine color="#FFFFFF" size={28} />}
          label={scanLoading ? 'Ищем товар...' : 'Сканировать товар'}
          loading={scanLoading}
          onPress={() => setScannerVisible(true)}
          style={styles.scanMain}
        />

        <View style={styles.manualPanel}>
          <Text style={styles.sectionTitle}>Добавить вручную</Text>
          <View style={styles.searchWrap}>
            <Search color={colors.muted} size={21} />
            <TextInput
              autoCapitalize="none"
              onChangeText={setManualSearch}
              placeholder="Найти товар по названию"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              value={manualSearch}
            />
            {manualLoading ? <ActivityIndicator color={colors.primary} /> : null}
          </View>

          {manualError ? (
            <Text style={styles.manualError}>{manualError}</Text>
          ) : null}

          {manualSearch.trim().length >= 2 && !manualLoading && !manualResults.length && !manualError ? (
            <Text style={styles.manualEmpty}>Ничего не найдено</Text>
          ) : null}

          {manualResults.length ? (
            <View style={styles.manualResults}>
              {manualResults.map((product) => (
                <Pressable
                  accessibilityRole="button"
                  key={product.id}
                  onPress={() => addManualProduct(product)}
                  style={({ pressed }) => [
                    styles.manualResult,
                    pressed ? styles.manualResultPressed : null,
                  ]}
                >
                  <View style={styles.manualImage}>
                    {product.imageUri ? (
                      <Image source={{ uri: product.imageUri }} style={styles.image} />
                    ) : (
                      <Barcode color={colors.muted} size={22} />
                    )}
                  </View>
                  <View style={styles.manualInfo}>
                    <Text numberOfLines={1} style={styles.manualName}>
                      {product.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.manualMeta}>
                      {product.barcode ?? 'Без штрих-кода'} · {formatMoney(product.price)} · Остаток: {product.quantity}
                    </Text>
                  </View>
                  <View style={styles.manualAdd}>
                    <Plus color={colors.primary} size={22} />
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.totalPanel}>
          <Text style={styles.totalLabel}>Общая сумма</Text>
          <Text style={styles.totalValue}>{formatMoney(total)}</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Корзина</Text>
          <Pressable accessibilityRole="button" onPress={clearCart} style={styles.clearButton}>
            <Text style={styles.clearText}>Очистить</Text>
          </Pressable>
        </View>

        {!cart.length ? (
          <View style={styles.emptyState}>
            <Barcode color={colors.muted} size={42} />
            <Text style={styles.emptyTitle}>Корзина пустая</Text>
          </View>
        ) : (
          <View style={styles.cartList}>
            {cart.map((line) => (
              <View key={line.product.id} style={styles.cartItem}>
                <View style={styles.itemTop}>
                  <View style={styles.itemImage}>
                    {line.product.imageUri ? (
                      <Image source={{ uri: line.product.imageUri }} style={styles.image} />
                    ) : (
                      <Barcode color={colors.muted} size={24} />
                    )}
                  </View>
                  <View style={styles.itemInfo}>
                    <Text numberOfLines={2} style={styles.itemName}>
                      {line.product.name}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {formatMoney(line.product.price)} x {line.quantity}
                    </Text>
                    <Text style={styles.itemStock}>Остаток: {line.product.quantity}</Text>
                  </View>
                  <Text style={styles.itemSum}>{formatMoney(line.product.price * line.quantity)}</Text>
                </View>

                <View style={styles.itemActions}>
                  <CounterButton
                    label={<Minus color={colors.text} size={22} />}
                    onPress={() => decrement(line.product.id)}
                  />
                  <View style={styles.quantityBox}>
                    <Text style={styles.quantityText}>{line.quantity}</Text>
                  </View>
                  <CounterButton
                    label={<Plus color={colors.text} size={22} />}
                    onPress={() => increment(line.product.id)}
                  />
                  <CounterButton
                    danger
                    label={<Trash2 color={colors.danger} size={22} />}
                    onPress={() => removeLine(line.product.id)}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <ActionButton
          disabled={!cart.length}
          label="Завершить продажу"
          loading={completing}
          onPress={confirmSale}
        />
      </View>

      <BarcodeScannerModal
        onClose={() => setScannerVisible(false)}
        onScanned={handleScanned}
        title="Сканировать товар"
        visible={scannerVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 116,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  cartBadge: {
    minWidth: 60,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#EAF7EF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  cartBadgeText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
  },
  scanMain: {
    minHeight: 72,
  },
  manualPanel: {
    gap: 10,
  },
  searchWrap: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    minHeight: 54,
    color: colors.text,
    fontSize: 16,
  },
  manualError: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  manualEmpty: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  manualResults: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  manualResult: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  manualResultPressed: {
    backgroundColor: '#EAF7EF',
  },
  manualImage: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  manualInfo: {
    flex: 1,
    minWidth: 0,
  },
  manualName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  manualMeta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  manualAdd: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#EAF7EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalPanel: {
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  totalLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  totalValue: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyState: {
    minHeight: 230,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 12,
  },
  cartList: {
    gap: 12,
  },
  cartItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 12,
    ...shadow,
  },
  itemTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  itemImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  itemMeta: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  itemStock: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  itemSum: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    maxWidth: 98,
    textAlign: 'right',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  counterDanger: {
    backgroundColor: '#FFF1F0',
    borderColor: '#F4B5B0',
    marginLeft: 'auto',
  },
  counterPressed: {
    opacity: 0.7,
  },
  quantityBox: {
    minWidth: 58,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quantityText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 22,
    backgroundColor: '#FFFFFF',
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
});
