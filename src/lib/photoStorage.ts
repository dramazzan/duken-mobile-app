import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

const PRODUCT_IMAGES_DIR = 'product-images/';

function getExtension(uri: string) {
  const cleanUri = uri.split('?')[0] ?? uri;
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  const extension = match?.[1]?.toLowerCase();

  if (extension && ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(extension)) {
    return extension;
  }

  return 'jpg';
}

export async function persistProductImage(sourceUri: string) {
  if (!FileSystem.documentDirectory) {
    throw new Error('Папка приложения недоступна для сохранения фото.');
  }

  const directory = `${FileSystem.documentDirectory}${PRODUCT_IMAGES_DIR}`;
  const directoryInfo = await FileSystem.getInfoAsync(directory);

  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }

  const extension = getExtension(sourceUri);
  const destination = `${directory}product-${Date.now()}.${extension}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destination });

  return destination;
}

export async function takeProductPhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();

  if (!permission.granted) {
    throw new Error('Разрешите доступ к камере, чтобы сделать фото товара.');
  }

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    mediaTypes: ['images'],
  });

  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  return persistProductImage(result.assets[0].uri);
}
