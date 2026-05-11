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

export type PaymentMethod = 'cash' | 'transfer' | 'debt' | 'home_payment';

export type SaleStatus = 'paid' | 'unpaid' | 'pending';

export type CustomerInfo = {
  name?: string;
  phone?: string;
  comment?: string;
};

export type SaleItem = {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  productBarcode: string | null;
  productImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  createdAt: string;
};

export type Sale = {
  id: string;
  saleNumber: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  customerName: string | null;
  customerPhone: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  items?: SaleItem[];
};

export type DebtorSummary = {
  key: string;
  name: string;
  phone: string | null;
  totalAmount: number;
  salesCount: number;
  latestAt: string;
  sales: Sale[];
};

export type SaleFilter = 'all' | PaymentMethod | SaleStatus;

export type TabKey = 'cashier' | 'products' | 'add' | 'history' | 'debts';
