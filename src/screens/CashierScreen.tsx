import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Banknote,
  Barcode,
  Calculator,
  Clock3,
  CreditCard,
  HandCoins,
  Minus,
  Plus,
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  X,
} from 'lucide-react-native';

import { ActionButton } from '../components/ActionButton';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { formatMoney } from '../lib/format';
import { colors, shadow } from '../lib/theme';
import {
  getAllProducts,
  getProductByBarcode,
  mapProductRow,
  subscribeToProducts,
} from '../services/products.service';
import {
  createSale,
  getAllSales,
  getCustomerSuggestions,
  PAYMENT_METHOD_LABELS,
} from '../services/sales.service';
import {
  getAllSellers,
  getDefaultSeller,
  subscribeToSellers,
} from '../services/sellers.service';
import type { CartLine, DebtorSummary, PaymentMethod, Product, Sale, Seller } from '../lib/types';

type CashierScreenProps = {
  cart: CartLine[];
  setCart: Dispatch<SetStateAction<CartLine[]>>;
  onAddUnknownBarcode: (barcode: string) => void;
  onInventoryChanged: () => void;
};

const paymentOptions: Array<{
  method: PaymentMethod;
  description: string;
  Icon: typeof Banknote;
}> = [
  { method: 'cash', description: 'Продажа сразу оплачена', Icon: Banknote },
  { method: 'transfer', description: 'Перевод на карту или счет', Icon: CreditCard },
  { method: 'debt', description: 'Сохранить в долгах клиента', Icon: HandCoins },
  { method: 'home_payment', description: 'Клиент оплатит из дома', Icon: Clock3 },
];

