

export interface Category {
  id: string;
  name: string;
  subcategories: string[];
}

export interface SubCategory {
  id: string;
  name: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  subcategories: SubCategory[];
}

export interface Product {
  id: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  category: string;
  subcategory?: string;
  salesCount?: number;
}

export interface SaleItem {
  product: {
    id: string;
    name: string;
    category: string;
    subcategory?: string;
    costPrice: number;
  };
  quantity: number;
  price: number; // This is the selling price before discount
  costPriceAtSale: number; // Cost price at the time of sale
}

export interface Sale {
  id: string;
  displayId?: number;
  items: SaleItem[];
  subtotal: number;
  discount: number; // percentage
  finalTotal: number;
  date: Date;
}

export interface ReturnItem {
  product: {
      id: string;
      name: string;
      subcategory?: string;
  };
  quantity: number;
  priceAtSale: number; // Selling price at the time of sale, before discount
  costPriceAtSale: number;
}

export interface Return {
  id:string;
  saleId: string;
  items: ReturnItem[];
  reason: string;
  date: Date;
  totalRefund: number;
}

export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: string;
  date: Date;
  subcategory?: string;
}

export interface OtherIncome {
  id: string;
  name: string;
  amount: number;
  date: Date;
  notes?: string;
}

export interface FlashSaleProduct extends Product {
  discountPrice: number;
}

export interface FlashSale {
    id: string; // Will be 'main'
    title: string;
    isActive: boolean;
    products: FlashSaleProduct[];
}

export interface PublicSettings {
    defaultDiscount: number;
}

export interface Settings {
  id?: string; // id is 'main'
  storeName: string;
  defaultDiscount: number;
  syncCostPrice: boolean;
  theme: 'default' | 'colorful' | 'dark';
  categories?: Category[];
  expenseCategories?: ExpenseCategory[];
}

export interface StockOpnameLog {
    id: string;
    date: Date;
    productId: string;
    productName: string;
    previousStock: number;
    newStock: number;
    notes: string;
    user: UserRole;
}

export interface ActivityLog {
    id: string;
    date: Date;
    user: UserRole | 'sistem';
    description: string;
}

export type UserRole = 'admin' | 'kasir';

export interface ImportedFile {
    id: string; // Firestore document ID
    name: string;
    importedAt: Date;
}

export interface SkuMapping {
    id: string;
    importSku: string;
    mappedProductId: string;
    mappedProductName: string;
}
