import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Barcode, Camera, ImagePlus, Save, X } from 'lucide-react-native';

import { colors, shadow } from '../lib/theme';
import { parseInteger, parsePositiveNumber } from '../lib/format';
import { pickProductPhoto, takeProductPhoto } from '../lib/photoStorage';
import type { Product, ProductCategory, ProductFormValues, ProductInput } from '../lib/types';
import {
  getAllProductCategories,
  subscribeToProductCategories,
} from '../services/product-categories.service';
import { recognizeProductText } from '../services/text-recognition.service';
import { ActionButton } from './ActionButton';
import { BarcodeScannerModal } from './BarcodeScannerModal';

const OCR_FALLBACK_MESSAGE =
  'Не удалось распознать название. Попробуйте сфотографировать товар ближе или введите название вручную.';

const emptyValues = (barcode = ''): ProductFormValues => ({
  name: '',
  barcode,
  category: '',
  price: '',
  quantity: '',
  imageUri: null,
});

function valuesFromProduct(product: Product): ProductFormValues {
  return {
    name: product.name,
    barcode: product.barcode ?? '',
    category: product.category ?? '',
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

type OcrState = {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'manual';
  candidates: string[];
  message: string | null;
};

const initialOcrState: OcrState = {
  status: 'idle',
  candidates: [],
  message: null,
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
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [ocrState, setOcrState] = useState<OcrState>(initialOcrState);

  const isEditing = Boolean(product);

  useEffect(() => {
    if (product) {
      setValues(valuesFromProduct(product));
      setOcrState(initialOcrState);
      return;
    }

    setValues((current) => ({ ...current, barcode: initialBarcode }));
  }, [initialBarcode, product]);

  const loadCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      setCategoryError(null);
      const rows = await getAllProductCategories();
      setCategories(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить категории.';
      setCategoryError(message);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();

    return subscribeToProductCategories(() => {
      loadCategories();
    });
  }, [loadCategories]);

  const imageSource = useMemo(
    () => (values.imageUri ? { uri: values.imageUri } : null),
    [values.imageUri]
  );

  const categoryOptions = useMemo(() => {
    const selectedCategory = values.category.trim();

    if (!selectedCategory || categories.some((category) => category.name === selectedCategory)) {
      return categories;
    }

    return [
      {
        id: `current-${selectedCategory}`,
        name: selectedCategory,
        createdAt: product?.createdAt ?? '',
        updatedAt: product?.updatedAt ?? '',
      },
      ...categories,
    ];
  }, [categories, product?.createdAt, product?.updatedAt, values.category]);

  const setField = (field: keyof ProductFormValues, value: string | null) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const buildPayload = () => {
    const name = values.name.trim();
    const barcode = values.barcode.trim();
    const category = values.category.trim();
    const price = parsePositiveNumber(values.price);
    const quantity = parseInteger(values.quantity);

    if (!name) {
      Alert.alert('Заполните название', 'Название товара обязательно.');
      return null;
    }

    if (!category) {
      Alert.alert('Выберите категорию', 'Категории добавляются в настройках.');
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
      category,
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
        setOcrState(initialOcrState);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сохранить товар.';
      Alert.alert('Ошибка сохранения', message.includes('UNIQUE') ? 'Такой штрих-код уже есть.' : message);
    } finally {
      setSaving(false);
    }
  };

  const runTextRecognition = async (imageUri: string) => {
    setOcrState({ status: 'loading', candidates: [], message: null });

    try {
      const result = await recognizeProductText(imageUri);

      if (result.candidates.length) {
        setOcrState({
          status: 'ready',
          candidates: result.candidates,
          message: null,
        });
        return;
      }

      setOcrState({
        status: 'empty',
        candidates: [],
        message: OCR_FALLBACK_MESSAGE,
      });
    } catch (error) {
      console.warn('Failed to recognize product text', error);
      setOcrState({
        status: 'empty',
        candidates: [],
        message: OCR_FALLBACK_MESSAGE,
      });
    }
  };

  const handleImageSelected = async (imageUri: string | null) => {
    if (!imageUri) {
      return;
    }

    setField('imageUri', imageUri);
    await runTextRecognition(imageUri);
  };

  const handlePhoto = async () => {
    try {
      setPhotoLoading(true);
      const imageUri = await takeProductPhoto();
      await handleImageSelected(imageUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сделать фото.';
      Alert.alert('Фото товара', message);
    } finally {
      setPhotoLoading(false);
    }
  };

  const handlePickImage = async () => {
    try {
      setPhotoLoading(true);
      const imageUri = await pickProductPhoto();
      await handleImageSelected(imageUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось выбрать фото.';
      Alert.alert('Фото товара', message);
    } finally {
      setPhotoLoading(false);
    }
  };

  const clearPhoto = () => {
    setField('imageUri', null);
    setOcrState(initialOcrState);
  };

  const handleUseCandidate = (candidate: string) => {
    setField('name', candidate);
  };

  const handleManualName = () => {
    setOcrState((current) => ({
      ...current,
      status: 'manual',
      message: null,
    }));
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
              <ActionButton
                icon={<ImagePlus color={colors.text} size={20} />}
                label="Выбрать фото"
                loading={photoLoading}
                onPress={handlePickImage}
                variant="secondary"
              />
              {values.imageUri ? (
                <ActionButton
                  icon={<X color={colors.danger} size={20} />}
                  label="Убрать фото"
                  onPress={clearPhoto}
                  variant="ghost"
                />
              ) : null}
            </View>
          </View>

          <View style={styles.ocrBlock}>
            <View style={styles.ocrHeader}>
              <Text style={styles.label}>Распознанный текст</Text>
              {ocrState.status === 'loading' ? <ActivityIndicator color={colors.primary} /> : null}
            </View>

            {ocrState.status === 'idle' ? (
              <Text style={styles.ocrMuted}>Сделайте или выберите фото, чтобы найти название на упаковке.</Text>
            ) : null}

            {ocrState.status === 'loading' ? (
              <Text style={styles.ocrMuted}>Распознаем текст на фото...</Text>
            ) : null}

            {ocrState.message ? <Text style={styles.ocrMessage}>{ocrState.message}</Text> : null}

            {ocrState.candidates.length ? (
              <View style={styles.ocrOptions}>
                {ocrState.candidates.map((candidate) => (
                  <View key={candidate} style={styles.ocrOption}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleUseCandidate(candidate)}
                      style={({ pressed }) => [styles.ocrCandidate, pressed ? styles.ocrCandidatePressed : null]}
                    >
                      <Text style={styles.ocrCandidateText}>{candidate}</Text>
                    </Pressable>
                    <ActionButton
                      label="Использовать как название"
                      onPress={() => handleUseCandidate(candidate)}
                      style={styles.useNameButton}
                      variant="secondary"
                    />
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.ocrActions}>
              <ActionButton
                label={ocrState.status === 'empty' ? 'Сделать фото снова' : 'Сканировать фото заново'}
                loading={photoLoading}
                onPress={handlePhoto}
                style={styles.ocrActionButton}
                variant="secondary"
              />
              <ActionButton
                label="Ввести вручную"
                onPress={handleManualName}
                style={styles.ocrActionButton}
                variant="ghost"
              />
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

          <View style={styles.field}>
            <View style={styles.categoryHeader}>
              <Text style={styles.label}>Категория</Text>
              {categoriesLoading ? <ActivityIndicator color={colors.primary} size="small" /> : null}
            </View>
            {categoryError ? <Text style={styles.categoryError}>{categoryError}</Text> : null}
            {categoryOptions.length ? (
              <View style={styles.categoryGrid}>
                {categoryOptions.map((category) => {
                  const active = values.category === category.name;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      key={category.id}
                      onPress={() => setField('category', category.name)}
                      style={({ pressed }) => [
                        styles.categoryOption,
                        active ? styles.categoryOptionActive : null,
                        pressed ? styles.categoryOptionPressed : null,
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.categoryOptionText, active ? styles.categoryOptionTextActive : null]}
                      >
                        {category.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.categoryHint}>Добавьте категории в настройках, затем выберите одну здесь.</Text>
            )}
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
    paddingTop: 8,
    gap: 14,
  },
  photoRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 12,
    ...shadow,
  },
  photoBox: {
    width: '100%',
    height: 190,
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
    gap: 8,
  },
  photoTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  ocrBlock: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
    ...shadow,
  },
  ocrHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  ocrMuted: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  ocrMessage: {
    color: colors.warning,
    fontSize: 14,
    lineHeight: 20,
  },
  ocrOptions: {
    gap: 10,
  },
  ocrOption: {
    gap: 8,
  },
  ocrCandidate: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CDE8D7',
    backgroundColor: '#F4FBF7',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ocrCandidatePressed: {
    opacity: 0.72,
  },
  ocrCandidateText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  useNameButton: {
    alignSelf: 'stretch',
    minHeight: 44,
  },
  ocrActions: {
    gap: 8,
  },
  ocrActionButton: {
    minHeight: 46,
  },
  field: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8,
    ...shadow,
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
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 17,
    paddingHorizontal: 14,
  },
  categoryHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    maxWidth: '100%',
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryOptionActive: {
    borderColor: colors.primary,
    backgroundColor: '#EAF7EF',
  },
  categoryOptionPressed: {
    opacity: 0.72,
  },
  categoryOptionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  categoryOptionTextActive: {
    color: colors.primary,
  },
  categoryHint: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  categoryError: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
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
    gap: 10,
  },
  halfField: {
    flex: 1,
  },
  submit: {
    marginTop: 4,
  },
});
