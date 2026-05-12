import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Grid3X3, HandCoins, PackageSearch, PlusCircle, ShoppingCart } from 'lucide-react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { assertSupabaseConfigured } from './src/lib/supabase';
import { colors } from './src/lib/theme';
import type { CartLine, TabKey } from './src/lib/types';
import { AddProductScreen } from './src/screens/AddProductScreen';
import { CashierScreen } from './src/screens/CashierScreen';
import { DebtsScreen } from './src/screens/DebtsScreen';
import { ExpensesScreen } from './src/screens/ExpensesScreen';
import { ProductsScreen } from './src/screens/ProductsScreen';
import { SalesHistoryScreen } from './src/screens/SalesHistoryScreen';
import { ServicesScreen } from './src/screens/ServicesScreen';
import { SellersScreen } from './src/screens/SellersScreen';
import { StatisticsScreen } from './src/screens/StatisticsScreen';
import { loadPersistedCart, savePersistedCart } from './src/services/cart-storage.service';
import { getProductById } from './src/services/products.service';

const tabs: Array<{
  key: TabKey;
  label: string;
  Icon: typeof ShoppingCart;
}> = [
  { key: 'cashier', label: 'Касса', Icon: ShoppingCart },
  { key: 'products', label: 'Товары', Icon: PackageSearch },
  { key: 'add', label: 'Добавить', Icon: PlusCircle },
  { key: 'debts', label: 'Долги', Icon: HandCoins },
  { key: 'services', label: 'Сервисы', Icon: Grid3X3 },
];

async function refreshCartProducts(cart: CartLine[]) {
  return Promise.all(
    cart.map(async (line) => {
      try {
        const product = await getProductById(line.product.id);
        return product ? { ...line, product } : line;
      } catch {
        return line;
      }
    })
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('cashier');
  const [pendingBarcode, setPendingBarcode] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const navBottomPadding = Math.max(insets.bottom, 8);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        assertSupabaseConfigured();
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'Не удалось настроить Supabase.';
        setError(message);
        return;
      }

      try {
        const savedCart = await loadPersistedCart();
        const refreshedCart = await refreshCartProducts(savedCart);

        if (mounted) {
          setCart(refreshedCart);
        }
      } catch (reason) {
        console.warn('Could not restore cart', reason);
      } finally {
        if (mounted) {
          setCartLoaded(true);
          setReady(true);
        }
      }
    };

    bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!cartLoaded) {
      return;
    }

    savePersistedCart(cart).catch((reason) => {
      console.warn('Could not persist cart', reason);
    });
  }, [cart, cartLoaded]);

  const notifyInventoryChanged = () => {
    setInventoryVersion((current) => current + 1);
  };

  const handleUnknownBarcode = (barcode: string) => {
    setPendingBarcode(barcode);
    setActiveTab('add');
  };

  const handleProductSaved = () => {
    setPendingBarcode('');
    notifyInventoryChanged();
  };

  const renderScreen = () => {
    if (activeTab === 'add') {
      return <AddProductScreen initialBarcode={pendingBarcode} onSaved={handleProductSaved} />;
    }

    if (activeTab === 'products') {
      return (
        <ProductsScreen
          onInventoryChanged={notifyInventoryChanged}
          refreshToken={inventoryVersion}
        />
      );
    }

    if (activeTab === 'history') {
      return <SalesHistoryScreen />;
    }

    if (activeTab === 'debts') {
      return <DebtsScreen />;
    }

    if (activeTab === 'services') {
      return <ServicesScreen onNavigate={setActiveTab} />;
    }

    if (activeTab === 'statistics') {
      return <StatisticsScreen />;
    }

    if (activeTab === 'expenses') {
      return <ExpensesScreen />;
    }

    if (activeTab === 'sellers') {
      return <SellersScreen />;
    }

    return (
      <CashierScreen
        cart={cart}
        onAddUnknownBarcode={handleUnknownBarcode}
        onInventoryChanged={notifyInventoryChanged}
        setCart={setCart}
      />
    );
  };

  if (error) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Ошибка запуска</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Подключаем облачную базу...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'right', 'left']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>{renderScreen()}</View>
      <View style={[styles.nav, { paddingBottom: navBottomPadding }]}>
        {tabs.map(({ key, label, Icon }) => {
          const active =
            activeTab === key ||
            ((activeTab === 'history' ||
              activeTab === 'statistics' ||
              activeTab === 'expenses' ||
              activeTab === 'sellers') &&
              key === 'services');
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={key}
              onPress={() => setActiveTab(key)}
              style={({ pressed }) => [
                styles.navItem,
                active ? styles.navItemActive : null,
                pressed ? styles.navItemPressed : null,
              ]}
            >
              <Icon color={active ? colors.primary : colors.muted} size={24} />
              <Text style={[styles.navLabel, active ? styles.navLabelActive : null]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
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
  errorTitle: {
    color: colors.danger,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  errorText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  nav: {
    minHeight: 70,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
  },
  navItem: {
    flex: 1,
    minHeight: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navItemActive: {
    backgroundColor: '#EAF7EF',
  },
  navItemPressed: {
    opacity: 0.72,
  },
  navLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  navLabelActive: {
    color: colors.primary,
  },
});
