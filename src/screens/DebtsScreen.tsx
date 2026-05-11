import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CheckCircle2, Clock3, HandCoins, Plus, Search, X } from 'lucide-react-native';

import { ActionButton } from '../components/ActionButton';
import { formatDateTime, formatMoney, parsePositiveNumber } from '../lib/format';
import { colors, shadow } from '../lib/theme';
import type { DebtorSummary, Sale } from '../lib/types';
import {
  confirmSalePayment,
  createManualDebt,
  filterSalesBySmartQuery,
  getCustomerSuggestions,
  getDebts,
  getHomePayments,
  groupSalesByCustomer,
  moveHomePaymentToDebt,
  recordDebtPayment,
  returnSaleToUnpaid,
  subscribeToSales,
} from '../services/debts.service';
import { PAYMENT_METHOD_LABELS, SALE_STATUS_LABELS } from '../services/sales.service';
import { SaleDetailsScreen } from './SaleDetailsScreen';

type DebtSection = 'debts' | 'home';

function sortSalesByDate(sales: Sale[]) {
  return [...sales].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function DebtSaleCard({
  sale,
  onPress,
}: {
  sale: Sale;
  onPress: () => void;
}) {
  const paid = sale.status === 'paid';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.saleCard,
        paid ? styles.saleCardPaid : null,
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardTitleBlock}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {sale.customerName ?? 'Клиент не указан'}
          </Text>
          <Text numberOfLines={1} style={styles.cardSubtitle}>
            {sale.customerPhone ?? sale.saleNumber}
          </Text>
        </View>
        <Text style={styles.cardAmount}>
          {formatMoney(paid ? sale.totalAmount : sale.outstandingAmount)}
        </Text>
      </View>

      <View style={styles.saleMeta}>
        <View style={styles.methodBadge}>
          <Text style={styles.methodText}>{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</Text>
        </View>
        <View style={[styles.statusBadge, paid ? styles.statusPaid : styles.statusUnpaid]}>
          <Text style={styles.statusText}>{SALE_STATUS_LABELS[sale.status]}</Text>
        </View>
        <Text style={styles.saleDate}>{formatDateTime(sale.createdAt)}</Text>
      </View>

      {sale.paidAmount > 0 ? (
        <Text style={styles.paymentProgress}>
          Оплачено {formatMoney(sale.paidAmount)} из {formatMoney(sale.totalAmount)}
        </Text>
      ) : null}

      {sale.items?.length ? (
        <Text numberOfLines={1} style={styles.itemsText}>
          {sale.items.map((item) => item.productName).join(', ')}
        </Text>
      ) : (
        <Text style={styles.itemsText}>Ручной долг</Text>
      )}

      {sale.comment ? (
        <Text numberOfLines={2} style={styles.commentText}>
          {sale.comment}
        </Text>
      ) : null}
    </Pressable>
  );
}

function DebtorRow({
  debtor,
  onPress,
}: {
  debtor: DebtorSummary;
  onPress: () => void;
}) {
  const paid = debtor.totalAmount <= 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.debtorRow,
        paid ? styles.debtorRowPaid : null,
        pressed ? styles.cardPressed : null,
      ]}
    >
      <Text numberOfLines={1} style={styles.debtorName}>
        {debtor.name}
      </Text>
      <Text numberOfLines={1} style={[styles.debtorAmount, paid ? styles.debtorAmountPaid : null]}>
        {formatMoney(debtor.totalAmount)}
      </Text>
    </Pressable>
  );
}

