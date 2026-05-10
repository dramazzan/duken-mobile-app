import { Alert, StyleSheet, Text, View } from 'react-native';

import { ProductForm } from '../components/ProductForm';
import { colors } from '../lib/theme';
import { createProduct } from '../services/products.service';
import type { ProductInput } from '../lib/types';

type AddProductScreenProps = {
  initialBarcode: string;
  onSaved: () => void;
};

export function AddProductScreen({ initialBarcode, onSaved }: AddProductScreenProps) {
  const handleSubmit = async (input: ProductInput) => {
    await createProduct(input);
    Alert.alert('Товар сохранен', 'Теперь его можно пробивать на кассе.');
    onSaved();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Добавить товар</Text>
      </View>
      <ProductForm
        initialBarcode={initialBarcode}
        onSubmit={handleSubmit}
        resetOnSuccess
        submitLabel="Сохранить товар"
      />
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
    paddingBottom: 6,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
});
