import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '../lib/supabase';

export const PRODUCT_IMAGES_BUCKET = 'product-images';

function sanitizePathPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
}

function getExtension(uri: string) {
  const cleanUri = uri.split('?')[0] ?? uri;
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  const extension = match?.[1]?.toLowerCase();

  if (extension && ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(extension)) {
    return extension;
  }

  return 'jpg';
}

function getContentType(extension: string) {
  if (extension === 'png') {
    return 'image/png';
  }

  if (extension === 'webp') {
    return 'image/webp';
  }

  if (extension === 'heic') {
    return 'image/heic';
  }

  return 'image/jpeg';
}

export function isRemoteImageUrl(uri: string | null | undefined) {
  return Boolean(uri?.startsWith('http://') || uri?.startsWith('https://'));
}

export async function uploadProductImage(localUri: string, productIdOrBarcode: string) {
  if (isRemoteImageUrl(localUri)) {
    return localUri;
  }

  const extension = getExtension(localUri);
  const filePath = `${sanitizePathPart(productIdOrBarcode)}/${Date.now()}.${extension}`;
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(filePath, decode(base64), {
      cacheControl: '31536000',
      contentType: getContentType(extension),
      upsert: true,
    });

  if (error) {
    throw new Error(`Не удалось загрузить фото товара: ${error.message}`);
  }

  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}
