import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CheckCircle2, Edit3, Star, UserPlus, Users } from 'lucide-react-native';

import { ActionButton } from '../components/ActionButton';
import { formatDateTime, formatMoney } from '../lib/format';
import { colors, shadow } from '../lib/theme';
import type { Sale, Seller } from '../lib/types';
import {
  PAYMENT_METHOD_LABELS,
  getAllSales,
  subscribeToSales,
} from '../services/sales.service';
import {
  createSeller,
  getAllSellers,
  getDefaultSeller,
  setDefaultSeller,
  subscribeToSellers,
  updateSeller,
} from '../services/sellers.service';

function getSellerSales(seller: Seller, sales: Sale[]) {
  return sales.filter((sale) => sale.sellerId === seller.id);
}

function getLatestSaleDate(sales: Sale[]) {
  return sales.reduce<string | null>((latest, sale) => {
    if (!latest || new Date(sale.createdAt).getTime() > new Date(latest).getTime()) {
      return sale.createdAt;
    }

    return latest;
  }, null);
}

function sumSales(sales: Sale[]) {
  return sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
}

export function SellersScreen() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [editingSellerId, setEditingSellerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText(null);
      const [sellerRows, saleRows] = await Promise.all([getAllSellers(), getAllSales()]);
      setSellers(sellerRows);
      setSales(saleRows);

      setSelectedSellerId((current) => {
        if (current && sellerRows.some((seller) => seller.id === current)) {
          return current;
        }

        return getDefaultSeller(sellerRows)?.id ?? sellerRows[0]?.id ?? null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить продавцов.';
      setErrorText(message);
      setSellers([]);
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsubscribeSellers = subscribeToSellers(() => {
      loadData();
    });
    const unsubscribeSales = subscribeToSales(() => {
      loadData();
    });

    return () => {
      unsubscribeSellers();
      unsubscribeSales();
    };
  }, [loadData]);

  const selectedSeller = useMemo(
    () => sellers.find((seller) => seller.id === selectedSellerId) ?? null,
    [selectedSellerId, sellers]
  );
  const selectedSales = useMemo(
    () => (selectedSeller ? getSellerSales(selectedSeller, sales) : []),
    [sales, selectedSeller]
  );
  const defaultSeller = getDefaultSeller(sellers);

  const resetForm = () => {
    setEditingSellerId(null);
    setName('');
    setPhone('');
  };

  const startEdit = (seller: Seller) => {
    setEditingSellerId(seller.id);
    setName(seller.name);
    setPhone(seller.phone ?? '');
  };

  const handleSave = async () => {
    const normalizedName = name.trim();

    if (!normalizedName) {
      setErrorText('Укажите имя продавца.');
      return;
    }

    try {
      setSaving(true);
      setErrorText(null);

      if (editingSellerId) {
        await updateSeller(editingSellerId, {
          name: normalizedName,
          phone,
          isActive: true,
        });
      } else {
        const seller = await createSeller({
          name: normalizedName,
          phone,
          isActive: true,
        });
        setSelectedSellerId(seller.id);
      }

      resetForm();
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сохранить продавца.';
      setErrorText(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (seller: Seller) => {
    try {
      setSaving(true);
      setErrorText(null);
      await setDefaultSeller(seller.id);
      setSelectedSellerId(seller.id);
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось выбрать продавца.';
      Alert.alert('Ошибка', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Продавцы</Text>
          <Text style={styles.subtitle}>
            По умолчанию: {defaultSeller?.name ?? 'не выбран'}
          </Text>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : <Users color={colors.primary} size={28} />}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {errorText ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorText}</Text>
          </View>
        ) : null}

        <View style={styles.formPanel}>
          <Text style={styles.sectionTitle}>
            {editingSellerId ? 'Изменить продавца' : 'Новый продавец'}
          </Text>
          <TextInput
            autoCapitalize="words"
            onChangeText={setName}
            placeholder="Имя продавца"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={name}
          />
          <TextInput
            keyboardType="phone-pad"
            onChangeText={setPhone}
            placeholder="Телефон, необязательно"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={phone}
          />
          <View style={styles.formActions}>
            <ActionButton
              icon={<UserPlus color="#FFFFFF" size={21} />}
              label={editingSellerId ? 'Сохранить' : 'Добавить'}
              loading={saving}
              onPress={handleSave}
              style={styles.formButton}
            />
            {editingSellerId ? (
              <ActionButton
                label="Отмена"
                onPress={resetForm}
                style={styles.formButton}
                variant="secondary"
              />
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Список продавцов</Text>
          {sellers.length ? (
            sellers.map((seller) => {
              const sellerSales = getSellerSales(seller, sales);
              const latestSaleDate = getLatestSaleDate(sellerSales);
              const selected = seller.id === selectedSellerId;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={seller.id}
                  onPress={() => setSelectedSellerId(seller.id)}
                  style={({ pressed }) => [
                    styles.sellerCard,
                    selected ? styles.sellerCardSelected : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <View style={styles.sellerTop}>
                    <View style={styles.sellerInfo}>
                      <View style={styles.sellerNameRow}>
                        <Text numberOfLines={1} style={styles.sellerName}>
                          {seller.name}
                        </Text>
                        {seller.isDefault ? (
                          <View style={styles.defaultBadge}>
                            <Star color={colors.primary} size={14} />
                            <Text style={styles.defaultText}>По умолчанию</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text numberOfLines={1} style={styles.sellerPhone}>
                        {seller.phone ?? 'Телефон не указан'}
                      </Text>
                    </View>
                    <Text style={styles.sellerTotal}>{formatMoney(sumSales(sellerSales))}</Text>
                  </View>

                  <View style={styles.sellerStats}>
                    <Text style={styles.sellerStatText}>{sellerSales.length} продаж</Text>
                    <Text style={styles.sellerStatText}>
                      {latestSaleDate ? formatDateTime(latestSaleDate) : 'Продаж нет'}
                    </Text>
                  </View>

                  <View style={styles.sellerActions}>
                    {!seller.isDefault ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={saving}
                        onPress={() => handleSetDefault(seller)}
                        style={({ pressed }) => [
                          styles.smallAction,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <CheckCircle2 color={colors.primary} size={18} />
                        <Text style={styles.smallActionText}>По умолчанию</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => startEdit(seller)}
                      style={({ pressed }) => [styles.smallAction, pressed ? styles.pressed : null]}
                    >
                      <Edit3 color={colors.text} size={18} />
                      <Text style={styles.smallActionText}>Изменить</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          ) : (
            <Text style={styles.emptyText}>Продавцов пока нет.</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Продажи продавца</Text>
              <Text style={styles.sectionSubtitle}>{selectedSeller?.name ?? 'Выберите продавца'}</Text>
            </View>
            <Text style={styles.sectionAmount}>{formatMoney(sumSales(selectedSales))}</Text>
          </View>

          {selectedSales.length ? (
            selectedSales.slice(0, 30).map((sale) => (
              <View key={sale.id} style={styles.saleRow}>
                <View style={styles.saleInfo}>
                  <Text style={styles.saleNumber}>{sale.saleNumber}</Text>
                  <Text style={styles.saleMeta}>
                    {formatDateTime(sale.createdAt)} · {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
                  </Text>
                </View>
                <Text style={styles.saleAmount}>{formatMoney(sale.totalAmount)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>У этого продавца продаж пока нет.</Text>
          )}
        </View>
      </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
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
  formPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 12,
    ...shadow,
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
    fontWeight: '800',
    marginTop: 3,
  },
  sectionAmount: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  input: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
  },
  formButton: {
    flex: 1,
  },
  sellerCard: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    gap: 10,
  },
  sellerCardSelected: {
    backgroundColor: '#F8FCFA',
  },
  sellerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  sellerInfo: {
    flex: 1,
    minWidth: 0,
  },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sellerName: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  defaultBadge: {
    borderRadius: 8,
    backgroundColor: '#EAF7EF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  defaultText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  sellerPhone: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  sellerTotal: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  sellerStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  sellerStatText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  sellerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallAction: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  smallActionText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  saleRow: {
    minHeight: 58,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 10,
  },
  saleInfo: {
    flex: 1,
    minWidth: 0,
  },
  saleNumber: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  saleMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  saleAmount: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.72,
  },
});
