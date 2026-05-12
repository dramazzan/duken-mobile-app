import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Barcode, Edit3, PackageSearch, Search, Trash2, X } from 'lucide-react-native';

import { ActionButton } from '../components/ActionButton';
import { ProductForm } from '../components/ProductForm';
import { formatMoney } from '../lib/format';
import { colors, shadow } from '../lib/theme';
import {
  deleteProduct,
  getAllProducts,
  subscribeToProducts,
  updateProduct,
} from '../services/products.service';
import {
  getAllProductCategories,
  subscribeToProductCategories,
} from '../services/product-categories.service';
import type { Product, ProductInput } from '../lib/types';

type ProductsScreenProps = {
  refreshToken: number;
  onInventoryChanged: () => void;
};

export function ProductsScreen({ refreshToken, onInventoryChanged }: ProductsScreenProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText(null);
      const [rows, categoryRows] = await Promise.all([
        getAllProducts(searchTerm, selectedCategory),
        getAllProductCategories(),
      ]);
      const categoryNames = categoryRows.map((category) => category.name);

      setProducts(rows);
      setCategories(categoryNames);

      if (selectedCategory && !categoryNames.includes(selectedCategory)) {
        setSelectedCategory(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить товары.';
      setErrorText(message);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedCategory]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts, refreshToken]);

  useEffect(() => {
    const unsubscribeProducts = subscribeToProducts(() => {
      loadProducts();
    });
    const unsubscribeCategories = subscribeToProductCategories(() => {
      loadProducts();
    });

    return () => {
      unsubscribeProducts();
      unsubscribeCategories();
    };
  }, [loadProducts]);

  const handleUpdate = async (input: ProductInput) => {
    if (!selectedProduct) {
      return;
    }

    const updated = await updateProduct(selectedProduct.id, input);
    Alert.alert('Товар обновлен', updated.name);
    setSelectedProduct(null);
    onInventoryChanged();
    await loadProducts();
  };

  const handleDelete = (product: Product) => {
    Alert.alert('Удалить товар?', product.name, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProduct(product.id);
            setSelectedProduct((current) => (current?.id === product.id ? null : current));
            onInventoryChanged();
            await loadProducts();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Не удалось удалить товар.';
            Alert.alert('Ошибка удаления', message);
          }
        },
      },
    ]);
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => setSelectedProduct(item)}
      style={({ pressed }) => [styles.productCard, pressed ? styles.productPressed : null]}
    >
      <View style={styles.productImage}>
        {item.imageUri ? (
          <Image source={{ uri: item.imageUri }} style={styles.image} />
        ) : (
          <PackageSearch color={colors.muted} size={26} />
        )}
      </View>
      <View style={styles.productInfo}>
        <Text numberOfLines={2} style={styles.productName}>
          {item.name}
        </Text>
        <Text style={styles.productBarcode}>{item.barcode ?? 'Без штрих-кода'}</Text>
        <Text style={styles.productCategory}>{item.category ?? 'Без категории'}</Text>
        <View style={styles.productMeta}>
          <Text style={styles.price}>{formatMoney(item.price)}</Text>
          <Text style={[styles.stock, item.quantity <= 0 ? styles.stockWarning : null]}>
            Остаток: {item.quantity}
          </Text>
        </View>
      </View>
      <View style={styles.cardActions}>
        <Pressable accessibilityRole="button" onPress={() => setSelectedProduct(item)} style={styles.iconButton}>
          <Edit3 color={colors.text} size={20} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => handleDelete(item)} style={styles.deleteButton}>
          <Trash2 color={colors.danger} size={20} />
        </Pressable>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Товары</Text>
      </View>

      <View style={styles.searchWrap}>
        <Search color={colors.muted} size={20} />
        <TextInput
          autoCapitalize="none"
          onChangeText={setSearchTerm}
          placeholder="Название или штрих-код"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          value={searchTerm}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.categoryFilters}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryFiltersScroll}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: selectedCategory === null }}
          onPress={() => setSelectedCategory(null)}
          style={({ pressed }) => [
            styles.categoryChip,
            selectedCategory === null ? styles.categoryChipActive : null,
            pressed ? styles.categoryChipPressed : null,
          ]}
        >
          <Text style={[styles.categoryChipText, selectedCategory === null ? styles.categoryChipTextActive : null]}>
            Все
          </Text>
        </Pressable>
        {categories.map((category) => {
          const active = selectedCategory === category;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={category}
              onPress={() => setSelectedCategory(category)}
              style={({ pressed }) => [
                styles.categoryChip,
                active ? styles.categoryChipActive : null,
                pressed ? styles.categoryChipPressed : null,
              ]}
            >
              <Text numberOfLines={1} style={[styles.categoryChipText, active ? styles.categoryChipTextActive : null]}>
                {category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {errorText ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorText}</Text>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={products.length ? styles.listContent : styles.emptyListContent}
        data={products}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Barcode color={colors.muted} size={42} />
            <Text style={styles.emptyTitle}>
              {loading ? 'Загружаем...' : errorText ?? 'Товаров пока нет'}
            </Text>
          </View>
        }
        renderItem={renderProduct}
        showsVerticalScrollIndicator={false}
      />

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedProduct(null)}
        presentationStyle="fullScreen"
        visible={Boolean(selectedProduct)}
      >
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>Редактировать товар</Text>
              <Text numberOfLines={1} style={styles.modalSubtitle}>
                {selectedProduct?.barcode ?? 'Без штрих-кода'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectedProduct(null)}
              style={styles.closeButton}
            >
              <X color={colors.text} size={24} />
            </Pressable>
          </View>

          {selectedProduct ? (
            <>
              <ProductForm
                onCancel={() => setSelectedProduct(null)}
                onSubmit={handleUpdate}
                product={selectedProduct}
                submitLabel="Сохранить изменения"
              />
              <View style={styles.deleteFooter}>
                <ActionButton
                  icon={<Trash2 color={colors.danger} size={20} />}
                  label="Удалить товар"
                  onPress={() => handleDelete(selectedProduct)}
                  variant="danger"
                />
              </View>
            </>
          ) : null}
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
  categoryFiltersScroll: {
    maxHeight: 48,
    marginBottom: 0,
  },
  categoryFilters: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  categoryChip: {
    maxWidth: 180,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  categoryChipActive: {
    backgroundColor: '#EAF7EF',
    borderColor: colors.primary,
  },
  categoryChipPressed: {
    opacity: 0.72,
  },
  categoryChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  categoryChipTextActive: {
    color: colors.primary,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
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
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 120,
    gap: 12,
  },
  emptyListContent: {
    flexGrow: 1,
    padding: 16,
  },
  productCard: {
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadow,
  },
  productPressed: {
    opacity: 0.78,
  },
  productImage: {
    width: 64,
    height: 64,
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
  productInfo: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  productBarcode: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  productCategory: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: '#EAF7EF',
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  productMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  price: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  stock: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  stockWarning: {
    color: colors.danger,
  },
  cardActions: {
    gap: 8,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  deleteButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F0',
    borderColor: '#F4B5B0',
    borderWidth: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 24,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 12,
  },
  modalScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    minHeight: 104,
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  modalSubtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 3,
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteFooter: {
    paddingHorizontal: 16,
    paddingBottom: 22,
  },
});
