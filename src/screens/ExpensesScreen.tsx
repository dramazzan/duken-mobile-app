import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ReceiptText,
  Save,
  Trash2,
  X,
} from 'lucide-react-native';

import { ActionButton } from '../components/ActionButton';
import { formatMoney, parsePositiveNumber } from '../lib/format';
import { colors, shadow } from '../lib/theme';
import type { Expense, ExpenseCategory } from '../lib/types';
import {
  EXPENSE_CATEGORY_LABELS,
  createExpense,
  deleteExpense,
  getAllExpenses,
  subscribeToExpenses,
} from '../services/expenses.service';

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const categoryOptions = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

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
    month: 'long',
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

function sumExpenses(expenses: Expense[]) {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

export function ExpensesScreen() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('purchase');
  const [expenseDate, setExpenseDate] = useState(toDateKey(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText(null);
      const rows = await getAllExpenses();
      setExpenses(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить расходы.';
      setErrorText(message);
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    const unsubscribe = subscribeToExpenses(() => {
      loadExpenses();
    });

    return unsubscribe;
  }, [loadExpenses]);

  const selectedDateExpenses = useMemo(
    () => expenses.filter((expense) => expense.expenseDate === expenseDate),
    [expenseDate, expenses]
  );
  const todayKey = toDateKey(new Date());
  const todayExpenses = useMemo(
    () => expenses.filter((expense) => expense.expenseDate === todayKey),
    [expenses, todayKey]
  );
  const recentExpenses = expenses.slice(0, 20);

  const handleSave = async () => {
    const parsedAmount = parsePositiveNumber(amount);
    const normalizedTitle = title.trim() || EXPENSE_CATEGORY_LABELS[category];

    if (!parsedAmount || parsedAmount <= 0) {
      setErrorText('Укажите сумму расхода больше нуля.');
      return;
    }

    try {
      setSaving(true);
      setErrorText(null);
      const saved = await createExpense({
        title: normalizedTitle,
        amount: parsedAmount,
        category,
        comment,
        expenseDate,
      });

      setExpenses((current) =>
        [saved, ...current.filter((expense) => expense.id !== saved.id)].sort((left, right) => {
          const leftTime = new Date(`${left.expenseDate}T00:00:00`).getTime();
          const rightTime = new Date(`${right.expenseDate}T00:00:00`).getTime();
          return rightTime - leftTime || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        })
      );
      setAmount('');
      setTitle('');
      setComment('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось записать расход.';
      setErrorText(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (expense: Expense) => {
    Alert.alert(
      'Удалить расход?',
      `${expense.title} на сумму ${formatMoney(expense.amount)} будет удален из статистики.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              setErrorText(null);
              await deleteExpense(expense.id);
              setExpenses((current) => current.filter((row) => row.id !== expense.id));
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Не удалось удалить расход.';
              setErrorText(message);
            }
          },
        },
      ]
    );
  };

  const openCalendar = () => {
    setCalendarMonth(parseDateKey(expenseDate));
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
    setExpenseDate(toDateKey(date));
    setCalendarVisible(false);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Расходы</Text>
          <Text style={styles.subtitle}>Запись затрат магазина</Text>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : <ReceiptText color={colors.primary} size={28} />}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {errorText ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorText}</Text>
          </View>
        ) : null}

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Сегодня</Text>
            <Text numberOfLines={1} style={styles.summaryValue}>
              {formatMoney(sumExpenses(todayExpenses))}
            </Text>
            <Text style={styles.summaryNote}>{todayExpenses.length} записей</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Выбранный день</Text>
            <Text numberOfLines={1} style={styles.summaryValue}>
              {formatMoney(sumExpenses(selectedDateExpenses))}
            </Text>
            <Text style={styles.summaryNote}>{selectedDateExpenses.length} записей</Text>
          </View>
        </View>

        <View style={styles.formPanel}>
          <View style={styles.formHeader}>
            <Text style={styles.sectionTitle}>Новый расход</Text>
            <Pressable
              accessibilityRole="button"
              onPress={openCalendar}
              style={({ pressed }) => [styles.dateButton, pressed ? styles.pressed : null]}
            >
              <CalendarDays color={colors.primary} size={20} />
              <Text numberOfLines={1} style={styles.dateButtonText}>
                {formatDateKey(expenseDate)}
              </Text>
            </Pressable>
          </View>

          <View style={styles.categoryGrid}>
            {categoryOptions.map((item) => {
              const active = item === category;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={item}
                  onPress={() => setCategory(item)}
                  style={({ pressed }) => [
                    styles.categoryChip,
                    active ? styles.categoryChipActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={[styles.categoryText, active ? styles.categoryTextActive : null]}>
                    {EXPENSE_CATEGORY_LABELS[item]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            keyboardType="decimal-pad"
            onChangeText={setAmount}
            placeholder="Сумма"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={amount}
          />
          <TextInput
            onChangeText={setTitle}
            placeholder={`Название, например: ${EXPENSE_CATEGORY_LABELS[category]}`}
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={title}
          />
          <TextInput
            multiline
            onChangeText={setComment}
            placeholder="Комментарий, необязательно"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.commentInput]}
            value={comment}
          />

          <ActionButton
            icon={<Save color="#FFFFFF" size={22} />}
            label="Записать расход"
            loading={saving}
            onPress={handleSave}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Последние расходы</Text>
              <Text style={styles.sectionSubtitle}>Они сразу учитываются в статистике</Text>
            </View>
          </View>

          {recentExpenses.length ? (
            recentExpenses.map((expense) => (
              <View key={expense.id} style={styles.expenseRow}>
                <View style={styles.expenseBody}>
                  <Text numberOfLines={1} style={styles.expenseTitle}>
                    {expense.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.expenseMeta}>
                    {formatDateKey(expense.expenseDate)} · {EXPENSE_CATEGORY_LABELS[expense.category]}
                  </Text>
                  {expense.comment ? (
                    <Text numberOfLines={1} style={styles.expenseComment}>
                      {expense.comment}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.expenseRight}>
                  <Text style={styles.expenseAmount}>{formatMoney(expense.amount)}</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => handleDelete(expense)}
                    style={({ pressed }) => [styles.deleteButton, pressed ? styles.pressed : null]}
                  >
                    <Trash2 color={colors.danger} size={18} />
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Расходов пока нет.</Text>
          )}
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
                const selected = dateKey === expenseDate;
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
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    minHeight: 104,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
    justifyContent: 'space-between',
    ...shadow,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  summaryValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },
  summaryNote: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
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
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
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
  dateButton: {
    minHeight: 44,
    maxWidth: 176,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateButtonText: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChipActive: {
    backgroundColor: '#EAF7EF',
    borderColor: colors.primary,
  },
  categoryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  categoryTextActive: {
    color: colors.primary,
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
  commentInput: {
    minHeight: 88,
    textAlignVertical: 'top',
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
  expenseRow: {
    minHeight: 70,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  expenseBody: {
    flex: 1,
    minWidth: 0,
  },
  expenseTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  expenseMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
    textTransform: 'capitalize',
  },
  expenseComment: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  expenseRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  expenseAmount: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '900',
  },
  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F4B5B0',
    backgroundColor: '#FFF1F0',
    alignItems: 'center',
    justifyContent: 'center',
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
