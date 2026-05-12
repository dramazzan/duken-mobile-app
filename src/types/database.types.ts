export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      products: {
        Row: {
          id: string;
          name: string;
          barcode: string | null;
          price: number;
          quantity: number;
          image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          barcode?: string | null;
          price: number;
          quantity: number;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          barcode?: string | null;
          price?: number;
          quantity?: number;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          sale_number: string;
          total_amount: number;
          paid_amount: number;
          payment_method: 'cash' | 'transfer' | 'debt' | 'home_payment';
          status: 'paid' | 'unpaid' | 'pending';
          customer_name: string | null;
          customer_phone: string | null;
          comment: string | null;
          seller_id: string;
          seller_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sale_number?: string;
          total_amount: number;
          paid_amount?: number;
          payment_method: 'cash' | 'transfer' | 'debt' | 'home_payment';
          status: 'paid' | 'unpaid' | 'pending';
          customer_name?: string | null;
          customer_phone?: string | null;
          comment?: string | null;
          seller_id: string;
          seller_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sale_number?: string;
          total_amount?: number;
          paid_amount?: number;
          payment_method?: 'cash' | 'transfer' | 'debt' | 'home_payment';
          status?: 'paid' | 'unpaid' | 'pending';
          customer_name?: string | null;
          customer_phone?: string | null;
          comment?: string | null;
          seller_id?: string;
          seller_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sales_seller_id_fkey';
            columns: ['seller_id'];
            isOneToOne: false;
            referencedRelation: 'sellers';
            referencedColumns: ['id'];
          },
        ];
      };
      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string;
          product_name: string;
          product_barcode: string | null;
          product_image_url: string | null;
          unit_price: number;
          quantity: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id: string;
          product_name: string;
          product_barcode?: string | null;
          product_image_url?: string | null;
          unit_price: number;
          quantity: number;
          line_total: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          sale_id?: string;
          product_id?: string;
          product_name?: string;
          product_barcode?: string | null;
          product_image_url?: string | null;
          unit_price?: number;
          quantity?: number;
          line_total?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sale_items_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_items_sale_id_fkey';
            columns: ['sale_id'];
            isOneToOne: false;
            referencedRelation: 'sales';
            referencedColumns: ['id'];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          title: string;
          amount: number;
          category: 'purchase' | 'rent' | 'salary' | 'delivery' | 'utility' | 'other';
          comment: string | null;
          expense_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          amount: number;
          category: 'purchase' | 'rent' | 'salary' | 'delivery' | 'utility' | 'other';
          comment?: string | null;
          expense_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          amount?: number;
          category?: 'purchase' | 'rent' | 'salary' | 'delivery' | 'utility' | 'other';
          comment?: string | null;
          expense_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sellers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          is_active: boolean;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          is_active?: boolean;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string | null;
          is_active?: boolean;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_sale: {
        Args: {
          cart_items: Json;
          payment_method: 'cash' | 'transfer' | 'debt' | 'home_payment';
          customer_name?: string | null;
          customer_phone?: string | null;
          sale_comment?: string | null;
          seller_id?: string | null;
        };
        Returns: Database['public']['Tables']['sales']['Row'];
      };
      create_manual_debt: {
        Args: {
          customer_name: string;
          customer_phone?: string | null;
          total_amount: number;
          sale_comment?: string | null;
          seller_id?: string | null;
        };
        Returns: Database['public']['Tables']['sales']['Row'];
      };
      get_default_seller_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      confirm_sale_payment: {
        Args: {
          sale_id: string;
        };
        Returns: Database['public']['Tables']['sales']['Row'];
      };
      confirm_sale_payments: {
        Args: {
          sale_ids: string[];
        };
        Returns: Database['public']['Tables']['sales']['Row'][];
      };
      decrease_product_quantity: {
        Args: {
          product_id: string;
          amount: number;
        };
        Returns: Database['public']['Tables']['products']['Row'];
      };
      decrease_product_quantities: {
        Args: {
          items: Json;
        };
        Returns: Database['public']['Tables']['products']['Row'][];
      };
      record_debt_payment: {
        Args: {
          sale_id: string;
          payment_amount: number;
        };
        Returns: Database['public']['Tables']['sales']['Row'];
      };
      set_default_seller: {
        Args: {
          seller_id: string;
        };
        Returns: Database['public']['Tables']['sellers']['Row'];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type ProductRow = Database['public']['Tables']['products']['Row'];
export type ProductInsert = Database['public']['Tables']['products']['Insert'];
export type ProductUpdate = Database['public']['Tables']['products']['Update'];
export type SaleRow = Database['public']['Tables']['sales']['Row'];
export type SaleInsert = Database['public']['Tables']['sales']['Insert'];
export type SaleUpdate = Database['public']['Tables']['sales']['Update'];
export type SaleItemRow = Database['public']['Tables']['sale_items']['Row'];
export type SaleItemInsert = Database['public']['Tables']['sale_items']['Insert'];
export type SaleItemUpdate = Database['public']['Tables']['sale_items']['Update'];
export type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
export type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];
export type ExpenseUpdate = Database['public']['Tables']['expenses']['Update'];
export type SellerRow = Database['public']['Tables']['sellers']['Row'];
export type SellerInsert = Database['public']['Tables']['sellers']['Insert'];
export type SellerUpdate = Database['public']['Tables']['sellers']['Update'];
