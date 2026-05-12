import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ArrowLeft, Barcode, CheckCircle2, PackageSearch } from 'lucide-react-native';

import { ActionButton } from '../components/ActionButton';
import { formatDateTime, formatMoney } from '../lib/format';
import { colors, shadow } from '../lib/theme';
import type { Sale, SaleStatus } from '../lib/types';
import {
  confirmSalePayment,
  getSaleById,
  PAYMENT_METHOD_LABELS,
  SALE_STATUS_LABELS,
} from '../services/sales.service';

type SaleDetailsScreenProps = {
  saleId: string;
  onClose: () => void;
  onPaymentConfirmed?: () => void;
  hideDefaultPaymentAction?: boolean;
  renderFooterActions?: (args: {
    sale: Sale;
    confirming: boolean;
    reloadSale: () => Promise<void>;
  }) => ReactNode;
};

function getStatusStyle(status: SaleStatus) {
  if (status === 'paid') {
    return styles.statusPaid;
  }

  if (status === 'unpaid') {
    return styles.statusUnpaid;
  }

  return styles.statusPending;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function SaleDetailsScreen({
  saleId,
  onClose,
  onPaymentConfirmed,
  hideDefaultPaymentAction = false,
  renderFooterActions,
}: SaleDetailsScreenProps) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadSale = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText(null);
      const row = await getSaleById(saleId);
      setSale(row);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось открыть продажу.';
      setErrorText(message);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    loadSale();
  }, [loadSale]);

  const handleConfirmPayment = () => {
    if (!sale || sale.status === 'paid') {
      return;
    }

    Alert.alert('Подтвердить оплату?', `Продажа ${sale.saleNumber} станет оплаченной.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Подтвердить',
        onPress: async () => {
          try {
            setConfirming(true);
            await confirmSalePayment(sale.id);
            await loadSale();
            onPaymentConfirmed?.();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Не удалось подтвердить оплату.';
            Alert.alert('Ошибка', message);
          } finally {
            setConfirming(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.backButton}>
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Детали продажи</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {sale?.saleNumber ?? 'Загрузка...'}
          </Text>
        </View>
      </View>

      {loading && !sale ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Загружаем продажу...</Text>
        </View>
      ) : null}

      {errorText ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorText}</Text>
          <ActionButton label="Повторить" onPress={loadSale} variant="secondary" />
        </View>
      ) : null}

      {sale ? (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.summary}>
              <View style={styles.summaryTop}>
                <View>
                  <Text style={styles.saleNumber}>{sale.saleNumber}</Text>
                  <Text style={styles.saleDate}>{formatDateTime(sale.createdAt)}</Text>
                </View>
                <View style={[styles.statusBadge, getStatusStyle(sale.status)]}>
                  <Text style={styles.statusText}>{SALE_STATUS_LABELS[sale.status]}</Text>
                </View>
              </View>
              <Text style={styles.total}>{formatMoney(sale.totalAmount)}</Text>
              {sale.paidAmount > 0 || sale.status !== 'paid' ? (
                <View style={styles.paymentRows}>
                  <DetailRow label="Оплачено" value={formatMoney(sale.paidAmount)} />
                  <DetailRow label="Остаток" value={formatMoney(sale.outstandingAmount)} />
                </View>
              ) : null}
            </View>

            <View style={styles.detailsPanel}>
              <DetailRow label="Продавец" value={sale.sellerName} />
              <DetailRow label="Способ оплаты" value={PAYMENT_METHOD_LABELS[sale.paymentMethod]} />
              <DetailRow label="Статус" value={SALE_STATUS_LABELS[sale.status]} />
              {sale.customerName ? <DetailRow label="Клиент" value={sale.customerName} /> : null}
              {sale.customerPhone ? <DetailRow label="Телефон" value={sale.customerPhone} /> : null}
              {sale.comment ? <DetailRow label="Комментарий" value={sale.comment} /> : null}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Товары</Text>
              <Text style={styles.sectionMeta}>{sale.items?.length ?? 0}</Text>
            </View>

            <View style={styles.itemsList}>
              {(sale.items ?? []).map((item) => (
                <View key={item.id} style={styles.itemCard}>
                  <View style={styles.itemImage}>
                    {item.productImageUrl ? (
                      <Image source={{ uri: item.productImageUrl }} style={styles.image} />
                    ) : (
                      <PackageSearch color={colors.muted} size={26} />
                    )}
                  </View>
                  <View style={styles.itemInfo}>
                    <Text numberOfLines={2} style={styles.itemName}>
                      {item.productName}
                    </Text>
                    <View style={styles.itemBarcodeRow}>
                      <Barcode color={colors.muted} size={15} />
                      <Text numberOfLines={1} style={styles.itemBarcode}>
                        {item.productBarcode ?? 'Без штрих-кода'}
                      </Text>
                    </View>
                    <Text style={styles.itemMeta}>
                      {formatMoney(item.unitPrice)} x {item.quantity}
                    </Text>
                  </View>
                  <Text style={styles.itemTotal}>{formatMoney(item.lineTotal)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {renderFooterActions ? (
            <View style={styles.footer}>
              {renderFooterActions({ sale, confirming, reloadSale: loadSale })}
            </View>
          ) : sale.status !== 'paid' && !hideDefaultPaymentAction ? (
            <View style={styles.footer}>
              <ActionButton
                icon={<CheckCircle2 color="#FFFFFF" size={22} />}
                label="Подтвердить полную оплату"
                loading={confirming}
                onPress={handleConfirmPayment}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    minHeight: 104,
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 3,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 16,
    marginTop: 12,
  },
  errorBanner: {
    margin: 16,
    gap: 12,
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
  content: {
    padding: 16,
    paddingBottom: 112,
    gap: 14,
  },
  summary: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 14,
    ...shadow,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  saleNumber: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  saleDate: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  total: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
  },
  paymentRows: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
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
  detailsPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  detailRow: {
    minHeight: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  detailValue: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
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
  sectionMeta: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '900',
  },
  itemsList: {
    gap: 10,
  },
  itemCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemImage: {
    width: 58,
    height: 58,
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
    fontSize: 15,
    fontWeight: '900',
  },
  itemBarcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  itemBarcode: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
  },
  itemMeta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  itemTotal: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    maxWidth: 92,
    textAlign: 'right',
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
