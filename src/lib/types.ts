export type Product = {
  id: string;
  name: string;
  barcode: string | null;
  price: number;
  quantity: number;
  imageUri: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductFormValues = {
  name: string;
  barcode: string;
  price: string;
  quantity: string;
  imageUri: string | null;
};

export type ProductInput = {
  name: string;
  barcode: string | null;
  price: number;
  quantity: number;
  imageUri: string | null;
};

export type CartLine = {
  product: Product;
  quantity: number;
};

export type TabKey = 'cashier' | 'add' | 'products';
