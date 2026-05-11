import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
  ReceiptText,
  TrendingUp,
  X,
} from 'lucide-react-native';

import { formatMoney } from '../lib/format';
import { colors, shadow } from '../lib/theme';
import type { Expense, ExpenseCategory, PaymentMethod, Product, Sale, SaleItem } from '../lib/types';
import {
  EXPENSE_CATEGORY_LABELS,
  getAllExpenses,
  subscribeToExpenses,
} from '../services/expenses.service';
import { getAllProducts, subscribeToProducts } from '../services/products.service';
import {
  PAYMENT_METHOD_LABELS,
  getAllSales,
  subscribeToSales,
} from '../services/sales.service';

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const lowStockLimit = 5;
const expenseCategories = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

type ChartMode = 'days' | 'months' | 'years';

type ProductStat = {
  productId: string;
  name: string;
  barcode: string | null;
  quantity: number;
  revenue: number;
};

type ChartPoint = {
  key: string;
  label: string;
  count: number;
  revenue: number;
};

const chartModeOptions: Array<{ key: ChartMode; label: string }> = [
  { key: 'days', label: '7 дней' },
  { key: 'months', label: 'Месяцы' },
  { key: 'years', label: 'Годы' },
];

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDateKey(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatMonthLabel(monthIndex: number) {
  return new Date(2026, monthIndex, 1)
    .toLocaleDateString('ru-RU', { month: 'short' })
    .replace('.', '');
}

function getCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function getSevenDayKeys(endDateKey: string) {
  const endDate = parseDateKey(endDateKey);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - (6 - index));
    return toDateKey(date);
  });
}

