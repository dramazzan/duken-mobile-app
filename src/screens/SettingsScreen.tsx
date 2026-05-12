import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  History,
  Moon,
  RotateCcw,
  Settings,
  Sun,
  Trash2,
  Users,
  WalletCards,
} from 'lucide-react-native';

import { ActionButton } from '../components/ActionButton';
import { formatDateTime, formatMoney } from '../lib/format';
import { getThemeColors, type ThemeMode } from '../lib/theme';
import type { Sale, TabKey } from '../lib/types';
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
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadSettingsData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText(null);
      const [cashSummary, deletedRows] = await Promise.all([
        getCashRegisterSummary(),
        getDeletedSales(),
      ]);
      setSummary(cashSummary);
      setDeletedSales(deletedRows);
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

  const toggleTheme = () => {
    onThemeChange(themeMode === 'dark' ? 'light' : 'dark');
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