type SellerDailySummary = {
  id: string;
  name: string;
  count: number;
  total: number;
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function sumSaleTotals(sales: Sale[]) {
  return sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
}

function sumPaidAmounts(sales: Sale[]) {
  return sales.reduce((sum, sale) => sum + sale.paidAmount, 0);
}

function sumOutstanding(sales: Sale[]) {
  return sales.reduce((sum, sale) => sum + sale.outstandingAmount, 0);
}

function getSellerDailySummaries(sales: Sale[]) {
  const groups = new Map<string, SellerDailySummary>();

  sales.forEach((sale) => {
    const current = groups.get(sale.sellerId);

    if (current) {
      current.count += 1;
      current.total += sale.totalAmount;
      return;
    }

    groups.set(sale.sellerId, {
      id: sale.sellerId,
      name: sale.sellerName,
      count: 1,
      total: sale.totalAmount,
    });
  });

  return Array.from(groups.values()).sort(
    (left, right) => right.total - left.total || right.count - left.count
  );
}

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
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<DebtorSummary[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);
  const [paymentComment, setPaymentComment] = useState('');
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [cashierReportVisible, setCashierReportVisible] = useState(false);
  const [cashierReportSales, setCashierReportSales] = useState<Sale[]>([]);
  const [cashierReportLoading, setCashierReportLoading] = useState(false);
  const [cashierReportError, setCashierReportError] = useState<string | null>(null);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [cart]
  );

  const requiresCustomerInfo =
    selectedPaymentMethod === 'debt' || selectedPaymentMethod === 'home_payment';
  const activeSellers = useMemo(
    () => sellers.filter((seller) => seller.isActive),
    [sellers]
  );
  const selectedSeller = useMemo(
    () => activeSellers.find((seller) => seller.id === selectedSellerId) ?? null,
    [activeSellers, selectedSellerId]
  );
  const paidTodaySales = useMemo(
    () => cashierReportSales.filter((sale) => sale.status === 'paid'),
    [cashierReportSales]
  );
  const cashTodaySales = useMemo(
    () => paidTodaySales.filter((sale) => sale.paymentMethod === 'cash'),
    [paidTodaySales]
  );
  const transferTodaySales = useMemo(
    () => paidTodaySales.filter((sale) => sale.paymentMethod === 'transfer'),
    [paidTodaySales]
  );
  const debtTodaySales = useMemo(
    () => cashierReportSales.filter((sale) => sale.paymentMethod === 'debt'),
    [cashierReportSales]
  );
  const homePaymentTodaySales = useMemo(
    () => cashierReportSales.filter((sale) => sale.paymentMethod === 'home_payment'),
    [cashierReportSales]
  );
  const todaySellerSummaries = useMemo(
    () => getSellerDailySummaries(cashierReportSales),
    [cashierReportSales]
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
    let mounted = true;

    const loadSellers = async () => {
      try {
        setSellersLoading(true);
        const rows = await getAllSellers();

        if (mounted) {
          setSellers(rows);
          setSelectedSellerId((current) => {
            if (current && rows.some((seller) => seller.id === current && seller.isActive)) {
              return current;
            }

            return getDefaultSeller(rows)?.id ?? null;
          });
        }
      } catch (error) {
        console.warn('Could not load sellers', error);

        if (mounted) {
          setSellers([]);
          setSelectedSellerId(null);
        }
      } finally {
        if (mounted) {
          setSellersLoading(false);
        }
      }
    };

    loadSellers();
    const unsubscribe = subscribeToSellers(() => {
      loadSellers();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

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

  useEffect(() => {
    let cancelled = false;

    if (!paymentModalVisible || !requiresCustomerInfo) {
      setCustomerSuggestions([]);
      setCustomerLoading(false);
      return;
    }

    setCustomerLoading(true);

    const timeout = setTimeout(async () => {
      try {
        const rows = await getCustomerSuggestions(customerSearch);

        if (!cancelled) {
          setCustomerSuggestions(rows);
        }
      } catch (error) {
        console.warn('Could not load customer suggestions', error);

        if (!cancelled) {
          setCustomerSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setCustomerLoading(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [customerSearch, paymentModalVisible, requiresCustomerInfo]);

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

  const loadCashierReport = async () => {
    try {
      setCashierReportLoading(true);
      setCashierReportError(null);
      const todayKey = toDateKey(new Date());
      const rows = await getAllSales();
      setCashierReportSales(
        rows.filter((sale) => toDateKey(new Date(sale.createdAt)) === todayKey)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить расчет кассы.';
      setCashierReportError(message);
      setCashierReportSales([]);
    } finally {
      setCashierReportLoading(false);
    }
  };

  const openCashierReport = () => {
    setCashierReportVisible(true);
    loadCashierReport();
  };

  const resetPaymentForm = () => {
    setSelectedPaymentMethod(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerSearch('');
    setCustomerSuggestions([]);
    setCustomerLoading(false);
    setSelectedCustomerKey(null);
    setPaymentComment('');
  };

  const selectPaymentMethod = (method: PaymentMethod) => {
    setSelectedPaymentMethod(method);

    if (method === 'cash' || method === 'transfer') {
      setCustomerName('');
      setCustomerPhone('');
      setCustomerSearch('');
      setCustomerSuggestions([]);
      setSelectedCustomerKey(null);
      setPaymentComment('');
    }
  };

  const selectCustomer = (customer: DebtorSummary) => {
    setSelectedCustomerKey(customer.key);
    setCustomerName(customer.name === 'Клиент не указан' ? '' : customer.name);
    setCustomerPhone(customer.phone ?? '');
    setCustomerSearch(customer.name);
  };

  const startNewCustomer = () => {
    const nameFromSearch = customerSearch.trim();
    setSelectedCustomerKey(null);
    setCustomerName(nameFromSearch);
    setCustomerPhone('');
  };

  const openPaymentChoice = () => {
    if (!cart.length) {
      Alert.alert('Корзина пустая', 'Сначала добавьте товары сканированием.');
      return;
    }

    if (!activeSellers.length) {
      Alert.alert(
        'Нет продавца',
        'Добавьте продавца на странице Сервисы → Продавцы или выполните migration продавцов.'
      );
      return;
    }

    resetPaymentForm();
    setSelectedSellerId((current) =>
      current && activeSellers.some((seller) => seller.id === current)
        ? current
        : getDefaultSeller(activeSellers)?.id ?? activeSellers[0]?.id ?? null
    );
    setPaymentModalVisible(true);
  };

  const closePaymentChoice = () => {
    if (completing) {
      return;
    }

    setPaymentModalVisible(false);
  };

  const finishSale = async () => {
    if (!cart.length) {
      Alert.alert('Корзина пустая', 'Сначала добавьте товары сканированием.');
      return;
    }

    if (!selectedPaymentMethod) {
      Alert.alert('Выберите способ оплаты', 'Без способа оплаты продажу завершить нельзя.');
      return;
    }

    if (!selectedSellerId) {
      Alert.alert('Выберите продавца', 'Без продавца продажу сохранить нельзя.');
      return;
    }

    if (requiresCustomerInfo && !customerName.trim()) {
      Alert.alert('Укажите клиента', 'Для долга и оплаты из дома нужно имя клиента.');
      return;
    }

    try {
      setCompleting(true);
      const sale = await createSale(
        cart,
        selectedPaymentMethod,
        requiresCustomerInfo
          ? {
              name: customerName,
              phone: customerPhone,
              comment: paymentComment,
            }
          : {},
        selectedSellerId
      );
      Alert.alert(
        'Продажа сохранена',
        `${sale.saleNumber}\n${PAYMENT_METHOD_LABELS[sale.paymentMethod]}\nПродавец: ${sale.sellerName}\nИтого: ${formatMoney(sale.totalAmount)}`
      );
      setCart([]);
      resetPaymentForm();
      setPaymentModalVisible(false);
      onInventoryChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось завершить продажу.';
      Alert.alert('Ошибка продажи', message);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Касса</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              onPress={openCashierReport}
              style={({ pressed }) => [styles.reportButton, pressed ? styles.reportButtonPressed : null]}
            >
              <Calculator color={colors.primary} size={22} />
            </Pressable>
            <View style={styles.cartBadge}>
              <ShoppingCart color={colors.primary} size={22} />
              <Text style={styles.cartBadgeText}>{cart.length}</Text>
            </View>
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
          onPress={openPaymentChoice}
        />
      </View>

      <BarcodeScannerModal
        onClose={() => setScannerVisible(false)}
        onScanned={handleScanned}
        title="Сканировать товар"
        visible={scannerVisible}
      />

      <Modal
        animationType="slide"
        onRequestClose={() => setCashierReportVisible(false)}
        presentationStyle="pageSheet"
        visible={cashierReportVisible}
      >
        <View style={styles.reportScreen}>
          <View style={styles.reportHeader}>
            <View style={styles.paymentTitleWrap}>
              <Text style={styles.paymentTitle}>Касса за сегодня</Text>
              <Text style={styles.paymentSubtitle}>
                {new Date().toLocaleDateString('ru-RU', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCashierReportVisible(false)}
              style={styles.paymentClose}
            >
              <X color={colors.text} size={24} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.reportContent} showsVerticalScrollIndicator={false}>
            {cashierReportError ? (
              <View style={styles.reportError}>
                <Text style={styles.reportErrorText}>{cashierReportError}</Text>
              </View>
            ) : null}

            <View style={styles.reportSummaryGrid}>
              <View style={styles.reportCard}>
                <Text style={styles.reportCardLabel}>Оплачено</Text>
                <Text style={styles.reportCardValue}>{formatMoney(sumPaidAmounts(paidTodaySales))}</Text>
                <Text style={styles.reportCardMeta}>{paidTodaySales.length} чеков</Text>
              </View>
              <View style={styles.reportCard}>
                <Text style={styles.reportCardLabel}>Всего продаж</Text>
                <Text style={styles.reportCardValue}>{formatMoney(sumSaleTotals(cashierReportSales))}</Text>
                <Text style={styles.reportCardMeta}>{cashierReportSales.length} чеков</Text>
              </View>
            </View>

            <View style={styles.reportSection}>
              <View style={styles.reportSectionHeader}>
                <Text style={styles.reportSectionTitle}>Способы оплаты</Text>
                {cashierReportLoading ? <ActivityIndicator color={colors.primary} /> : null}
              </View>

              <View style={styles.reportRow}>
                <Text style={styles.reportRowLabel}>Наличные</Text>
                <Text style={styles.reportRowValue}>
                  {cashTodaySales.length} · {formatMoney(sumPaidAmounts(cashTodaySales))}
                </Text>
              </View>
              <View style={styles.reportRow}>
                <Text style={styles.reportRowLabel}>Перевод</Text>
                <Text style={styles.reportRowValue}>
                  {transferTodaySales.length} · {formatMoney(sumPaidAmounts(transferTodaySales))}
                </Text>
              </View>
              <View style={styles.reportRow}>
                <Text style={styles.reportRowLabel}>Долг</Text>
                <Text style={styles.reportRowValue}>
                  {debtTodaySales.length} · {formatMoney(sumOutstanding(debtTodaySales))}
                </Text>
              </View>
              <View style={styles.reportRow}>
                <Text style={styles.reportRowLabel}>Оплата из дома</Text>
                <Text style={styles.reportRowValue}>
                  {homePaymentTodaySales.length} · {formatMoney(sumOutstanding(homePaymentTodaySales))}
                </Text>
              </View>
            </View>

            <View style={styles.reportSection}>
              <Text style={styles.reportSectionTitle}>По продавцам</Text>
              {todaySellerSummaries.length ? (
                todaySellerSummaries.map((seller) => (
                  <View key={seller.id} style={styles.reportRow}>
                    <Text numberOfLines={1} style={styles.reportRowLabel}>
                      {seller.name}
                    </Text>
                    <Text style={styles.reportRowValue}>
                      {seller.count} · {formatMoney(seller.total)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.reportEmpty}>
                  {cashierReportLoading ? 'Загружаем...' : 'Сегодня продаж пока нет.'}
                </Text>
              )}
            </View>

            <ActionButton label="Обновить" onPress={loadCashierReport} variant="secondary" />
          </ScrollView>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={closePaymentChoice}
        presentationStyle="pageSheet"
        visible={paymentModalVisible}
      >
        <View style={styles.paymentScreen}>
          <View style={styles.paymentHeader}>
            <View style={styles.paymentTitleWrap}>
              <Text style={styles.paymentTitle}>Способ оплаты</Text>
              <Text style={styles.paymentSubtitle}>Итого: {formatMoney(total)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={completing}
              onPress={closePaymentChoice}
              style={styles.paymentClose}
            >
              <X color={colors.text} size={24} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.paymentContent} keyboardShouldPersistTaps="handled">
            <View style={styles.sellerPanel}>
              <View style={styles.sellerPanelHeader}>
                <View>
                  <Text style={styles.sellerPanelTitle}>Продавец</Text>
                  <Text style={styles.sellerPanelSubtitle}>
                    {selectedSeller ? selectedSeller.name : 'Выберите продавца'}
                  </Text>
                </View>
                {sellersLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <UserRound color={colors.primary} size={24} />
                )}
              </View>

              <View style={styles.sellerOptions}>
                {activeSellers.map((seller) => {
                  const active = selectedSellerId === seller.id;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      key={seller.id}
                      onPress={() => setSelectedSellerId(seller.id)}
                      style={({ pressed }) => [
                        styles.sellerOption,
                        active ? styles.sellerOptionActive : null,
                        pressed ? styles.paymentOptionPressed : null,
                      ]}
                    >
                      <Text numberOfLines={1} style={[styles.sellerName, active ? styles.sellerNameActive : null]}>
                        {seller.name}
                      </Text>
                      {seller.isDefault ? (
                        <Text style={[styles.sellerDefault, active ? styles.sellerDefaultActive : null]}>
                          По умолчанию
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.paymentOptions}>
              {paymentOptions.map(({ method, description, Icon }) => {
                const active = selectedPaymentMethod === method;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={method}
                    onPress={() => selectPaymentMethod(method)}
                    style={({ pressed }) => [
                      styles.paymentOption,
                      active ? styles.paymentOptionActive : null,
                      pressed ? styles.paymentOptionPressed : null,
                    ]}
                  >
                    <View style={[styles.paymentIcon, active ? styles.paymentIconActive : null]}>
                      <Icon color={active ? colors.primary : colors.muted} size={25} />
                    </View>
                    <View style={styles.paymentOptionText}>
                      <Text style={styles.paymentOptionTitle}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </Text>
                      <Text style={styles.paymentOptionDescription}>{description}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {requiresCustomerInfo ? (
              <View style={styles.customerPanel}>
                <Text style={styles.customerPanelTitle}>
                  {selectedPaymentMethod === 'debt' ? 'Должник' : 'Клиент'}
                </Text>
                <View style={styles.customerSearchWrap}>
                  <Search color={colors.muted} size={20} />
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setCustomerSearch}
                    placeholder={selectedPaymentMethod === 'debt' ? 'Найти должника' : 'Найти клиента'}
                    placeholderTextColor={colors.muted}
                    style={styles.customerSearchInput}
                    value={customerSearch}
                  />
                  {customerLoading ? <ActivityIndicator color={colors.primary} /> : null}
                </View>

                {customerSuggestions.length ? (
                  <View style={styles.customerSuggestions}>
                    {customerSuggestions.map((customer) => {
                      const active = selectedCustomerKey === customer.key;
                      return (
                        <Pressable
                          accessibilityRole="button"
                          key={customer.key}
                          onPress={() => selectCustomer(customer)}
                          style={({ pressed }) => [
                            styles.customerSuggestion,
                            active ? styles.customerSuggestionActive : null,
                            pressed ? styles.customerSuggestionPressed : null,
                          ]}
                        >
                          <View style={styles.customerSuggestionInfo}>
                            <Text numberOfLines={1} style={styles.customerSuggestionName}>
                              {customer.name}
                            </Text>
                            <Text numberOfLines={1} style={styles.customerSuggestionMeta}>
                              {customer.phone ?? 'Без телефона'} · долг {formatMoney(customer.totalAmount)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                <ActionButton
                  label={selectedPaymentMethod === 'debt' ? 'Новый должник' : 'Новый клиент'}
                  onPress={startNewCustomer}
                  variant="secondary"
                />

                <TextInput
                  autoCapitalize="words"
                  onChangeText={(value) => {
                    setSelectedCustomerKey(null);
                    setCustomerName(value);
                  }}
                  placeholder="Имя клиента"
                  placeholderTextColor={colors.muted}
                  style={styles.customerInput}
                  value={customerName}
                />
                <TextInput
                  keyboardType="phone-pad"
                  onChangeText={(value) => {
                    setSelectedCustomerKey(null);
                    setCustomerPhone(value);
                  }}
                  placeholder="Телефон, необязательно"
                  placeholderTextColor={colors.muted}
                  style={styles.customerInput}
                  value={customerPhone}
                />
                <TextInput
                  multiline
                  onChangeText={setPaymentComment}
                  placeholder="Комментарий, необязательно"
                  placeholderTextColor={colors.muted}
                  style={[styles.customerInput, styles.commentInput]}
                  textAlignVertical="top"
                  value={paymentComment}
                />
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.paymentFooter}>
            <ActionButton
              disabled={!selectedPaymentMethod || !selectedSellerId || (requiresCustomerInfo && !customerName.trim())}
              label="Сохранить продажу"
              loading={completing}
              onPress={finishSale}
            />
          </View>
        </View>
      </Modal>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportButtonPressed: {
    opacity: 0.72,
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
  reportScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  reportHeader: {
    minHeight: 104,
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  reportContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  reportError: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F4B5B0',
    backgroundColor: '#FFF1F0',
    padding: 12,
  },
  reportErrorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  reportSummaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  reportCard: {
    flex: 1,
    minHeight: 112,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
    justifyContent: 'space-between',
    ...shadow,
  },
  reportCardLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  reportCardValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 8,
  },
  reportCardMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  reportSection: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
    ...shadow,
  },
  reportSectionHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  reportSectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  reportRow: {
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  reportRowLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  reportRowValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  reportEmpty: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  paymentScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  paymentHeader: {
    minHeight: 104,
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  paymentTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  paymentTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  paymentSubtitle: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  paymentClose: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentContent: {
    padding: 16,
    paddingBottom: 112,
    gap: 16,
  },
  sellerPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 12,
  },
  sellerPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sellerPanelTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sellerPanelSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  sellerOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sellerOption: {
    minHeight: 48,
    maxWidth: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sellerOptionActive: {
    borderColor: colors.primary,
    backgroundColor: '#EAF7EF',
  },
  sellerName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  sellerNameActive: {
    color: colors.primary,
  },
  sellerDefault: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  sellerDefaultActive: {
    color: colors.primary,
  },
  paymentOptions: {
    gap: 10,
  },
  paymentOption: {
    minHeight: 78,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  paymentOptionActive: {
    borderColor: colors.primary,
    backgroundColor: '#EAF7EF',
  },
  paymentOptionPressed: {
    opacity: 0.75,
  },
  paymentIcon: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentIconActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C9EAD5',
  },
  paymentOptionText: {
    flex: 1,
    minWidth: 0,
  },
  paymentOptionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  paymentOptionDescription: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  customerPanel: {
    gap: 10,
  },
  customerPanelTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  customerSearchWrap: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  customerSearchInput: {
    flex: 1,
    minHeight: 54,
    color: colors.text,
    fontSize: 16,
  },
  customerSuggestions: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  customerSuggestion: {
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  customerSuggestionActive: {
    backgroundColor: '#EAF7EF',
  },
  customerSuggestionPressed: {
    opacity: 0.72,
  },
  customerSuggestionInfo: {
    minWidth: 0,
  },
  customerSuggestionName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  customerSuggestionMeta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  customerInput: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  commentInput: {
    minHeight: 94,
  },
  paymentFooter: {
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