function getPeriodRange(mode: ChartMode, selectedEndDate: string) {
  const selectedDate = parseDateKey(selectedEndDate);
  const selectedYear = selectedDate.getFullYear();

  if (mode === 'months') {
    return {
      start: new Date(selectedYear, 0, 1, 0, 0, 0, 0),
      end: new Date(selectedYear, 11, 31, 23, 59, 59, 999),
    };
  }

  if (mode === 'years') {
    return {
      start: new Date(selectedYear - 6, 0, 1, 0, 0, 0, 0),
      end: new Date(selectedYear, 11, 31, 23, 59, 59, 999),
    };
  }

  const start = parseDateKey(getSevenDayKeys(selectedEndDate)[0]);
  const end = parseDateKey(selectedEndDate);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function isDateInRange(date: Date, start: Date, end: Date) {
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function getRangeLabel(mode: ChartMode, selectedEndDate: string) {
  const selectedDate = parseDateKey(selectedEndDate);
  const selectedYear = selectedDate.getFullYear();

  if (mode === 'months') {
    return `${selectedYear} год`;
  }

  if (mode === 'years') {
    return `${selectedYear - 6} - ${selectedYear}`;
  }

  const keys = getSevenDayKeys(selectedEndDate);
  return `${formatDateKey(keys[0])} - ${formatDateKey(keys[6])}`;
}

function getChartTitle(mode: ChartMode) {
  if (mode === 'months') {
    return 'Продажи по месяцам';
  }

  if (mode === 'years') {
    return 'Продажи по годам';
  }

  return 'Продажи за 7 дней';
}

function getChartSubtitle(mode: ChartMode) {
  if (mode === 'months') {
    return 'По количеству чеков за выбранный год';
  }

  if (mode === 'years') {
    return 'По количеству чеков за последние 7 лет';
  }

  return 'По количеству чеков';
}

function sumSales(sales: Sale[]) {
  return sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
}

function sumExpenses(expenses: Expense[]) {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

function sumOutstanding(sales: Sale[]) {
  return sales.reduce((sum, sale) => sum + sale.outstandingAmount, 0);
}

function collectProductStats(items: SaleItem[]) {
  const stats = new Map<string, ProductStat>();

  items.forEach((item) => {
    const current = stats.get(item.productId);

    if (current) {
      current.quantity += item.quantity;
      current.revenue += item.lineTotal;
      return;
    }

    stats.set(item.productId, {
      productId: item.productId,
      name: item.productName,
      barcode: item.productBarcode,
      quantity: item.quantity,
      revenue: item.lineTotal,
    });
  });

  return Array.from(stats.values());
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
      {note ? <Text style={styles.statNote}>{note}</Text> : null}
    </View>
  );
}

export function StatisticsScreen() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedEndDate, setSelectedEndDate] = useState(toDateKey(new Date()));
  const [chartMode, setChartMode] = useState<ChartMode>('days');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText(null);
      const [salesRows, productRows, expenseRows] = await Promise.all([
        getAllSales(),
        getAllProducts(),
        getAllExpenses(),
      ]);
      setSales(salesRows);
      setProducts(productRows);
      setExpenses(expenseRows);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить статистику.';
      setErrorText(message);
      setSales([]);
      setProducts([]);
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsubscribeSales = subscribeToSales(loadData);
    const unsubscribeProducts = subscribeToProducts(loadData);
    const unsubscribeExpenses = subscribeToExpenses(loadData);

    return () => {
      unsubscribeSales();
      unsubscribeProducts();
      unsubscribeExpenses();
    };
  }, [loadData]);

  const periodRange = useMemo(
    () => getPeriodRange(chartMode, selectedEndDate),
    [chartMode, selectedEndDate]
  );
  const periodSales = useMemo(
    () =>
      sales.filter((sale) =>
        isDateInRange(new Date(sale.createdAt), periodRange.start, periodRange.end)
      ),
    [periodRange, sales]
  );
  const periodExpenses = useMemo(
    () =>
      expenses.filter((expense) =>
        isDateInRange(parseDateKey(expense.expenseDate), periodRange.start, periodRange.end)
      ),
    [expenses, periodRange]
  );
  const todaySales = useMemo(
    () => sales.filter((sale) => toDateKey(new Date(sale.createdAt)) === toDateKey(new Date())),
    [sales]
  );

  const chartData = useMemo(
    () => {
      const selectedDate = parseDateKey(selectedEndDate);
      const selectedYear = selectedDate.getFullYear();

      if (chartMode === 'months') {
        return Array.from({ length: 12 }, (_, monthIndex): ChartPoint => {
          const rows = sales.filter((sale) => {
            const saleDate = new Date(sale.createdAt);
            return saleDate.getFullYear() === selectedYear && saleDate.getMonth() === monthIndex;
          });

          return {
            key: `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}`,
            label: formatMonthLabel(monthIndex),
            count: rows.length,
            revenue: sumSales(rows),
          };
        });
      }

      if (chartMode === 'years') {
        return Array.from({ length: 7 }, (_, index): ChartPoint => {
          const year = selectedYear - 6 + index;
          const rows = sales.filter((sale) => new Date(sale.createdAt).getFullYear() === year);

          return {
            key: String(year),
            label: String(year),
            count: rows.length,
            revenue: sumSales(rows),
          };
        });
      }

      return getSevenDayKeys(selectedEndDate).map((dateKey): ChartPoint => {
        const rows = sales.filter((sale) => toDateKey(new Date(sale.createdAt)) === dateKey);

        return {
          key: dateKey,
          label: formatDateKey(dateKey),
          count: rows.length,
          revenue: sumSales(rows),
        };
      });
    },
    [chartMode, sales, selectedEndDate]
  );

  const maxCount = Math.max(...chartData.map((item) => item.count), 1);
  const periodItems = periodSales.flatMap((sale) => sale.items ?? []);
  const popularProducts = collectProductStats(periodItems)
    .sort((left, right) => right.quantity - left.quantity || right.revenue - left.revenue)
    .slice(0, 5);
  const revenueLeaders = collectProductStats(periodItems)
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 5);
  const lowStockProducts = [...products]
    .filter((product) => product.quantity <= lowStockLimit)
    .sort((left, right) => left.quantity - right.quantity || left.name.localeCompare(right.name))
    .slice(0, 8);

  const periodRevenue = sumSales(periodSales);
  const expensesTotal = sumExpenses(periodExpenses);
  const profit = periodRevenue - expensesTotal;
  const paidRevenue = sumSales(periodSales.filter((sale) => sale.status === 'paid'));
  const debtOutstanding = sumOutstanding(
    sales.filter((sale) => sale.paymentMethod === 'debt' && sale.status === 'unpaid')
  );
  const homePending = sumOutstanding(
    sales.filter((sale) => sale.paymentMethod === 'home_payment' && sale.status === 'pending')
  );
  const averageCheck = periodSales.length ? periodRevenue / periodSales.length : 0;

  const paymentBreakdown = (['cash', 'transfer', 'debt', 'home_payment'] as PaymentMethod[]).map(
    (method) => {
      const rows = periodSales.filter((sale) => sale.paymentMethod === method);
      return {
        method,
        count: rows.length,
        total: sumSales(rows),
      };
    }
  );
  const expenseBreakdown = expenseCategories
    .map((item) => {
      const rows = periodExpenses.filter((expense) => expense.category === item);

      return {
        category: item,
        count: rows.length,
        total: sumExpenses(rows),
      };
    })
    .filter((item) => item.count > 0 || item.total > 0)
    .sort((left, right) => right.total - left.total);

  const openCalendar = () => {
    setCalendarMonth(parseDateKey(selectedEndDate));
    setCalendarVisible(true);
  };

  const changeCalendarMonth = (offset: number) => {
    setCalendarMonth((current) => {
      const next = new Date(current);
      next.setMonth(current.getMonth() + offset);
      return next;
    });
  };

  const selectCalendarDate = (date: Date) => {
    setSelectedEndDate(toDateKey(date));
    setCalendarVisible(false);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Статистика</Text>
          <Text style={styles.subtitle}>{getRangeLabel(chartMode, selectedEndDate)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={openCalendar}
          style={({ pressed }) => [styles.calendarButton, pressed ? styles.pressed : null]}
        >
          <CalendarDays color={colors.primary} size={22} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {errorText ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorText}</Text>
          </View>
        ) : null}

        <View style={styles.chartPanel}>
          <View style={styles.modeTabs}>
            {chartModeOptions.map((item) => {
              const active = item.key === chartMode;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={item.key}
                  onPress={() => setChartMode(item.key)}
                  style={({ pressed }) => [
                    styles.modeTab,
                    active ? styles.modeTabActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={[styles.modeTabText, active ? styles.modeTabTextActive : null]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>{getChartTitle(chartMode)}</Text>
              <Text style={styles.sectionSubtitle}>{getChartSubtitle(chartMode)}</Text>
            </View>
            {loading ? <ActivityIndicator color={colors.primary} /> : <TrendingUp color={colors.primary} size={24} />}
          </View>

          <ScrollView horizontal={chartMode === 'months'} showsHorizontalScrollIndicator={false}>
            <View style={[styles.chart, chartMode === 'months' ? styles.chartWide : null]}>
              {chartData.map((item) => (
                <View key={item.key} style={styles.barColumn}>
                  <Text style={styles.barCount}>{item.count}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${Math.max(10, (item.count / maxCount) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barDate}>{item.label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.cardsGrid}>
          <StatCard label="Сегодня продаж" value={String(todaySales.length)} note={formatMoney(sumSales(todaySales))} />
          <StatCard label="За период" value={String(periodSales.length)} note={formatMoney(periodRevenue)} />
          <StatCard label="Средний чек" value={formatMoney(averageCheck)} />
          <StatCard label="Оплачено" value={formatMoney(paidRevenue)} />
          <StatCard label="Расходы" value={formatMoney(expensesTotal)} note={`${periodExpenses.length} записей`} />
          <StatCard label="Прибыль" value={formatMoney(profit)} note="Выручка минус расходы" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Расходы за период</Text>
          <View style={styles.paymentRows}>
            {expenseBreakdown.length ? (
              expenseBreakdown.map((item) => (
                <View key={item.category} style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>{EXPENSE_CATEGORY_LABELS[item.category]}</Text>
                  <Text style={styles.paymentValue}>
                    {item.count} · {formatMoney(item.total)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>За выбранный период расходов нет.</Text>
            )}
          </View>
        </View>

        <View style={styles.alertPanel}>
          <View style={styles.alertIcon}>
            <AlertTriangle color={colors.warning} size={24} />
          </View>
          <View style={styles.alertTextBlock}>
            <Text style={styles.alertTitle}>Срочно купить</Text>
            <Text style={styles.alertText}>
              Товаров с остатком {lowStockLimit} или меньше: {lowStockProducts.length}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Популярные товары</Text>
              <Text style={styles.sectionSubtitle}>По количеству за выбранный период</Text>
            </View>
            <ReceiptText color={colors.primary} size={24} />
          </View>
          {popularProducts.length ? (
            popularProducts.map((item, index) => (
              <View key={item.productId} style={styles.rankRow}>
                <Text style={styles.rankNumber}>{index + 1}</Text>
                <View style={styles.rankBody}>
                  <Text numberOfLines={1} style={styles.rankName}>
                    {item.name}
                  </Text>
                  <Text style={styles.rankMeta}>{item.quantity} шт · {formatMoney(item.revenue)}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>За период продаж товаров нет.</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Лидеры по выручке</Text>
              <Text style={styles.sectionSubtitle}>Какие товары дают больше денег</Text>
            </View>
            <TrendingUp color={colors.primary} size={24} />
          </View>
          {revenueLeaders.length ? (
            revenueLeaders.map((item, index) => (
              <View key={item.productId} style={styles.rankRow}>
                <Text style={styles.rankNumber}>{index + 1}</Text>
                <View style={styles.rankBody}>
                  <Text numberOfLines={1} style={styles.rankName}>
                    {item.name}
                  </Text>
                  <Text style={styles.rankMeta}>{formatMoney(item.revenue)} · {item.quantity} шт</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Пока нет данных по выручке.</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Мало осталось</Text>
              <Text style={styles.sectionSubtitle}>Остаток {lowStockLimit} или меньше</Text>
            </View>
            <PackageSearch color={colors.primary} size={24} />
          </View>
          {lowStockProducts.length ? (
            lowStockProducts.map((product) => (
              <View key={product.id} style={styles.stockRow}>
                <View style={styles.rankBody}>
                  <Text numberOfLines={1} style={styles.rankName}>
                    {product.name}
                  </Text>
                  <Text style={styles.rankMeta}>{product.barcode ?? 'Без штрих-кода'}</Text>
                </View>
                <Text style={[styles.stockQty, product.quantity <= 0 ? styles.stockQtyDanger : null]}>
                  {product.quantity}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Критичных остатков нет.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Оплаты и риски</Text>
          <View style={styles.paymentRows}>
            {paymentBreakdown.map((item) => (
              <View key={item.method} style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>{PAYMENT_METHOD_LABELS[item.method]}</Text>
                <Text style={styles.paymentValue}>{item.count} · {formatMoney(item.total)}</Text>
              </View>
            ))}
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Долги не оплачены</Text>
              <Text style={styles.paymentValue}>{formatMoney(debtOutstanding)}</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Ожидает из дома</Text>
              <Text style={styles.paymentValue}>{formatMoney(homePending)}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
        transparent
        visible={calendarVisible}
      >
        <View style={styles.calendarOverlay}>
          <View style={styles.calendarModal}>
            <View style={styles.calendarHeader}>
              <Pressable
                accessibilityRole="button"
                onPress={() => changeCalendarMonth(-1)}
                style={styles.calendarIconButton}
              >
                <ChevronLeft color={colors.text} size={24} />
              </Pressable>
              <Text style={styles.calendarTitle}>
                {calendarMonth.toLocaleDateString('ru-RU', {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => changeCalendarMonth(1)}
                style={styles.calendarIconButton}
              >
                <ChevronRight color={colors.text} size={24} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setCalendarVisible(false)}
                style={styles.calendarCloseButton}
              >
                <X color={colors.text} size={22} />
              </Pressable>
            </View>

            <View style={styles.weekdays}>
              {weekdays.map((day) => (
                <Text key={day} style={styles.weekdayText}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {getCalendarDays(calendarMonth).map((date) => {
                const dateKey = toDateKey(date);
                const selected = dateKey === selectedEndDate;
                const currentMonth = date.getMonth() === calendarMonth.getMonth();

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={dateKey}
                    onPress={() => selectCalendarDate(date)}
                    style={({ pressed }) => [
                      styles.calendarDay,
                      selected ? styles.calendarDaySelected : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        !currentMonth ? styles.calendarDayMuted : null,
                        selected ? styles.calendarDayTextSelected : null,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  calendarButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  content: {
    padding: 16,
    paddingTop: 6,
    paddingBottom: 120,
    gap: 12,
  },
  errorBanner: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F4B5B0',
    backgroundColor: '#FFF1F0',
    padding: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  chartPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 14,
    ...shadow,
  },
  modeTabs: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    flexDirection: 'row',
    gap: 4,
  },
  modeTab: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  modeTabActive: {
    backgroundColor: colors.primary,
  },
  modeTabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  modeTabTextActive: {
    color: '#FFFFFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  chart: {
    height: 190,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  chartWide: {
    minWidth: 540,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
  },
  barCount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  barTrack: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    backgroundColor: colors.surface,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  barDate: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48.4%',
    minHeight: 104,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
    justifyContent: 'space-between',
    ...shadow,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },
  statNote: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    lineHeight: 16,
  },
  alertPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F3D6A3',
    backgroundColor: '#FFF8EA',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#FFF1CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  alertTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  alertText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  section: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 12,
    ...shadow,
  },
  rankRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  rankNumber: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#EAF7EF',
    color: colors.primary,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 30,
  },
  rankBody: {
    flex: 1,
    minWidth: 0,
  },
  rankName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  rankMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  stockRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  stockQty: {
    minWidth: 42,
    borderRadius: 8,
    backgroundColor: '#FFF8EA',
    color: colors.warning,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
    paddingVertical: 8,
  },
  stockQtyDanger: {
    backgroundColor: '#FFF1F0',
    color: colors.danger,
  },
  paymentRows: {
    gap: 10,
  },
  paymentRow: {
    minHeight: 42,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 10,
  },
  paymentLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  paymentValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    padding: 16,
  },
  calendarModal: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 14,
    ...shadow,
  },
  calendarHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarIconButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  weekdays: {
    flexDirection: 'row',
    marginTop: 10,
  },
  weekdayText: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  calendarDay: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  calendarDaySelected: {
    backgroundColor: colors.primary,
  },
  calendarDayText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  calendarDayMuted: {
    color: colors.muted,
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
  },
});
