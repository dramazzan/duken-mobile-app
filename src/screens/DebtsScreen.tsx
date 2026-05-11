import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  PanResponder,
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
  confirmSalesPayment,
  createManualDebt,
  filterSalesBySmartQuery,
  getDebtCustomers,
  getHomePayments,
  moveHomePaymentToDebt,
  recordDebtPayment,
  subscribeToSales,
} from '../services/debts.service';
import { PAYMENT_METHOD_LABELS, SALE_STATUS_LABELS } from '../services/sales.service';
import { SaleDetailsScreen } from './SaleDetailsScreen';

type DebtSection = 'debts' | 'home';

function saleMatchesDaySearch(sale: Sale, query: string) {
  const term = query.trim().toLocaleLowerCase('ru-RU');

  if (!term) {
    return true;
  }

  const date = new Date(sale.createdAt);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  if (term === 'сегодня') {
    return isSameDay(date, today);
  }

  if (term === 'вчера') {
    return isSameDay(date, yesterday);
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  const searchable = [
    formatDateTime(sale.createdAt),
    date.toLocaleDateString('ru-KZ'),
    date.toLocaleDateString('ru-RU'),
    new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(date),
    `${day}.${month}`,
    `${day}.${month}.${year}`,
    `${year}-${month}-${day}`,
  ]
    .join(' ')
    .toLocaleLowerCase('ru-RU');

  return searchable.includes(term);
}

function SwipeableDebtEntry({
  sale,
  confirming,
  onOpenDetails,
  onPartialPayment,
  onConfirmPayment,
}: {
  sale: Sale;
  confirming: boolean;
  onOpenDetails: () => void;
  onPartialPayment: () => void;
  onConfirmPayment: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => {
        translateX.setValue(Math.max(Math.min(gesture.dx, 112), -112));
      },
      onPanResponderRelease: (_, gesture) => {
        const reset = (afterReset?: () => void) => {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start(afterReset);
        };

        if (gesture.dx > 86) {
          reset(onPartialPayment);
          return;
        }

        if (gesture.dx < -86) {
          reset(onConfirmPayment);
          return;
        }

        reset();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  return (
    <View style={styles.swipeShell}>
      <View style={styles.swipeBackground}>
        <View style={styles.swipePartial}>
          <Text style={styles.swipeText}>Частично</Text>
        </View>
        <View style={styles.swipeClose}>
          <Text style={styles.swipeText}>Закрыть</Text>
        </View>
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.entryCard, { transform: [{ translateX }] }]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onOpenDetails}
          style={({ pressed }) => [styles.entryOpenArea, pressed ? styles.cardPressed : null]}
        >
          <View style={styles.cardTop}>
            <View style={styles.cardTitleBlock}>
              <Text style={styles.entryNumber}>{sale.saleNumber}</Text>
              <Text style={styles.cardSubtitle}>{formatDateTime(sale.createdAt)}</Text>
            </View>
            <Text style={styles.cardAmount}>{formatMoney(sale.outstandingAmount)}</Text>
          </View>
          {sale.paidAmount > 0 ? (
            <Text style={styles.paymentProgress}>
              Оплачено {formatMoney(sale.paidAmount)} из {formatMoney(sale.totalAmount)}
            </Text>
          ) : null}
          {sale.items?.length ? (
            <Text numberOfLines={1} style={styles.itemsText}>
              {sale.items.map((saleItem) => saleItem.productName).join(', ')}
            </Text>
          ) : (
            <Text style={styles.itemsText}>Ручной долг</Text>
          )}
          {sale.comment ? (
            <Text numberOfLines={2} style={styles.commentText}>
              {sale.comment}
            </Text>
          ) : null}
          {confirming ? <ActivityIndicator color={colors.primary} /> : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function DebtsScreen() {
  const [activeSection, setActiveSection] = useState<DebtSection>('debts');
  const [debtors, setDebtors] = useState<DebtorSummary[]>([]);
  const [homePayments, setHomePayments] = useState<Sale[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDebtor, setSelectedDebtor] = useState<DebtorSummary | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualComment, setManualComment] = useState('');
  const [partialTarget, setPartialTarget] = useState<Sale | null>(null);
  const [partialAmount, setPartialAmount] = useState('');
  const [detailSearchTerm, setDetailSearchTerm] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [savingPartial, setSavingPartial] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText(null);

      if (activeSection === 'debts') {
        const rows = await getDebtCustomers(searchTerm);
        setDebtors(rows);
        setHomePayments([]);
        setSelectedDebtor((current) =>
          current ? rows.find((row) => row.key === current.key) ?? null : null
        );
      } else {
        const rows = await getHomePayments();
        setHomePayments(filterSalesBySmartQuery(rows, searchTerm));
        setDebtors([]);
        setSelectedDebtor(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить долги.';
      setErrorText(message);
      setDebtors([]);
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

  const resetManualForm = () => {
    setManualName('');
    setManualPhone('');
    setManualAmount('');
    setManualComment('');
  };

  const openManualDebt = () => {
    resetManualForm();
    setManualModalVisible(true);
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
      await createManualDebt({
        customerName: manualName,
        customerPhone: manualPhone,
        totalAmount: amount,
        comment: manualComment,
      });
      setManualModalVisible(false);
      resetManualForm();
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось добавить долг.';
      Alert.alert('Ошибка', message);
    } finally {
      setSavingManual(false);
    }
  };

  const confirmOneSale = (sale: Sale) => {
    Alert.alert('Оплата поступила?', `${sale.saleNumber}: ${formatMoney(sale.outstandingAmount)} станет оплачено.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Подтвердить',
        onPress: async () => {
          try {
            setConfirmingId(sale.id);
            await confirmSalePayment(sale.id);
            await loadData();
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

  const confirmWholeDebt = (debtor: DebtorSummary) => {
    Alert.alert('Оплатить весь долг?', `${debtor.name}: ${formatMoney(debtor.totalAmount)}`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Подтвердить',
        onPress: async () => {
          try {
            setConfirmingId(debtor.key);
            await confirmSalesPayment(debtor.sales.map((sale) => sale.id));
            setSelectedDebtor(null);
            await loadData();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Не удалось закрыть долг.';
            Alert.alert('Ошибка', message);
          } finally {
            setConfirmingId(null);
          }
        },
      },
    ]);
  };

  const openPartialPayment = (sale: Sale) => {
    setPartialTarget(sale);
    setPartialAmount('');
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

      await recordDebtPayment(partialTarget.id, amount);

      setPartialTarget(null);
      setPartialAmount('');
      await loadData();
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
            await moveHomePaymentToDebt(sale.id);
            await loadData();
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

  const renderDebtor = ({ item }: { item: DebtorSummary }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        setDetailSearchTerm('');
        setSelectedDebtor(item);
      }}
      style={({ pressed }) => [styles.debtorCard, pressed ? styles.cardPressed : null]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardTitleBlock}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {item.name}
          </Text>
          <Text numberOfLines={1} style={styles.cardSubtitle}>
            {item.phone ?? 'Без телефона'} · {item.salesCount} записей
          </Text>
        </View>
        <Text style={styles.cardAmount}>{formatMoney(item.totalAmount)}</Text>
      </View>
      <Text style={styles.cardMeta}>Последний долг: {formatDateTime(item.latestAt)}</Text>
    </Pressable>
  );

  const renderHomePayment = ({ item }: { item: Sale }) => (
    <View style={styles.homeCard}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setSelectedSaleId(item.id)}
        style={({ pressed }) => [styles.homeOpenArea, pressed ? styles.cardPressed : null]}
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
          <View style={styles.pendingBadge}>
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
          onPress={() => confirmOneSale(item)}
          style={styles.homeActionButton}
        />
      </View>
    </View>
  );

  const selectedDebtorSales = selectedDebtor
    ? selectedDebtor.sales.filter((sale) => saleMatchesDaySearch(sale, detailSearchTerm))
    : [];

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
              ? 'Имя, телефон, сумма, дата, товар'
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
          contentContainerStyle={debtors.length ? styles.listContent : styles.emptyListContent}
          data={debtors}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <HandCoins color={colors.muted} size={42} />
              <Text style={styles.emptyTitle}>
                {loading ? 'Загружаем...' : errorText ?? 'Должников нет'}
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
        onRequestClose={() => setSelectedDebtor(null)}
        presentationStyle="fullScreen"
        visible={Boolean(selectedDebtor)}
      >
        {selectedDebtor ? (
          <View style={styles.detailScreen}>
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
                onPress={() => setSelectedDebtor(null)}
                style={styles.closeButton}
              >
                <X color={colors.text} size={24} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              <View style={styles.totalPanel}>
                <Text style={styles.totalLabel}>Остаток долга</Text>
                <Text style={styles.totalValue}>{formatMoney(selectedDebtor.totalAmount)}</Text>
                <Text style={styles.totalMeta}>{selectedDebtor.salesCount} записей</Text>
              </View>

              <ActionButton
                disabled={!selectedDebtor.sales.length}
                icon={<CheckCircle2 color="#FFFFFF" size={21} />}
                label="Оплатить весь долг"
                loading={confirmingId === selectedDebtor.key}
                onPress={() => confirmWholeDebt(selectedDebtor)}
              />

              <View style={styles.detailSearchWrap}>
                <Search color={colors.muted} size={20} />
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setDetailSearchTerm}
                  placeholder="Найти по дню или дате"
                  placeholderTextColor={colors.muted}
                  style={styles.detailSearchInput}
                  value={detailSearchTerm}
                />
              </View>

              <View style={styles.debtEntries}>
                {selectedDebtorSales.map((sale) => (
                  <SwipeableDebtEntry
                    confirming={confirmingId === sale.id}
                    key={sale.id}
                    onConfirmPayment={() => confirmOneSale(sale)}
                    onOpenDetails={() => setSelectedSaleId(sale.id)}
                    onPartialPayment={() => openPartialPayment(sale)}
                    sale={sale}
                  />
                ))}

                {!selectedDebtorSales.length ? (
                  <View style={styles.emptyInline}>
                    <Text style={styles.emptyInlineText}>За этот день записей нет</Text>
                  </View>
                ) : null}
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
            <TextInput
              autoCapitalize="words"
              onChangeText={setManualName}
              placeholder="Имя клиента"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={manualName}
            />
            <TextInput
              keyboardType="phone-pad"
              onChangeText={setManualPhone}
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
                <Text style={styles.totalLabel}>Долг по записи</Text>
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
        onRequestClose={() => setSelectedSaleId(null)}
        presentationStyle="fullScreen"
        visible={Boolean(selectedSaleId)}
      >
        {selectedSaleId ? (
          <SaleDetailsScreen
            onClose={() => setSelectedSaleId(null)}
            onPaymentConfirmed={loadData}
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
  debtorCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 8,
    ...shadow,
  },
  homeCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 12,
    ...shadow,
  },
  cardPressed: {
    opacity: 0.78,
  },
  homeOpenArea: {
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
  cardMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
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
  pendingBadge: {
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
  detailScreen: {
    flex: 1,
    backgroundColor: colors.background,
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
  detailContent: {
    padding: 16,
    paddingBottom: 120,
    gap: 14,
  },
  detailSearchWrap: {
    minHeight: 52,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailSearchInput: {
    flex: 1,
    minHeight: 52,
    color: colors.text,
    fontSize: 16,
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
  debtEntries: {
    gap: 12,
  },
  swipeShell: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  swipeBackground: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  swipePartial: {
    width: 120,
    backgroundColor: '#EAF7EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeClose: {
    width: 120,
    marginLeft: 'auto',
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  entryCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 12,
  },
  entryOpenArea: {
    gap: 8,
  },
  entryNumber: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  emptyInline: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    alignItems: 'center',
  },
  emptyInlineText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '800',
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
