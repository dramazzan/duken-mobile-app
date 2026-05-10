import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type BarcodeType,
} from 'expo-camera';
import { X, Zap } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../lib/theme';

const SUPPORTED_BARCODE_TYPES: BarcodeType[] = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'itf14',
  'qr',
];

type BarcodeScannerModalProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onScanned: (barcode: string) => void;
};

export function BarcodeScannerModal({
  visible,
  title,
  onClose,
  onScanned,
}: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const insets = useSafeAreaInsets();
  const scanLockedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      scanLockedRef.current = false;
      setLocked(false);
      setTorchEnabled(false);

      if (!permission?.granted) {
        requestPermission();
      }
    } else {
      scanLockedRef.current = true;
      setTorchEnabled(false);
    }
  }, [permission?.granted, requestPermission, visible]);

  const handleScanned = (result: BarcodeScanningResult) => {
    const barcode = result.data?.trim();

    if (scanLockedRef.current || !barcode) {
      return;
    }

    scanLockedRef.current = true;
    setLocked(true);
    onScanned(barcode);
  };

  const handleClose = () => {
    scanLockedRef.current = true;
    setLocked(true);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 12, 36) }]}>
          <View>
            <Text style={styles.title}>{title}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={handleClose} style={styles.closeButton}>
            <X color={colors.text} size={26} />
          </Pressable>
        </View>

        {!permission ? (
          <View style={styles.center}>
            <Text style={styles.message}>Проверяем доступ к камере...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.message}>Для сканирования нужен доступ к камере.</Text>
            <Pressable accessibilityRole="button" onPress={requestPermission} style={styles.permissionButton}>
              <Text style={styles.permissionLabel}>Разрешить камеру</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: SUPPORTED_BARCODE_TYPES }}
              enableTorch={torchEnabled}
              facing="back"
              onBarcodeScanned={locked ? undefined : handleScanned}
              style={StyleSheet.absoluteFillObject}
            />
            <View pointerEvents="none" style={styles.overlay}>
              <View style={styles.scanFrame} />
            </View>
            <View style={[styles.cameraActions, { bottom: Math.max(insets.bottom + 20, 24) }]}>
              <Pressable
                accessibilityLabel={torchEnabled ? 'Выключить фонарик' : 'Включить фонарик'}
                accessibilityRole="button"
                onPress={() => setTorchEnabled((current) => !current)}
                style={({ pressed }) => [
                  styles.torchButton,
                  torchEnabled ? styles.torchButtonActive : null,
                  pressed ? styles.torchButtonPressed : null,
                ]}
              >
                <Zap color={torchEnabled ? colors.text : '#FFFFFF'} size={22} />
                <Text style={[styles.torchLabel, torchEnabled ? styles.torchLabelActive : null]}>
                  {torchEnabled ? 'Фонарик включен' : 'Фонарик'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    minHeight: 104,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  permissionLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cameraWrap: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  scanFrame: {
    width: '86%',
    maxWidth: 340,
    height: 180,
    borderRadius: 8,
    borderColor: '#FFFFFF',
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
  cameraActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  torchButton: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 20, 24, 0.78)',
    borderColor: 'rgba(255, 255, 255, 0.34)',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  torchButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  torchButtonPressed: {
    opacity: 0.76,
  },
  torchLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  torchLabelActive: {
    color: colors.text,
  },
});
