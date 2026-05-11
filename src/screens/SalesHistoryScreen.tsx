import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight, ReceiptText, Search, X } from 'lucide-react-native';

import { ActionButton } from '../components/ActionButton';
import { formatDateTime, formatMoney } from '../lib/format';
import { colors, shadow } from '../lib/theme';
import type { Sale, SaleFilter, SaleStatus } from '../lib/types';
import {
  PAYMENT_METHOD_LABELS,
  SALE_FILTER_LABELS,
  SALE_STATUS_LABELS,
  searchSales,
  subscribeToSales,
} from '../services/sales.service';
import { SaleDetailsScreen } from './SaleDetailsScreen';

const filters: SaleFilter[] = [
  'all',
  'cash',
  'transfer',
  'debt',
  'home_payment',
  'paid',
  'unpaid',
  'pending',
];

type DateFilter = 'all' | 'today' | 'yesterday' | 'custom';

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

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

function getYesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return toDateKey(date);
}

function formatDateKey(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
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

function saleMatchesDate(sale: Sale, dateFilter: DateFilter, selectedDate: string | null) {
  if (dateFilter === 'all') {
    return true;
  }

  const saleDateKey = toDateKey(new Date(sale.createdAt));

  if (dateFilter === 'today') {
    return saleDateKey === toDateKey(new Date());
  }

  if (dateFilter === 'yesterday') {
    return saleDateKey === getYesterdayKey();
  }

  return Boolean(selectedDate && saleDateKey === selectedDate);
}

function getStatusStyle(status: SaleStatus) {
  if (status === 'paid') {
    return styles.statusPaid;
  }

  if (status === 'unpaid') {
    return styles.statusUnpaid;
  }

  return styles.statusPending;
}

export function SalesHistoryScreen() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<SaleFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const loadSales = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText(null);
      const rows = await searchSales(searchTerm, activeFilter);
      setSales(rows.filter((sale) => saleMatchesDate(sale, dateFilter, selectedDate)));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить историю.';
      setErrorText(message);
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, dateFilter, searchTerm, selectedDate]);

  useEffect(() => {
    const timeout = setTimeout(loadSales, 220);
    return () => clearTimeout(timeout);
  }, [loadSales, refreshToken]);

  useEffect(() => {
    return subscribeToSales(() => {
      setRefreshToken((current) => current + 1);
    });
  }, []);

  const selectDateFilter = (filter: DateFilter) => {
    setDateFilter(filter);

    if (filter === 'all') {
      setSelectedDate(null);
    }

    if (filter === 'today') {
      setSelectedDate(toDateKey(new Date()));
    }

    if (filter === 'yesterday') {
      setSelectedDate(getYesterdayKey());
    }
  };

  const openCalendar = () => {
    setCalendarMonth(selectedDate ? parseDateKey(selectedDate) : new Date());
    setCalendarVisible(true);
  };

  const selectCalendarDate = (date: Date) => {
    setSelectedDate(toDateKey(date));
    setDateFilter('custom');
    setCalendarVisible(false);
  };

  const changeCalendarMonth = (offset: number) => {
    setCalendarMonth((current) => {
      const next = new Date(current);
      next.setMonth(current.getMonth() + offset);
      return next;
    });
  };

  const renderSale = ({ item }: { item: Sale }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => setSelectedSaleId(item.id)}
      style={({ pressed }) => [styles.saleCard, pressed ? styles.salePressed : null]}
    >
      <View style={styles.saleTop}>
        <View style={styles.saleTitleBlock}>
          <Text numberOfLines={1} style={styles.customerName}>
            {item.customerName?.trim() || 'Клиент не указан'}
          </Text>
          <Text style={styles.saleDate}>{formatDateTime(item.createdAt)}</Text>
        </View>
        <Text style={styles.saleAmount}>{formatMoney(item.totalAmount)}</Text>
      </View>

      <View style={styles.saleMeta}>
        <View style={styles.methodBadge}>
          <Text style={styles.methodText}>{PAYMENT_METHOD_LABELS[item.paymentMethod]}</Text>
        </View>
        <View style={[styles.statusBadge, getStatusStyle(item.status)]}>
          <Text style={styles.statusText}>{SALE_STATUS_LABELS[item.status]}</Text>
        </View>
      </View>

      {item.items?.length ? (
        <Text numberOfLines={1} style={styles.itemsText}>
          {item.items.map((saleItem) => saleItem.productName).join(', ')}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>История продаж</Text>
      </View>

      <View style={styles.searchWrap}>
        <Search color={colors.muted} size={20} />
        <TextInput
          autoCapitalize="none"
          onChangeText={setSearchTerm}
          placeholder="Номер, товар, клиент, телефон"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          value={searchTerm}
        />
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.filters}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
      >
        {filters.map((filter) => {
          const active = activeFilter === filter;
          return (
            <Pressable
              accessibilityRole="button"
              key={filter}
              onPress={() => setActiveFilter(filter)}
              style={({ pressed }) => [
                styles.filterChip,
                active ? styles.filterChipActive : null,
                pressed ? styles.filterChipPressed : null,
              ]}
            >
              <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>
                {SALE_FILTER_LABELS[filter]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.dateFilters}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dateFiltersScroll}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => selectDateFilter('all')}
          style={({ pressed }) => [
            styles.dateChip,
            dateFilter === 'all' ? styles.dateChipActive : null,
            pressed ? styles.filterChipPressed : null,
          ]}
        >
          <Text style={[styles.dateText, dateFilter === 'all' ? styles.dateTextActive : null]}>
            Все даты
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => selectDateFilter('today')}
          style={({ pressed }) => [
            styles.dateChip,
            dateFilter === 'today' ? styles.dateChipActive : null,
            pressed ? styles.filterChipPressed : null,
          ]}
        >
          <Text style={[styles.dateText, dateFilter === 'today' ? styles.dateTextActive : null]}>
            Сегодня
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => selectDateFilter('yesterday')}
          style={({ pressed }) => [
            styles.dateChip,
            dateFilter === 'yesterday' ? styles.dateChipActive : null,
            pressed ? styles.filterChipPressed : null,
          ]}
        >
          <Text style={[styles.dateText, dateFilter === 'yesterday' ? styles.dateTextActive : null]}>
            Вчера
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={openCalendar}
          style={({ pressed }) => [
            styles.dateChip,
            dateFilter === 'custom' ? styles.dateChipActive : null,
            pressed ? styles.filterChipPressed : null,
          ]}
        >
          <CalendarDays color={dateFilter === 'custom' ? colors.primary : colors.text} size={18} />
          <Text style={[styles.dateText, dateFilter === 'custom' ? styles.dateTextActive : null]}>
            {selectedDate && dateFilter === 'custom' ? formatDateKey(selectedDate) : 'Календарь'}
          </Text>
        </Pressable>
      </ScrollView>

      {errorText ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorText}</Text>
          <ActionButton label="Повторить" onPress={loadSales} variant="secondary" />
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={sales.length ? styles.listContent : styles.emptyListContent}
        data={sales}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ReceiptText color={colors.muted} size={42} />
            <Text style={styles.emptyTitle}>
              {loading ? 'Загружаем...' : errorText ?? 'Продаж пока нет'}
            </Text>
          </View>
        }
        renderItem={renderSale}
        showsVerticalScrollIndicator={false}
      />

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedSaleId(null)}
        presentationStyle="fullScreen"
        visible={Boolean(selectedSaleId)}
      >
        {selectedSaleId ? (
          <SaleDetailsScreen
            onClose={() => setSelectedSaleId(null)}
            onPaymentConfirmed={loadSales}
            saleId={selectedSaleId}
          />
        ) : null}
      </Modal>

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
                const selected = dateKey === selectedDate;
                const currentMonth = date.getMonth() === calendarMonth.getMonth();

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={dateKey}
                    onPress={() => selectCalendarDate(date)}
                    style={({ pressed }) => [
                      styles.calendarDay,
                      selected ? styles.calendarDaySelected : null,
                      pressed ? styles.filterChipPressed : null,
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
    paddingTop: 14,
    paddingBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  searchWrap: {
    minHeight: 52,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    minHeight: 52,
    color: colors.text,
    fontSize: 16,
  },
  filters: {
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  filtersScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: 44,
    marginBottom: 6,
  },
  filterChip: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: '#EAF7EF',
    borderColor: colors.primary,
  },
  filterChipPressed: {
    opacity: 0.72,
  },
  filterText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  filterTextActive: {
    color: colors.primary,
  },
  dateFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  dateFiltersScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: 46,
    marginBottom: 8,
  },
  dateChip: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  dateChipActive: {
    backgroundColor: '#EAF7EF',
    borderColor: colors.primary,
  },
  dateText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  dateTextActive: {
    color: colors.primary,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F4B5B0',
    backgroundColor: '#FFF1F0',
    padding: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 120,
    gap: 10,
  },
  emptyListContent: {
    flexGrow: 1,
    padding: 16,
  },
  emptyState: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center',
  },
  saleCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 9,
    ...shadow,
  },
  salePressed: {
    opacity: 0.78,
  },
  saleTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  saleTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  customerName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  saleDate: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  saleAmount: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'right',
  },
  saleMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodBadge: {
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  methodText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  statusPaid: {
    backgroundColor: '#EAF7EF',
  },
  statusUnpaid: {
    backgroundColor: '#FFF1F0',
  },
  statusPending: {
    backgroundColor: '#FFF7E6',
  },
  statusText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  itemsText: {
    color: colors.muted,
    fontSize: 13,
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
