# Supabase setup

## Install

```bash
npm install
npx expo start
```

Supabase dependencies used by the app:

```bash
npm install @supabase/supabase-js react-native-url-polyfill base64-arraybuffer
npx expo install expo-secure-store
```

## Environment

Create `.env` from `.env.example`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

Restart Expo after changing `.env`.

## Database and Storage

Run the SQL migration in Supabase SQL Editor or with the Supabase CLI:

```bash
supabase db push
```

Migration file:

```text
supabase/migrations/202605110001_create_products.sql
```

It creates:

- `public.products`
- `public.decrease_product_quantity(product_id uuid, amount integer)`
- public anon RLS policies for the no-auth MVP
- public `product-images` Storage bucket
- Storage object policies for image upload/read/update/delete
- Realtime publication for `public.products`

## Bucket

The migration creates the bucket automatically:

```text
product-images
```

If creating it manually in Supabase Dashboard:

- Go to Storage
- Create bucket `product-images`
- Mark it as Public
- Add allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`

## Realtime

The migration runs:

```sql
alter table public.products replica identity full;
alter publication supabase_realtime add table public.products;
```

If enabling manually:

- Go to Database > Replication
- Enable Realtime for `public.products`