export function DebtsScreen() {
  const [activeSection, setActiveSection] = useState<DebtSection>('debts');
  const [debtSales, setDebtSales] = useState<Sale[]>([]);
  const [homePayments, setHomePayments] = useState<Sale[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDebtorKey, setSelectedDebtorKey] = useState<string | null>(null);
  const [selectedDebtSaleId, setSelectedDebtSaleId] = useState<string | null>(null);
  const [selectedHomeSaleId, setSelectedHomeSaleId] = useState<string | null>(null);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualCustomerSearch, setManualCustomerSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualComment, setManualComment] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<DebtorSummary[]>([]);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);
  const [partialTarget, setPartialTarget] = useState<Sale | null>(null);
  const [partialAmount, setPartialAmount] = useState('');
  const [hiddenSaleIds, setHiddenSaleIds] = useState<Set<string>>(new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [savingPartial, setSavingPartial] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [detailVersion, setDetailVersion] = useState(0);

  const updateDebtSale = (saleId: string, updater: (sale: Sale) => Sale) => {
    setDebtSales((current) =>
      sortSalesByDate(current.map((sale) => (sale.id === saleId ? updater(sale) : sale)))
    );
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText(null);

      if (activeSection === 'debts') {
        const rows = await getDebts();
        setDebtSales((current) => {
          const paidLocalRows = current.filter(
            (sale) => sale.status === 'paid' && !rows.some((row) => row.id === sale.id)
          );

          return sortSalesByDate([...rows, ...paidLocalRows]);
        });
        setHomePayments([]);
      } else {
        const rows = await getHomePayments();
        setHomePayments(filterSalesBySmartQuery(rows, searchTerm));
        setDebtSales([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить долги.';
      setErrorText(message);
      setDebtSales([]);
      setHomePayments([]);
    } finally {
      setLoading(false);
    }
  }, [activeSection, searchTerm]);

  useEffect(() => {
    const timeout = setTimeout(loadData, 220);
    return () => clearTimeout(timeout);
  }, [loadData, refreshToken]);

  useEffect(() => {
    return subscribeToSales(() => {
      setRefreshToken((current) => current + 1);
    });
  }, []);

  useEffect(() => {
    if (!manualModalVisible) {
      setCustomerSuggestions([]);
      setSelectedCustomerKey(null);
      setLoadingCustomers(false);
      return;
    }

    let cancelled = false;
    const query = manualCustomerSearch.trim();

    const timeout = setTimeout(async () => {
      try {
        setLoadingCustomers(true);
        const suggestions = await getCustomerSuggestions(query);

        if (!cancelled) {
          setCustomerSuggestions(suggestions);
        }
      } catch {
        if (!cancelled) {
          setCustomerSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingCustomers(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [manualModalVisible, manualCustomerSearch, refreshToken]);

  const resetManualForm = () => {
    setManualName('');
    setManualPhone('');
    setManualAmount('');
    setManualComment('');
    setManualCustomerSearch('');
    setSelectedCustomerKey(null);
  };

  const openManualDebt = () => {
    resetManualForm();
    setManualModalVisible(true);
  };

  const selectManualCustomer = (customer: DebtorSummary) => {
    setSelectedCustomerKey(customer.key);
    setManualCustomerSearch(customer.name === 'Клиент не указан' ? '' : customer.name);
    setManualName(customer.name === 'Клиент не указан' ? '' : customer.name);
    setManualPhone(customer.phone ?? '');
  };

  const startNewManualCustomer = () => {
    const suggestedName = manualCustomerSearch.trim();
    setSelectedCustomerKey(null);
    setManualName((current) => current || suggestedName);
    setManualPhone('');
    setManualCustomerSearch('');
  };

  const saveManualDebt = async () => {
    const amount = parsePositiveNumber(manualAmount);

    if (!manualName.trim()) {
      Alert.alert('Укажите имя', 'Для ручного долга нужно имя клиента.');
      return;
    }

    if (!amount || amount <= 0) {
      Alert.alert('Укажите сумму', 'Сумма долга должна быть больше нуля.');
      return;
    }

    try {
      setSavingManual(true);
      const sale = await createManualDebt({
        customerName: manualName,
        customerPhone: manualPhone,
        totalAmount: amount,
        comment: manualComment,
      });
      setDebtSales((current) => sortSalesByDate([sale, ...current]));
      setManualModalVisible(false);
      resetManualForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось добавить долг.';
      Alert.alert('Ошибка', message);
    } finally {
      setSavingManual(false);
    }
  };

  const markSalePaidLocally = (saleId: string) => {
    updateDebtSale(saleId, (sale) => ({
      ...sale,
      status: 'paid',
      paidAmount: sale.totalAmount,
      outstandingAmount: 0,
    }));
  };

  const markSaleUnpaidLocally = (saleId: string) => {
    updateDebtSale(saleId, (sale) => ({
      ...sale,
      status: 'unpaid',
      paidAmount: 0,
      outstandingAmount: sale.totalAmount,
    }));
  };

  const confirmDebtSale = (sale: Sale, reloadSale?: () => Promise<void>) => {
    Alert.alert('Оплата поступила?', `${sale.saleNumber}: ${formatMoney(sale.outstandingAmount)} станет оплачено.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Подтвердить',
        onPress: async () => {
          try {
            setConfirmingId(sale.id);
            await confirmSalePayment(sale.id);
            markSalePaidLocally(sale.id);
            setDetailVersion((current) => current + 1);
            await reloadSale?.();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Не удалось подтвердить оплату.';
            Alert.alert('Ошибка', message);
          } finally {
            setConfirmingId(null);
          }
        },
      },
    ]);
  };

  const returnDebtSaleToUnpaid = (sale: Sale, reloadSale?: () => Promise<void>) => {
    Alert.alert('Вернуть в неоплаченные?', `${sale.saleNumber} снова появится как долг.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Вернуть',
        onPress: async () => {
          try {
            setRevertingId(sale.id);
            await returnSaleToUnpaid(sale.id);
            markSaleUnpaidLocally(sale.id);
            setDetailVersion((current) => current + 1);
            await reloadSale?.();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Не удалось вернуть долг.';
            Alert.alert('Ошибка', message);
          } finally {
            setRevertingId(null);
          }
        },
      },
    ]);
  };

  const savePartialPayment = async () => {
    if (!partialTarget) {
      return;
    }

    const amount = parsePositiveNumber(partialAmount);

    if (!amount || amount <= 0) {
      Alert.alert('Укажите сумму', 'Сумма оплаты должна быть больше нуля.');
      return;
    }

    try {
      setSavingPartial(true);
      const updated = await recordDebtPayment(partialTarget.id, amount);
      setDebtSales((current) =>
        sortSalesByDate(current.map((sale) => (sale.id === updated.id ? updated : sale)))
      );
      setDetailVersion((current) => current + 1);
      setPartialTarget(null);
      setPartialAmount('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сократить долг.';
      Alert.alert('Ошибка', message);
    } finally {
      setSavingPartial(false);
    }
  };

  const moveHomeToDebt = (sale: Sale) => {
    Alert.alert('Переместить в долг?', `Запись ${sale.saleNumber} перейдет в раздел долгов.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'В долг',
        onPress: async () => {
          try {
            setMovingId(sale.id);
            const moved = await moveHomePaymentToDebt(sale.id);
            setHomePayments((current) => current.filter((item) => item.id !== sale.id));
            setDebtSales((current) => sortSalesByDate([moved, ...current]));
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Не удалось переместить в долг.';
            Alert.alert('Ошибка', message);
          } finally {
            setMovingId(null);
          }
        },
      },
    ]);
  };

  const confirmHomePayment = (sale: Sale) => {
    Alert.alert('Деньги поступили?', `Продажа ${sale.saleNumber} станет оплаченной.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Подтвердить',
        onPress: async () => {
          try {
            setConfirmingId(sale.id);
            await confirmSalePayment(sale.id);
            setHomePayments((current) => current.filter((item) => item.id !== sale.id));
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Не удалось подтвердить оплату.';
            Alert.alert('Ошибка', message);
          } finally {
            setConfirmingId(null);
          }
        },
      },
    ]);
  };

  const hideDebtSale = (saleId: string) => {
    setHiddenSaleIds((current) => {
      const next = new Set(current);
      next.add(saleId);
      return next;
    });
    setSelectedDebtSaleId(null);
  };

  const clearPaidForDebtor = (debtor: DebtorSummary) => {
    const visibleIds = debtor.sales
      .filter((sale) => !hiddenSaleIds.has(sale.id))
      .map((sale) => sale.id);
    const paidVisibleIds = debtor.sales
      .filter((sale) => sale.status === 'paid' && !hiddenSaleIds.has(sale.id))
      .map((sale) => sale.id);

    const hideSales = (saleIds: string[]) => {
      setHiddenSaleIds((current) => {
        const next = new Set(current);
        saleIds.forEach((id) => next.add(id));
        return next;
      });
    };

    if (!visibleIds.length) {
      Alert.alert('Нечего очищать', 'У этого клиента нет записей в списке.');
      return;
    }

    if (!paidVisibleIds.length) {
      Alert.alert(
        'Очистить долги клиента?',
        `${debtor.name}: оплаченных записей нет. "Все равно очистить" скроет все долги клиента, включая неоплаченные. История продаж не удалится.`,
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Все равно очистить',
            style: 'destructive',
            onPress: () => hideSales(visibleIds),
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Очистить долги клиента?',
      `${debtor.name}: можно скрыть только оплаченные записи (${paidVisibleIds.length}) или все долги клиента, включая неоплаченные. История продаж не удалится.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Очистить оплаченные',
          onPress: () => hideSales(paidVisibleIds),
        },
        {
          text: 'Все равно очистить',
          style: 'destructive',
          onPress: () => hideSales(visibleIds),
        },
      ]
    );
  };

  const renderDebtor = ({ item }: { item: DebtorSummary }) => (
    <DebtorRow debtor={item} onPress={() => setSelectedDebtorKey(item.key)} />
  );

  const renderHomePayment = ({ item }: { item: Sale }) => (
    <View style={styles.saleCard}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setSelectedHomeSaleId(item.id)}
        style={({ pressed }) => [styles.saleOpenArea, pressed ? styles.cardPressed : null]}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTitleBlock}>
            <Text numberOfLines={1} style={styles.cardTitle}>
              {item.customerName ?? 'Клиент не указан'}
            </Text>
            <Text numberOfLines={1} style={styles.cardSubtitle}>
              {item.customerPhone ?? item.saleNumber}
            </Text>
          </View>
          <Text style={styles.cardAmount}>{formatMoney(item.outstandingAmount)}</Text>
        </View>
        <View style={styles.saleMeta}>
          <View style={styles.methodBadge}>
            <Text style={styles.methodText}>{PAYMENT_METHOD_LABELS[item.paymentMethod]}</Text>
          </View>
          <View style={styles.statusPending}>
            <Text style={styles.statusText}>{SALE_STATUS_LABELS[item.status]}</Text>
          </View>
          <Text style={styles.saleDate}>{formatDateTime(item.createdAt)}</Text>
        </View>
        {item.items?.length ? (
          <Text numberOfLines={1} style={styles.itemsText}>
            {item.items.map((saleItem) => saleItem.productName).join(', ')}
          </Text>
        ) : null}
        {item.comment ? (
          <Text numberOfLines={2} style={styles.commentText}>
            {item.comment}
          </Text>
        ) : null}
      </Pressable>

      <View style={styles.homeActions}>
        <ActionButton
          disabled={confirmingId === item.id || movingId === item.id}
          label="В долг"
          loading={movingId === item.id}
          onPress={() => moveHomeToDebt(item)}
          variant="secondary"
          style={styles.homeActionButton}
        />
        <ActionButton
          disabled={confirmingId === item.id || movingId === item.id}
          icon={<CheckCircle2 color="#FFFFFF" size={20} />}
          label="Оплачено"
          loading={confirmingId === item.id}
          onPress={() => confirmHomePayment(item)}
          style={styles.homeActionButton}
        />
      </View>
    </View>
  );

  const visibleDebtSales = debtSales.filter((sale) => !hiddenSaleIds.has(sale.id));
  const debtors = groupSalesByCustomer(visibleDebtSales, searchTerm);
  const selectedDebtor = selectedDebtorKey
    ? groupSalesByCustomer(visibleDebtSales).find((debtor) => debtor.key === selectedDebtorKey) ?? null
    : null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Долги</Text>
        {activeSection === 'debts' ? (
          <Pressable accessibilityRole="button" onPress={openManualDebt} style={styles.addButton}>
            <Plus color="#FFFFFF" size={22} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.tabs}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeSection === 'debts' }}
          onPress={() => setActiveSection('debts')}
          style={({ pressed }) => [
            styles.tab,
            activeSection === 'debts' ? styles.tabActive : null,
            pressed ? styles.tabPressed : null,
          ]}
        >
          <HandCoins color={activeSection === 'debts' ? colors.primary : colors.muted} size={20} />
          <Text style={[styles.tabText, activeSection === 'debts' ? styles.tabTextActive : null]}>
            Долги
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeSection === 'home' }}
          onPress={() => setActiveSection('home')}
          style={({ pressed }) => [
            styles.tab,
            activeSection === 'home' ? styles.tabActive : null,
            pressed ? styles.tabPressed : null,
          ]}
        >
          <Clock3 color={activeSection === 'home' ? colors.primary : colors.muted} size={20} />
          <Text style={[styles.tabText, activeSection === 'home' ? styles.tabTextActive : null]}>
            Оплата из дома
          </Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Search color={colors.muted} size={20} />
        <TextInput
          autoCapitalize="none"
          onChangeText={setSearchTerm}
          placeholder={
            activeSection === 'debts'
              ? 'Клиент, телефон, сумма, дата, товар'
              : 'Клиент, телефон, сумма, дата, товар'
          }
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          value={searchTerm}
        />
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>

      {errorText ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorText}</Text>
          <ActionButton label="Повторить" onPress={loadData} variant="secondary" />
        </View>
      ) : null}

      {activeSection === 'debts' ? (
        <FlatList
          contentContainerStyle={debtors.length ? styles.contactListContent : styles.emptyListContent}
          data={debtors}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <HandCoins color={colors.muted} size={42} />
              <Text style={styles.emptyTitle}>
                {loading ? 'Загружаем...' : errorText ?? 'Долгов нет'}
              </Text>
            </View>
          }
          renderItem={renderDebtor}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          contentContainerStyle={homePayments.length ? styles.listContent : styles.emptyListContent}
          data={homePayments}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Clock3 color={colors.muted} size={42} />
              <Text style={styles.emptyTitle}>
                {loading ? 'Загружаем...' : errorText ?? 'Ожидающих оплат нет'}
              </Text>
            </View>
          }
          renderItem={renderHomePayment}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedDebtorKey(null)}
        presentationStyle="fullScreen"
        visible={Boolean(selectedDebtor && !selectedDebtSaleId)}
      >
        {selectedDebtor ? (
          <View style={styles.manualScreen}>
            <View style={styles.detailHeader}>
              <View style={styles.detailTitleBlock}>
                <Text numberOfLines={1} style={styles.detailTitle}>
                  {selectedDebtor.name}
                </Text>
                <Text numberOfLines={1} style={styles.detailSubtitle}>
                  {selectedDebtor.phone ?? 'Без телефона'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSelectedDebtorKey(null)}
                style={styles.closeButton}
              >
                <X color={colors.text} size={24} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.debtorDetailContent}>
              <View style={styles.totalPanel}>
                <Text style={styles.totalLabel}>Долг клиента</Text>
                <Text style={styles.totalValue}>{formatMoney(selectedDebtor.totalAmount)}</Text>
                <Text style={styles.totalMeta}>Записей: {selectedDebtor.salesCount}</Text>
              </View>

              <ActionButton
                label="Очистить все"
                onPress={() => clearPaidForDebtor(selectedDebtor)}
                variant="danger"
              />

              <View style={styles.debtorSalesList}>
                {selectedDebtor.sales.map((sale) => (
                  <DebtSaleCard
                    key={sale.id}
                    sale={sale}
                    onPress={() => setSelectedDebtSaleId(sale.id)}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setManualModalVisible(false)}
        presentationStyle="pageSheet"
        visible={manualModalVisible}
      >
        <View style={styles.manualScreen}>
          <View style={styles.detailHeader}>
            <View style={styles.detailTitleBlock}>
              <Text style={styles.detailTitle}>Добавить долг</Text>
              <Text style={styles.detailSubtitle}>Ручная запись без товаров</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={savingManual}
              onPress={() => setManualModalVisible(false)}
              style={styles.closeButton}
            >
              <X color={colors.text} size={24} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.manualContent} keyboardShouldPersistTaps="handled">
            <View style={styles.customerPanel}>
              <View style={styles.customerPanelHeader}>
                <Text style={styles.customerPanelTitle}>Клиент</Text>
                {loadingCustomers ? <ActivityIndicator color={colors.primary} /> : null}
              </View>
              <Text style={styles.customerPanelHint}>
                Выберите клиента из списка или заполните поля как нового.
              </Text>

              <View style={styles.customerSearchWrap}>
                <Search color={colors.muted} size={18} />
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setManualCustomerSearch}
                  placeholder="Поиск клиента"
                  placeholderTextColor={colors.muted}
                  style={styles.customerSearchInput}
                  value={manualCustomerSearch}
                />
              </View>

              {customerSuggestions.length ? (
                <View style={styles.customerList}>
                  {customerSuggestions.map((customer) => {
                    const selected = selectedCustomerKey === customer.key;

                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={customer.key}
                        onPress={() => selectManualCustomer(customer)}
                        style={({ pressed }) => [
                          styles.customerOption,
                          selected ? styles.customerOptionSelected : null,
                          pressed ? styles.cardPressed : null,
                        ]}
                      >
                        <View style={styles.customerOptionTop}>
                          <Text numberOfLines={1} style={styles.customerOptionName}>
                            {customer.name}
                          </Text>
                          {selected ? <CheckCircle2 color={colors.primary} size={18} /> : null}
                        </View>
                        <Text numberOfLines={1} style={styles.customerOptionPhone}>
                          {customer.phone ?? 'Без телефона'}
                        </Text>
                        <Text style={styles.customerOptionDebt}>
                          {customer.totalAmount > 0
                            ? `Текущий долг: ${formatMoney(customer.totalAmount)}`
                            : `${customer.salesCount} записей`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.customerEmptyText}>
                  {manualCustomerSearch.trim()
                    ? 'Такого клиента пока нет. Он будет добавлен как новый.'
                    : 'Введите имя или телефон, чтобы найти клиента.'}
                </Text>
              )}

              <Pressable
                accessibilityRole="button"
                onPress={startNewManualCustomer}
                style={({ pressed }) => [
                  styles.newCustomerButton,
                  pressed ? styles.cardPressed : null,
                ]}
              >
                <Plus color={colors.primary} size={18} />
                <Text style={styles.newCustomerText}>Новый клиент</Text>
              </Pressable>
            </View>

            <TextInput
              autoCapitalize="words"
              onChangeText={(value) => {
                setManualName(value);
                setSelectedCustomerKey(null);
              }}
              placeholder="Имя клиента"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={manualName}
            />
            <TextInput
              keyboardType="phone-pad"
              onChangeText={(value) => {
                setManualPhone(value);
                setSelectedCustomerKey(null);
              }}
              placeholder="Телефон, необязательно"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={manualPhone}
            />
            <TextInput
              keyboardType="numeric"
              onChangeText={setManualAmount}
              placeholder="Сумма долга"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={manualAmount}
            />
            <TextInput
              multiline
              onChangeText={setManualComment}
              placeholder="Комментарий, необязательно"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.commentInput]}
              textAlignVertical="top"
              value={manualComment}
            />
          </ScrollView>

          <View style={styles.modalFooter}>
            <ActionButton
              disabled={!manualName.trim() || !parsePositiveNumber(manualAmount)}
              label="Добавить долг"
              loading={savingManual}
              onPress={saveManualDebt}
            />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setPartialTarget(null)}
        presentationStyle="pageSheet"
        visible={Boolean(partialTarget)}
      >
        {partialTarget ? (
          <View style={styles.manualScreen}>
            <View style={styles.detailHeader}>
              <View style={styles.detailTitleBlock}>
                <Text style={styles.detailTitle}>Частичная оплата</Text>
                <Text style={styles.detailSubtitle}>
                  Остаток: {formatMoney(partialTarget.outstandingAmount)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={savingPartial}
                onPress={() => setPartialTarget(null)}
                style={styles.closeButton}
              >
                <X color={colors.text} size={24} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.manualContent} keyboardShouldPersistTaps="handled">
              <View style={styles.totalPanel}>
                <Text style={styles.totalLabel}>Остаток долга</Text>
                <Text style={styles.totalValue}>
                  {formatMoney(partialTarget.outstandingAmount)}
                </Text>
                <Text style={styles.totalMeta}>{partialTarget.saleNumber}</Text>
              </View>
              <TextInput
                keyboardType="numeric"
                onChangeText={setPartialAmount}
                placeholder="Сколько оплатил клиент"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={partialAmount}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <ActionButton
                disabled={!parsePositiveNumber(partialAmount)}
                label="Сократить долг"
                loading={savingPartial}
                onPress={savePartialPayment}
              />
            </View>
          </View>
        ) : null}
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedDebtSaleId(null)}
        presentationStyle="fullScreen"
        visible={Boolean(selectedDebtSaleId)}
      >
        {selectedDebtSaleId ? (
          <SaleDetailsScreen
            hideDefaultPaymentAction
            key={`${selectedDebtSaleId}-${detailVersion}`}
            onClose={() => setSelectedDebtSaleId(null)}
            onPaymentConfirmed={loadData}
            renderFooterActions={({ sale, reloadSale }) => (
              <View style={styles.detailActions}>
                {sale.status !== 'paid' ? (
                  <>
                    <ActionButton
                      disabled={confirmingId === sale.id || revertingId === sale.id}
                      label="Частичная оплата"
                      onPress={() => {
                        setPartialTarget(sale);
                        setPartialAmount('');
                      }}
                      variant="secondary"
                    />
                    <ActionButton
                      disabled={confirmingId === sale.id || revertingId === sale.id}
                      icon={<CheckCircle2 color="#FFFFFF" size={20} />}
                      label="Оплачено"
                      loading={confirmingId === sale.id}
                      onPress={() => confirmDebtSale(sale, reloadSale)}
                    />
                  </>
                ) : (
                  <>
                    <View style={styles.paidMark}>
                      <Text style={styles.paidMarkText}>Оплачено</Text>
                    </View>
                    <View style={styles.detailActionRow}>
                      <ActionButton
                        disabled={confirmingId === sale.id}
                        label="Вернуть на не оплачено"
                        loading={revertingId === sale.id}
                        onPress={() => returnDebtSaleToUnpaid(sale, reloadSale)}
                        variant="secondary"
                        style={styles.detailActionButton}
                      />
                      <ActionButton
                        disabled={confirmingId === sale.id || revertingId === sale.id}
                        label="Удалить из списка"
                        onPress={() => hideDebtSale(sale.id)}
                        variant="danger"
                        style={styles.detailActionButton}
                      />
                    </View>
                  </>
                )}
              </View>
            )}
            saleId={selectedDebtSaleId}
          />
        ) : null}
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedHomeSaleId(null)}
        presentationStyle="fullScreen"
        visible={Boolean(selectedHomeSaleId)}
      >
        {selectedHomeSaleId ? (
          <SaleDetailsScreen
            onClose={() => setSelectedHomeSaleId(null)}
            onPaymentConfirmed={loadData}
            saleId={selectedHomeSaleId}
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
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  tabActive: {
    backgroundColor: '#EAF7EF',
    borderColor: colors.primary,
  },
  tabPressed: {
    opacity: 0.72,
  },
  tabText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  tabTextActive: {
    color: colors.primary,
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
  contactListContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 120,
    gap: 1,
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
    gap: 10,
    ...shadow,
  },
  saleCardPaid: {
    backgroundColor: '#EEF1F4',
    opacity: 0.82,
  },
  debtorRow: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
  },
  debtorRowPaid: {
    backgroundColor: '#EEF1F4',
    opacity: 0.82,
  },
  debtorName: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  debtorAmount: {
    color: colors.danger,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'right',
  },
  debtorAmountPaid: {
    color: colors.muted,
  },
  cardPressed: {
    opacity: 0.78,
  },
  saleOpenArea: {
    gap: 9,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  cardAmount: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'right',
  },
  saleMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
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
    borderRadius: 8,
    backgroundColor: '#FFF7E6',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  statusText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  saleDate: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  itemsText: {
    color: colors.muted,
    fontSize: 13,
  },
  commentText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  paymentProgress: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  homeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  homeActionButton: {
    flex: 1,
  },
  manualScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  detailHeader: {
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
  detailTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  detailTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  detailSubtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 3,
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 16,
    ...shadow,
  },
  totalLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },
  totalValue: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 4,
  },
  totalMeta: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  paidMark: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidMarkText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '900',
  },
  detailActions: {
    gap: 10,
  },
  detailActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  detailActionButton: {
    flex: 1,
  },
  debtorDetailContent: {
    padding: 16,
    paddingBottom: 120,
    gap: 14,
  },
  debtorSalesList: {
    gap: 12,
  },
  customerPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10,
    ...shadow,
  },
  customerPanelHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  customerPanelTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  customerPanelHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  customerSearchWrap: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
  },
  customerSearchInput: {
    flex: 1,
    minHeight: 48,
    color: colors.text,
    fontSize: 15,
  },
  customerList: {
    gap: 8,
  },
  customerOption: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 11,
    gap: 5,
  },
  customerOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: '#EAF7EF',
  },
  customerOptionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  customerOptionName: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  customerOptionPhone: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  customerOptionDebt: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  customerEmptyText: {
    borderRadius: 8,
    backgroundColor: colors.surface,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    padding: 12,
  },
  newCustomerButton: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  newCustomerText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  manualContent: {
    padding: 16,
    paddingBottom: 112,
    gap: 12,
  },
  input: {
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
    minHeight: 96,
  },
  modalFooter: {
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
