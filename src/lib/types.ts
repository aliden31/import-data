

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

export type PaymentMethod = 'cash' | 'transfer' | 'ewallet' | 'credit';

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  dueDate?: Date;
}

export interface WarehouseStock {
  warehouseId: string;
  quantity: number;
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
  sku?: string;
  barcode?: string;
  reorderPoint?: number;
  warehouses?: WarehouseStock[];
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
  channel?: string;
  orderNo?: string;
  customerName?: string;
  grossTotal?: number;
  taxAmount?: number;
  shippingFee?: number;
  otherFee?: number;
  paymentMethod?: PaymentMethod;
  payments?: PaymentSplit[];
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
  paidStatus?: 'paid' | 'partial' | 'unpaid';
  note?: string;
  sourceFileName?: string;
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

export interface Warehouse {
  id: string;
  name: string;
  address?: string;
  contactPerson?: string;
}

export interface StockTransfer {
  id: string;
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  date: Date;
  note?: string;
  user: UserRole;
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
  lowStockThreshold?: number;
  primaryWarehouseId?: string;
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

export interface Account {
    id: string;
    code: string;
    name: string;
    type:
      | 'asset'
      | 'liability'
      | 'equity'
      | 'revenue'
      | 'expense'
      | 'other';
    parentCode?: string;
}

export type NormalBalance = 'debit' | 'credit';

export interface FinancialPeriod {
    startDate: Date;
    endDate: Date;
}

export interface TrialBalanceRow {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: Account['type'];
    normalBalance: NormalBalance;
    openingBalance: number;
    debit: number;
    credit: number;
    closingBalance: number;
}

export interface GeneralLedgerLine {
    date: Date;
    reference: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
}

export interface GeneralLedgerAccountLedger {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: Account['type'];
    normalBalance: NormalBalance;
    openingBalance: number;
    closingBalance: number;
    lines: GeneralLedgerLine[];
}

export interface FinancialStatementRow {
    accountId: string;
    accountCode: string;
    accountName: string;
    amount: number;
}

export interface FinancialStatementSection {
    title: string;
    rows: FinancialStatementRow[];
    total: number;
}

export interface IncomeStatement {
    period: FinancialPeriod;
    pendapatan: FinancialStatementSection;
    hpp: FinancialStatementSection;
    beban: FinancialStatementSection;
    labaKotor: number;
    labaBersih: number;
}

export interface BalanceSheet {
    period: FinancialPeriod;
    aset: FinancialStatementSection;
    kewajiban: FinancialStatementSection;
    ekuitas: FinancialStatementSection;
    totalAset: number;
    totalKewajibanDanEkuitas: number;
}

export interface CashflowStatement {
    period: FinancialPeriod;
    cashIn: number;
    cashOut: number;
    netCashFlow: number;
    openingBalance: number;
    closingBalance: number;
}

export interface JournalLine {
    accountId: string;
    accountName: string;
    debit: number;
    credit: number;
}

export interface JournalEntry {
    id: string;
    date: Date;
    reference: string;
    description: string;
    lines: JournalLine[];
    sourceModule: 'pos' | 'purchase' | 'sales-import' | 'inventory' | 'expense' | 'return' | 'other';
}

export interface CashflowSnapshot {
    id: string;
    period: string; // YYYY-MM
    cashIn: number;
    cashOut: number;
    method: 'direct' | 'indirect';
    generatedAt: Date;
}

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

export interface PreparedImportedSaleItem {
    sku: string;
    name: string;
    quantity: number;
    price: number;
    costPrice?: number;
}

export interface PreparedImportedSale {
    orderNo: string;
    transactionDate: string;
    channel: string;
    customerName: string;
    paymentMethod: PaymentMethod | undefined;
    paidStatus: 'paid' | 'partial' | 'unpaid';
    grossTotal: number;
    netTotal: number;
    discountAmount: number;
    taxAmount: number;
    shippingFee: number;
    otherFee: number;
    note?: string;
    items: PreparedImportedSaleItem[];
    payments: PaymentSplit[];
}
