import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  HandCoins,
  History,
  PackageSearch,
  PlusCircle,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react-native';

import { colors, shadow } from '../lib/theme';
import type { TabKey } from '../lib/types';

type ServicesScreenProps = {
  onNavigate: (tab: TabKey) => void;
};

const services: Array<{
  key: TabKey;
  title: string;
  subtitle: string;
  Icon: LucideIcon;
}> = [
  {
    key: 'history',
    title: 'История',
    subtitle: 'Продажи и оплаты',
    Icon: History,
  },
  {
    key: 'debts',
    title: 'Долги',
    subtitle: 'Клиенты и оплаты',
    Icon: HandCoins,
  },
  {
    key: 'statistics',
    title: 'Статистика',
    subtitle: 'Продажи и остатки',
    Icon: TrendingUp,
  },
  {
    key: 'expenses',
    title: 'Расходы',
    subtitle: 'Затраты магазина',
    Icon: ReceiptText,
  },
  {
    key: 'cashier',
    title: 'Касса',
    subtitle: 'Новая продажа',
    Icon: ShoppingCart,
  },
  {
    key: 'products',
    title: 'Товары',
    subtitle: 'Склад и остатки',
    Icon: PackageSearch,
  },
  {
    key: 'add',
    title: 'Добавить',
    subtitle: 'Новый товар',
    Icon: PlusCircle,
  },
];

export function ServicesScreen({ onNavigate }: ServicesScreenProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Сервисы</Text>
        <Text style={styles.subtitle}>Быстрый доступ к разделам приложения</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {services.map(({ key, title, subtitle, Icon }) => (
            <Pressable
              accessibilityRole="button"
              key={key}
              onPress={() => onNavigate(key)}
              style={({ pressed }) => [styles.serviceTile, pressed ? styles.tilePressed : null]}
            >
              <View style={styles.iconBox}>
                <Icon color={colors.primary} size={28} />
              </View>
              <Text numberOfLines={1} style={styles.tileTitle}>
                {title}
              </Text>
              <Text numberOfLines={2} style={styles.tileSubtitle}>
                {subtitle}
              </Text>
            </Pressable>
          ))}
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
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  content: {
    padding: 16,
    paddingTop: 6,
    paddingBottom: 120,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  serviceTile: {
    width: '48%',
    minHeight: 142,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 14,
    justifyContent: 'space-between',
    ...shadow,
  },
  tilePressed: {
    opacity: 0.74,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#EAF7EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 12,
  },
  tileSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
  },
});
