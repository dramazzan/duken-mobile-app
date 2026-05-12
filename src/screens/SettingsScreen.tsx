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
import {
  History,
  Moon,
  Plus,
  RotateCcw,
  Settings,
  Sun,
  Tags,
  Trash2,
  Users,
  WalletCards,
} from 'lucide-react-native';

import { ActionButton } from '../components/ActionButton';
import { formatDateTime, formatMoney } from '../lib/format';
import { getThemeColors, type ThemeMode } from '../lib/theme';
import type { ProductCategory, Sale, TabKey } from '../lib/types';
import {
  createProductCategory,
  deleteProductCategory,
  getAllProductCategories,
  subscribeToProductCategories,
} from '../services/product-categories.service';
import { clearProducts } from '../services/products.service';
import {
  clearSalesHistory,
  getCashRegisterSummary,
  getDeletedSales,
  resetCashRegister,
  restoreAllDeletedSales,
  restoreSaleHistory,
  type CashRegisterSummary,
} from '../services/settings.service';

type SettingsScreenProps = {
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onNavigate: (tab: TabKey) => void;
  onClearCart: () => void;
};

function emptySummary(): CashRegisterSummary {
  return {
    lastResetAt: null,
    totalAmount: 0,
    cashAmount: 0,
    transferAmount: 0,
    salesCount: 0,
  };
}

