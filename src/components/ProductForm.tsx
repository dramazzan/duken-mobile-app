import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Barcode, Camera, ImagePlus, Save, X } from 'lucide-react-native';

import { colors } from '../lib/theme';
import { parseInteger, parsePositiveNumber } from '../lib/format';
import { takeProductPhoto } from '../lib/photoStorage';
import type { Product, ProductFormValues, ProductInput } from '../lib/types';
import { ActionButton } from './ActionButton';
import { BarcodeScannerModal } from './BarcodeScannerModal';

const emptyValues = (barcode = ''): ProductFormValues => ({
  name: '',
  barcode,
  price: '',
  quantity: '',
  imageUri: null,
});

function valuesFromProduct(product: Product): ProductFormValues {
  return {
    name: product.name,
    barcode: product.barcode ?? '',
    price: String(product.price),
    quantity: String(product.quantity),
    imageUri: product.imageUri,
  };
}

type ProductFormProps = {
  product?: Product | null;
  initialBarcode?: string;
  submitLabel: string;
  resetOnSuccess?: boolean;
  onSubmit: (input: ProductInput) => Promise<void>;
  onCancel?: () => void;
};

export function ProductForm({
  product,
  initialBarcode = '',
  submitLabel,
  resetOnSuccess = false,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(
    product ? valuesFromProduct(product) : emptyValues(initialBarcode)
  );
  const [scannerVisible, setScannerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);

  const isEditing = Boolean(product);

  useEffect(() => {
    if (product) {
      setValues(valuesFromProduct(product));
      return;
    }

    setValues((current) => ({ ...current, barcode: initialBarcode }));
  }, [initialBarcode, product]);

  const imageSource = useMemo(
    () => (values.imageUri ? { uri: values.imageUri } : null),
    [values.imageUri]
  );

  const setField = (field: keyof ProductFormValues, value: string | null) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const buildPayload = () => {
    const name = values.name.trim();
    const barcode = values.barcode.trim();
    const price = parsePositiveNumber(values.price);
    const quantity = parseInteger(values.quantity);

    if (!name) {
      Alert.alert('Заполните название', 'Название товара обязательно.');
      return null;
    }

    if (price === null || price <= 0) {
      Alert.alert('Проверьте цену', 'Цена должна быть числом больше нуля.');
      return null;
    }

    if (quantity === null) {
      Alert.alert('Проверьте количество', 'Количество должно быть целым числом от нуля.');
      return null;
    }

    return {
      name,
      barcode: barcode || null,
      price,
      quantity,
      imageUri: values.imageUri,
    };
  };

  const handleSubmit = async () => {
    const payload = buildPayload();

    if (!payload) {
      return;
    }

    try {
      setSaving(true);
      await onSubmit(payload);

      if (resetOnSuccess) {
        setValues(emptyValues());
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сохранить товар.';
      Alert.alert('Ошибка сохранения', message.includes('UNIQUE') ? 'Такой штрих-код уже есть.' : message);
    } finally {
      setSaving(false);
    }
  };

  const handlePhoto = async () => {
    try {
      setPhotoLoading(true);
      const imageUri = await takeProductPhoto();

      if (imageUri) {
        setField('imageUri', imageUri);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сделать фото.';
      Alert.alert('Фото товара', message);
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleScanned = (barcode: string) => {
    setField('barcode', barcode);
    setScannerVisible(false);
  };

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.photoRow}>
            <View style={styles.photoBox}>
              {imageSource ? (
                <Image source={imageSource} style={styles.photo} />
              ) : (
                <ImagePlus color={colors.muted} size={42} />
              )}
            </View>
            <View style={styles.photoActions}>
              <Text style={styles.photoTitle}>Фото товара</Text>
              <ActionButton
                icon={<Camera color={colors.text} size={20} />}
                label={values.imageUri ? 'Сделать новое фото' : 'Сделать фото'}
                loading={photoLoading}
                onPress={handlePhoto}
                variant="secondary"
              />
              {values.imageUri ? (
                <ActionButton
                  icon={<X color={colors.danger} size={20} />}
                  label="Убрать фото"
                  onPress={() => setField('imageUri', null)}
                  variant="ghost"
                />
              ) : null}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Название товара</Text>
            <TextInput
              autoCapitalize="sentences"
              onChangeText={(text) => setField('name', text)}
              placeholder="Например: Молоко 1 л"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
              style={styles.input}
              value={values.name}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Штрих-код</Text>
            <View style={styles.barcodeRow}>
              <TextInput
                autoCapitalize="none"
                keyboardType="number-pad"
                onChangeText={(text) => setField('barcode', text)}
                placeholder="Можно оставить пустым"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.barcodeInput]}
                value={values.barcode}
              />
              <ActionButton
                icon={<Barcode color="#FFFFFF" size={22} />}
                label="Скан"
                onPress={() => setScannerVisible(true)}
                style={styles.scanButton}
              />
            </View>
          </View>

          <View style={styles.twoColumns}>
            <View style={[styles.field, styles.halfField]}>
              <Text style={styles.label}>Цена</Text>
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={(text) => setField('price', text)}
                placeholder="0"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={values.price}
              />
            </View>
            <View style={[styles.field, styles.halfField]}>
              <Text style={styles.label}>Количество</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={(text) => setField('quantity', text)}
                placeholder="0"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={values.quantity}
              />
            </View>
          </View>

          <ActionButton
            icon={<Save color="#FFFFFF" size={22} />}
            label={submitLabel}
            loading={saving}
            onPress={handleSubmit}
            style={styles.submit}
          />

          {isEditing && onCancel ? (
            <ActionButton label="Отмена" onPress={onCancel} variant="secondary" />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <BarcodeScannerModal
        onClose={() => setScannerVisible(false)}
        onScanned={handleScanned}
        title="Сканировать штрих-код"
        visible={scannerVisible}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
    gap: 16,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  photoBox: {
    width: 112,
    height: 112,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoActions: {
    flex: 1,
    gap: 8,
  },
  photoTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  field: {
    gap: 8,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    color: colors.text,
    fontSize: 17,
    paddingHorizontal: 14,
  },
  barcodeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  barcodeInput: {
    flex: 1,
  },
  scanButton: {
    minWidth: 92,
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  submit: {
    marginTop: 8,
  },
});
