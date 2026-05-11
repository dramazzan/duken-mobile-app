# Store Cashier

Expo/React Native app for managing store products and cashier sales.

## OCR product name recognition

The product form can run on-device OCR after a user takes or selects a product photo. Recognized text fragments are shown under **"Распознанный текст"**. The app never replaces the product name automatically: the user chooses a fragment with **"Использовать как название"** or enters the name manually.

OCR is optional. If text recognition fails or no useful text is found, the product can still be saved manually.

Implementation details:

- OCR uses `@react-native-ml-kit/text-recognition`, which wraps Google ML Kit Text Recognition for native React Native builds.
- After a photo is selected, the app calls `TextRecognition.recognize(imageUri)` and displays the recognized text lines for manual selection.
- Candidate filtering keeps Latin and Cyrillic text, so product names in English and Russian can be shown when ML Kit recognizes them.
- The package adds native Android/iOS code, so a new EAS APK build is required after installing it.
- This OCR module is not expected to work inside the standard Expo Go app because Expo Go does not include this custom native module. Use a new Android APK/internal build to test it on Android.
- Photo storage still uses the existing `imageUri` / `image_url` flow; OCR only reads the selected local image and suggests name candidates.

## Android test flow

1. Install a fresh EAS Android APK build after this change.
2. Open **Добавить товар** or edit an existing product.
3. Tap **Сделать фото** or **Выбрать фото**.
4. Wait for **Распознаем текст на фото...**.
5. Pick a recognized fragment with **Использовать как название**, or tap **Ввести вручную**.
6. Save the product normally.
