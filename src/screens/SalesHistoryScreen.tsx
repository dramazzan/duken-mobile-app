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
import { ReceiptText, Search } from 'lucide-react-native';

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
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const loadSales = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText(null);
      const rows = await searchSales(searchTerm, activeFilter);
      setSales(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить историю.';
      setErrorText(message);
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, searchTerm]);

  useEffect(() => {
    const timeout = setTimeout(loadSales, 220);
    return () => clearTimeout(timeout);
  }, [loadSales, refreshToken]);

  useEffect(() => {
    return subscribeToSales(() => {
      setRefreshToken((current) => current + 1);
    });
  }, []);

  const renderSale = ({ item }: { item: Sale }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => setSelectedSaleId(item.id)}
      style={({ pressed }) => [styles.saleCard, pressed ? styles.salePressed : null]}
    >
      <View style={styles.saleTop}>
        <View style={styles.saleTitleBlock}>
          <Text style={styles.saleNumber}>{item.saleNumber}</Text>
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

      {item.customerName || item.customerPhone ? (
        <Text numberOfLines={1} style={styles.customerText}>
          {[item.customerName, item.customerPhone].filter(Boolean).join(' · ')}
        </Text>
      ) : null}

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
    marginBottom: 10,
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
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  filterChip: {
    minHeight: 42,
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
    padding: 16,
    paddingTop: 6,
    paddingBottom: 120,
    gap: 12,
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
    padding: 14,
    gap: 10,
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
  saleNumber: {
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
  customerText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  itemsText: {
    color: colors.muted,
    fontSize: 13,
  },
});