export function SettingsScreen({
  themeMode,
  onThemeChange,
  onNavigate,
  onClearCart,
}: SettingsScreenProps) {
  const palette = getThemeColors(themeMode);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [summary, setSummary] = useState<CashRegisterSummary>(emptySummary);
  const [deletedSales, setDeletedSales] = useState<Sale[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadSettingsData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText(null);
      const [cashSummary, deletedRows, categoryRows] = await Promise.all([
        getCashRegisterSummary(),
        getDeletedSales(),
        getAllProductCategories(),
      ]);
      setSummary(cashSummary);
      setDeletedSales(deletedRows);
      setCategories(categoryRows);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить настройки.';
      setErrorText(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettingsData();
  }, [loadSettingsData]);

  useEffect(() => {
    return subscribeToProductCategories(() => {
      loadSettingsData();
    });
  }, [loadSettingsData]);

  const toggleTheme = () => {
    onThemeChange(themeMode === 'dark' ? 'light' : 'dark');
  };

  const handleAddCategory = async () => {
    const name = categoryName.trim();

    if (!name) {
      Alert.alert('Введите категорию', 'Название категории обязательно.');
      return;
    }

    try {
      setWorking(true);
      setErrorText(null);
      await createProductCategory(name);
      setCategoryName('');
      await loadSettingsData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось добавить категорию.';
      Alert.alert('Ошибка', message);
    } finally {
      setWorking(false);
    }
  };

  const handleDeleteCategory = (category: ProductCategory) => {
    Alert.alert(
      'Удалить категорию?',
      `Категория "${category.name}" исчезнет из списка выбора. У товаров с этой категорией поле категории очистится.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              setWorking(true);
              setErrorText(null);
              await deleteProductCategory(category);
              await loadSettingsData();
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Не удалось удалить категорию.';
              Alert.alert('Ошибка', message);
            } finally {
              setWorking(false);
            }
          },
        },
      ]
    );
  };

  const handleResetCash = () => {
    Alert.alert(
      'Обнулить кассу?',
      'Продажи останутся в истории. Счетчик кассы с этого момента начнется заново.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Обнулить',
          style: 'destructive',
          onPress: async () => {
            try {
              setWorking(true);
              setErrorText(null);
              await resetCashRegister(summary);
              onClearCart();
              await loadSettingsData();
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Не удалось обнулить кассу.';
              Alert.alert('Ошибка', message);
            } finally {
              setWorking(false);
            }
          },
        },
      ]
    );
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Очистить историю продаж?',
      'История исчезнет из списков, но ее можно будет восстановить в блоке недавно удаленных.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Очистить',
          style: 'destructive',
          onPress: async () => {
            try {
              setWorking(true);
              setErrorText(null);
              await clearSalesHistory();
              await loadSettingsData();
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Не удалось очистить историю.';
              Alert.alert('Ошибка', message);
            } finally {
              setWorking(false);
            }
          },
        },
      ]
    );
  };

  const handleClearProducts = () => {
    Alert.alert(
      'Очистить все товары?',
      'Все товары будут удалены из списка и кассы. История продаж останется, но старые позиции больше не будут связаны с карточками товаров.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Очистить товары',
          style: 'destructive',
          onPress: async () => {
            try {
              setWorking(true);
              setErrorText(null);
              const count = await clearProducts();
              onClearCart();
              await loadSettingsData();
              Alert.alert('Товары очищены', `Удалено товаров: ${count}.`);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Не удалось очистить товары.';
              Alert.alert('Ошибка', message);
            } finally {
              setWorking(false);
            }
          },
        },
      ]
    );
  };

  const handleRestoreSale = async (sale: Sale) => {
    try {
      setWorking(true);
      setErrorText(null);
      await restoreSaleHistory(sale.id);
      await loadSettingsData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось восстановить продажу.';
      Alert.alert('Ошибка', message);
    } finally {
      setWorking(false);
    }
  };

  const handleRestoreAll = () => {
    if (!deletedSales.length) {
      return;
    }

    Alert.alert('Восстановить историю?', 'Все недавно удаленные продажи вернутся в историю.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Восстановить',
        onPress: async () => {
          try {
            setWorking(true);
            setErrorText(null);
            await restoreAllDeletedSales();
            await loadSettingsData();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Не удалось восстановить историю.';
            Alert.alert('Ошибка', message);
          } finally {
            setWorking(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Настройки</Text>
          <Text style={styles.subtitle}>Данные, касса и оформление</Text>
        </View>
        {loading ? <ActivityIndicator color={palette.primary} /> : <Settings color={palette.primary} size={28} />}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {errorText ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorText}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Тема</Text>
              <Text style={styles.sectionSubtitle}>
                {themeMode === 'dark' ? 'Темная тема включена' : 'Светлая тема включена'}
              </Text>
            </View>
            {themeMode === 'dark' ? <Moon color={palette.primary} size={24} /> : <Sun color={palette.primary} size={24} />}
          </View>
          <ActionButton
            label={themeMode === 'dark' ? 'Включить светлую' : 'Включить темную'}
            onPress={toggleTheme}
            variant="secondary"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWrap}>
              <Text style={styles.sectionTitle}>Категории товаров</Text>
              <Text style={styles.sectionSubtitle}>Добавляйте категории здесь, затем выбирайте их в товаре</Text>
            </View>
            <Tags color={palette.primary} size={24} />
          </View>

          <View style={styles.categoryForm}>
            <TextInput
              autoCapitalize="sentences"
              editable={!working}
              onChangeText={setCategoryName}
              onSubmitEditing={handleAddCategory}
              placeholder="Название категории"
              placeholderTextColor={palette.muted}
              returnKeyType="done"
              style={styles.categoryInput}
              value={categoryName}
            />
            <Pressable
              accessibilityRole="button"
              disabled={working}
              onPress={handleAddCategory}
              style={({ pressed }) => [
                styles.addCategoryButton,
                working ? styles.disabledButton : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Plus color="#FFFFFF" size={22} />
            </Pressable>
          </View>

          {categories.length ? (
            <View style={styles.categoryList}>
              {categories.map((category) => (
                <View key={category.id} style={styles.categoryRow}>
                  <Text numberOfLines={1} style={styles.categoryName}>
                    {category.name}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={working}
                    onPress={() => handleDeleteCategory(category)}
                    style={({ pressed }) => [
                      styles.deleteCategoryButton,
                      working ? styles.disabledButton : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Trash2 color={palette.danger} size={18} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>Категорий пока нет.</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Касса</Text>
              <Text style={styles.sectionSubtitle}>
                {summary.lastResetAt ? `С ${formatDateTime(summary.lastResetAt)}` : 'Обнуления еще не было'}
              </Text>
            </View>
            <WalletCards color={palette.primary} size={24} />
          </View>
          <View style={styles.cashGrid}>
            <View style={styles.cashCard}>
              <Text style={styles.cashLabel}>Всего</Text>
              <Text style={styles.cashValue}>{formatMoney(summary.totalAmount)}</Text>
            </View>
            <View style={styles.cashCard}>
              <Text style={styles.cashLabel}>Наличные</Text>
              <Text style={styles.cashValue}>{formatMoney(summary.cashAmount)}</Text>
            </View>
            <View style={styles.cashCard}>
              <Text style={styles.cashLabel}>Перевод</Text>
              <Text style={styles.cashValue}>{formatMoney(summary.transferAmount)}</Text>
            </View>
            <View style={styles.cashCard}>
              <Text style={styles.cashLabel}>Чеки</Text>
              <Text style={styles.cashValue}>{summary.salesCount}</Text>
            </View>
          </View>
          <ActionButton
            icon={<RotateCcw color={palette.text} size={20} />}
            label="Обнулить кассу"
            loading={working}
            onPress={handleResetCash}
            variant="secondary"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>История продаж</Text>
              <Text style={styles.sectionSubtitle}>Очистка без окончательного удаления</Text>
            </View>
            <History color={palette.primary} size={24} />
          </View>
          <ActionButton
            icon={<Trash2 color={palette.text} size={20} />}
            label="Очистить историю"
            loading={working}
            onPress={handleClearHistory}
            variant="danger"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Товары</Text>
              <Text style={styles.sectionSubtitle}>Полная очистка списка товаров и кассы</Text>
            </View>
            <Trash2 color={palette.danger} size={24} />
          </View>
          <ActionButton
            icon={<Trash2 color={palette.text} size={20} />}
            label="Очистить товары"
            loading={working}
            onPress={handleClearProducts}
            variant="danger"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Недавно удаленные</Text>
              <Text style={styles.sectionSubtitle}>{deletedSales.length} продаж можно восстановить</Text>
            </View>
            <ActionButton
              disabled={!deletedSales.length}
              label="Все"
              onPress={handleRestoreAll}
              variant="secondary"
            />
          </View>

          {deletedSales.length ? (
            deletedSales.map((sale) => (
              <View key={sale.id} style={styles.deletedRow}>
                <View style={styles.deletedInfo}>
                  <Text style={styles.deletedTitle}>{sale.saleNumber}</Text>
                  <Text style={styles.deletedMeta}>
                    {formatDateTime(sale.createdAt)} · {formatMoney(sale.totalAmount)}
                  </Text>
                  {sale.deletedAt ? (
                    <Text style={styles.deletedMeta}>Удалено: {formatDateTime(sale.deletedAt)}</Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={working}
                  onPress={() => handleRestoreSale(sale)}
                  style={({ pressed }) => [styles.restoreButton, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.restoreText}>Вернуть</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Удаленной истории пока нет.</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Продавцы</Text>
              <Text style={styles.sectionSubtitle}>Управление продавцами и продавцом по умолчанию</Text>
            </View>
            <Users color={palette.primary} size={24} />
          </View>
          <ActionButton
            label="Открыть продавцов"
            onPress={() => onNavigate('sellers')}
            variant="secondary"
          />
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(palette: ReturnType<typeof getThemeColors>) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.background,
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
      color: palette.text,
      fontSize: 28,
      fontWeight: '900',
    },
    subtitle: {
      color: palette.muted,
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
      color: palette.danger,
      fontSize: 14,
      fontWeight: '800',
      lineHeight: 20,
    },
    section: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.card,
      padding: 14,
      gap: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    sectionTitleWrap: {
      flex: 1,
      minWidth: 0,
    },
    sectionTitle: {
      color: palette.text,
      fontSize: 18,
      fontWeight: '900',
    },
    sectionSubtitle: {
      color: palette.muted,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 3,
      lineHeight: 18,
    },
    categoryForm: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    categoryInput: {
      flex: 1,
      minHeight: 48,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      color: palette.text,
      fontSize: 16,
      fontWeight: '700',
      paddingHorizontal: 12,
    },
    addCategoryButton: {
      width: 48,
      height: 48,
      borderRadius: 8,
      backgroundColor: palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryList: {
      gap: 8,
    },
    categoryRow: {
      minHeight: 48,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      paddingLeft: 12,
      paddingRight: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    categoryName: {
      flex: 1,
      color: palette.text,
      fontSize: 15,
      fontWeight: '900',
    },
    deleteCategoryButton: {
      width: 40,
      height: 40,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFF1F0',
      borderColor: '#F4B5B0',
      borderWidth: 1,
    },
    disabledButton: {
      opacity: 0.5,
    },
    cashGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    cashCard: {
      width: '48.3%',
      minHeight: 82,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      padding: 12,
      justifyContent: 'space-between',
    },
    cashLabel: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: '800',
    },
    cashValue: {
      color: palette.text,
      fontSize: 17,
      fontWeight: '900',
      marginTop: 8,
    },
    deletedRow: {
      minHeight: 70,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      paddingTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    deletedInfo: {
      flex: 1,
      minWidth: 0,
    },
    deletedTitle: {
      color: palette.text,
      fontSize: 15,
      fontWeight: '900',
    },
    deletedMeta: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 3,
    },
    restoreButton: {
      minHeight: 40,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    restoreText: {
      color: palette.primary,
      fontSize: 13,
      fontWeight: '900',
    },
    emptyText: {
      color: palette.muted,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 20,
    },
    pressed: {
      opacity: 0.72,
    },
  });
}
