

import { db } from './firebase';
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  Timestamp,
  getDoc,
  setDoc,
  runTransaction,
  DocumentReference,
  DocumentData,
  orderBy,
  onSnapshot,
  where,
} from 'firebase/firestore';
import type {
  Product,
  Sale,
  Return,
  Expense,
  FlashSale,
  Settings,
  SaleItem,
  ReturnItem,
  Category,
  SubCategory,
  StockOpnameLog,
  UserRole,
  ActivityLog,
  PublicSettings,
  OtherIncome,
  ImportedFile,
  SkuMapping,
  Warehouse,
  StockTransfer,
  PaymentSplit,
  JournalEntry,
  JournalLine,
  Account,
  CashflowSnapshot,
  PaymentMethod,
} from './types';
import { placeholderProducts } from './placeholder-data';

// Generic Firestore interaction functions
const PAGE_SIZE = 200; // Define the number of transactions per page

function cleanUndefined<T extends Record<string, unknown>>(value: T): T {
  const result: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, val]) => {
    if (val !== undefined) {
      result[key] = val;
    }
  });
  return result as T;
}

function convertTimestampsToDates<T>(value: T): T {
  if (value instanceof Timestamp) {
    return value.toDate() as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => convertTimestampsToDates(item)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      result[key] = convertTimestampsToDates(val);
    });
    return result as T;
  }

  return value;
}

const ACCOUNT_REFERENCES: Record<string, Account> = {
  cash: { id: '1101', code: '1101', name: 'Kas', type: 'asset' },
  bank: { id: '1102', code: '1102', name: 'Bank', type: 'asset' },
  ewallet: { id: '1103', code: '1103', name: 'Kas E-Wallet', type: 'asset' },
  ar: { id: '1130', code: '1130', name: 'Piutang Usaha', type: 'asset' },
  inventory: { id: '1400', code: '1400', name: 'Persediaan Barang Dagang', type: 'asset' },
  cogs: { id: '5100', code: '5100', name: 'Harga Pokok Penjualan', type: 'expense' },
  salesRevenue: { id: '4100', code: '4100', name: 'Pendapatan Penjualan', type: 'revenue' },
  salesReturn: { id: '5200', code: '5200', name: 'Retur Penjualan', type: 'expense' },
  expense: { id: '6100', code: '6100', name: 'Beban Operasional', type: 'expense' },
  otherIncome: { id: '4200', code: '4200', name: 'Pendapatan Lain-Lain', type: 'revenue' },
};

const ACCOUNT_METADATA: Record<string, Account> = Object.values(ACCOUNT_REFERENCES).reduce((acc, account) => {
  acc[account.id] = account;
  return acc;
}, {} as Record<string, Account>);

const PAYMENT_ACCOUNT_MAP: Record<PaymentMethod, Account> = {
  cash: ACCOUNT_REFERENCES.cash,
  transfer: ACCOUNT_REFERENCES.bank,
  ewallet: ACCOUNT_REFERENCES.ewallet,
  credit: ACCOUNT_REFERENCES.ar,
};

const accountCache = new Map<string, Account>();

async function ensureAccountReference(account: Account) {
  if (accountCache.has(account.id)) {
    return accountCache.get(account.id)!;
  }
  try {
    const accountRef = doc(db, 'accounts', account.id);
    const snapshot = await getDoc(accountRef);
    if (!snapshot.exists()) {
      await setDoc(accountRef, account);
    }
    accountCache.set(account.id, account);
  } catch (error) {
    console.warn('Failed to ensure account reference', error);
  }
  return account;
}

const getPeriodKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

async function updateCashflowSnapshot(date: Date, cashInDelta: number, cashOutDelta: number) {
  const period = getPeriodKey(date);
  const snapshotRef = doc(db, 'cashflowSnapshots', `direct-${period}`);
  await runTransaction(db, async (transaction) => {
    const snapshotDoc = await transaction.get(snapshotRef);
    const existing = snapshotDoc.exists()
      ? convertTimestampsToDates(snapshotDoc.data() as CashflowSnapshot)
      : { cashIn: 0, cashOut: 0, method: 'direct', generatedAt: date, period };

    const method: CashflowSnapshot['method'] = existing.method === 'indirect' ? 'indirect' : 'direct';

    const updated = {
      cashIn: (existing.cashIn || 0) + cashInDelta,
      cashOut: (existing.cashOut || 0) + cashOutDelta,
      method,
      generatedAt: date,
      period,
    } satisfies Omit<CashflowSnapshot, 'id'>;

    transaction.set(snapshotRef, convertDatesToTimestamps(updated));
  });
}

async function addJournalEntryInternal(entry: Omit<JournalEntry, 'id'>): Promise<JournalEntry> {
  const preparedLines = entry.lines.filter((line) => line.debit !== 0 || line.credit !== 0);
  for (const line of preparedLines) {
    const metadata = ACCOUNT_METADATA[line.accountId];
    await ensureAccountReference({
      id: line.accountId,
      code: line.accountId,
      name: line.accountName,
      type: metadata?.type || 'other',
    });
  }
  return addDocument<JournalEntry>('journalEntries', { ...entry, lines: preparedLines });
}

async function recordSaleJournalEntry(sale: Sale, user: UserRole | 'sistem', source: JournalEntry['sourceModule']) {
  const payments = (sale.payments && sale.payments.length > 0)
    ? sale.payments
    : sale.paymentMethod
      ? [{ method: sale.paymentMethod, amount: sale.finalTotal }]
      : [{ method: 'cash', amount: sale.finalTotal }];

  const journalLines: JournalLine[] = [];
  let totalPaymentAmount = 0;

  for (const payment of payments) {
    if (payment.amount <= 0) continue;
    const method = (payment.method in PAYMENT_ACCOUNT_MAP
      ? payment.method
      : 'cash') as PaymentMethod;
    const account = PAYMENT_ACCOUNT_MAP[method];
    journalLines.push({
      accountId: account.id,
      accountName: account.name,
      debit: payment.amount,
      credit: 0,
    });
    if (method !== 'credit') {
      totalPaymentAmount += payment.amount;
    }
  }

  const paidTotal = payments.reduce((sum, split) => sum + split.amount, 0);
  if (paidTotal < sale.finalTotal) {
    const outstanding = sale.finalTotal - paidTotal;
    if (outstanding > 0) {
      const account = ACCOUNT_REFERENCES.ar;
      journalLines.push({ accountId: account.id, accountName: account.name, debit: outstanding, credit: 0 });
    }
  }

  const revenueAccount = ACCOUNT_REFERENCES.salesRevenue;
  journalLines.push({
    accountId: revenueAccount.id,
    accountName: revenueAccount.name,
    debit: 0,
    credit: sale.finalTotal,
  });

  const costOfGoods = sale.items.reduce((sum, item) => {
    const cost = item.costPriceAtSale ?? item.product.costPrice ?? 0;
    return sum + cost * item.quantity;
  }, 0);

  if (costOfGoods > 0) {
    const cogsAccount = ACCOUNT_REFERENCES.cogs;
    const inventoryAccount = ACCOUNT_REFERENCES.inventory;
    journalLines.push({ accountId: cogsAccount.id, accountName: cogsAccount.name, debit: costOfGoods, credit: 0 });
    journalLines.push({ accountId: inventoryAccount.id, accountName: inventoryAccount.name, debit: 0, credit: costOfGoods });
  }

  await addJournalEntryInternal({
    date: sale.date,
    reference: sale.orderNo || sale.id,
    description: `Penjualan otomatis (${source === 'pos' ? 'POS' : 'Impor'}) oleh ${user}`,
    lines: journalLines,
    sourceModule: source,
  });

  await updateCashflowSnapshot(sale.date, totalPaymentAmount, 0);
}

async function recordReturnJournalEntry(returnData: Return, user: UserRole | 'sistem') {
  const journalLines: JournalLine[] = [];
  const refundAmount = returnData.totalRefund || 0;
  if (refundAmount > 0) {
    journalLines.push({
      accountId: ACCOUNT_REFERENCES.salesReturn.id,
      accountName: ACCOUNT_REFERENCES.salesReturn.name,
      debit: refundAmount,
      credit: 0,
    });
    journalLines.push({
      accountId: ACCOUNT_REFERENCES.cash.id,
      accountName: ACCOUNT_REFERENCES.cash.name,
      debit: 0,
      credit: refundAmount,
    });
  }

  const costReturned = returnData.items.reduce((sum, item) => sum + (item.costPriceAtSale || 0) * item.quantity, 0);
  if (costReturned > 0) {
    journalLines.push({
      accountId: ACCOUNT_REFERENCES.inventory.id,
      accountName: ACCOUNT_REFERENCES.inventory.name,
      debit: costReturned,
      credit: 0,
    });
    journalLines.push({
      accountId: ACCOUNT_REFERENCES.cogs.id,
      accountName: ACCOUNT_REFERENCES.cogs.name,
      debit: 0,
      credit: costReturned,
    });
  }

  await addJournalEntryInternal({
    date: returnData.date,
    reference: returnData.saleId,
    description: `Retur penjualan oleh ${user}`,
    lines: journalLines,
    sourceModule: 'return',
  });

  if (refundAmount > 0) {
    await updateCashflowSnapshot(returnData.date, 0, refundAmount);
  }
}

async function recordExpenseJournalEntry(expense: Expense, user: UserRole | 'sistem') {
  const journalLines: JournalLine[] = [
    {
      accountId: ACCOUNT_REFERENCES.expense.id,
      accountName: ACCOUNT_REFERENCES.expense.name,
      debit: expense.amount,
      credit: 0,
    },
    {
      accountId: ACCOUNT_REFERENCES.cash.id,
      accountName: ACCOUNT_REFERENCES.cash.name,
      debit: 0,
      credit: expense.amount,
    },
  ];

  await addJournalEntryInternal({
    date: expense.date,
    reference: expense.id || expense.name,
    description: `Pengeluaran kas (${expense.category}) oleh ${user}`,
    lines: journalLines,
    sourceModule: 'expense',
  });

  await updateCashflowSnapshot(expense.date, 0, expense.amount);
}

async function recordOtherIncomeJournalEntry(income: OtherIncome, user: UserRole | 'sistem') {
  const journalLines: JournalLine[] = [
    {
      accountId: ACCOUNT_REFERENCES.cash.id,
      accountName: ACCOUNT_REFERENCES.cash.name,
      debit: income.amount,
      credit: 0,
    },
    {
      accountId: ACCOUNT_REFERENCES.otherIncome.id,
      accountName: ACCOUNT_REFERENCES.otherIncome.name,
      debit: 0,
      credit: income.amount,
    },
  ];

  await addJournalEntryInternal({
    date: income.date,
    reference: income.id || income.name,
    description: `Pemasukan lain oleh ${user}`,
    lines: journalLines,
    sourceModule: 'other',
  });

  await updateCashflowSnapshot(income.date, income.amount, 0);
}

function convertDatesToTimestamps<T>(value: T): T {
  if (value instanceof Date) {
    return Timestamp.fromDate(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => convertDatesToTimestamps(item)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      result[key] = convertDatesToTimestamps(val);
    });
    return result as T;
  }

  return value;
}

async function getCollection<T>(collectionName: string): Promise<T[]> {
  const q = query(collection(db, collectionName));
  const querySnapshot = await getDocs(q);
  const results: T[] = querySnapshot.docs.map((docSnap) => {
    const data = convertTimestampsToDates(docSnap.data());
    return { id: docSnap.id, ...data } as T;
  });
  return results;
}

async function getDocumentById<T>(collectionName: string, id: string): Promise<T | undefined> {
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = convertTimestampsToDates(docSnap.data());
        return { id: docSnap.id, ...data } as T;
    }
    return undefined;
}


async function addDocument<T>(collectionName: string, data: Omit<T, 'id'>, id?: string): Promise<T> {
    const dataWithTimestamp = convertDatesToTimestamps(data);

  let docRef;
  if (id) {
    docRef = doc(db, collectionName, id);
    await setDoc(docRef, dataWithTimestamp);
  } else {
    docRef = await addDoc(collection(db, collectionName), dataWithTimestamp);
  }
  
  const newDoc = await getDocumentById<T>(collectionName, docRef.id);
  if (!newDoc) {
    throw new Error("Failed to retrieve the new document.");
  }
  return newDoc;
}

async function updateDocument<T>(collectionName: string, id: string, data: Partial<T>): Promise<void> {
  const docRef = doc(db, collectionName, id);
  await updateDoc(docRef, data as any);
}

async function deleteDocument(collectionName: string, id: string): Promise<void> {
  await deleteDoc(doc(db, collectionName, id));
}

// Activity Log Functions
export const getActivityLogs = () => getCollection<ActivityLog>('activityLogs');
export const addActivityLog = (user: UserRole | 'sistem' | null | undefined, description: string) => {
    const log: Omit<ActivityLog, 'id'> = {
        date: new Date(),
        user: user || 'sistem',
        description,
    };
    return addDocument<ActivityLog>('activityLogs', log);
};

export const deleteActivityLog = async (id: string): Promise<void> => {
    await deleteDocument('activityLogs', id);
};

export const clearActivityLogs = async (user: UserRole): Promise<void> => {
    const logsSnapshot = await getDocs(query(collection(db, 'activityLogs')));
    const batch = writeBatch(db);
    logsSnapshot.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
    await addActivityLog(user, 'menghapus seluruh riwayat log aktivitas.');
}



// Product-specific functions
export const getProducts = () => getCollection<Product>('products');
export const getProductById = (id: string) => getDocumentById<Product>('products', id);

export const addProduct = async (product: Omit<Product, 'id'>, user: UserRole, id?: string) => {
    const newProduct = await addDocument<Product>('products', product, id);
    await addActivityLog(user, `menambahkan produk baru: "${newProduct.name}"`);
    return newProduct;
};

export const updateProduct = async (id: string, productData: Partial<Product>, user: UserRole) => {
    const originalProduct = await getProductById(id);
    if (!originalProduct) {
       throw new Error("Produk tidak ditemukan untuk diperbarui.");
    }

    // Explicitly create an object with only the fields to be updated.
    // This prevents accidental overwrites and ensures even "0" values are sent.
    const dataToUpdate: Partial<Product> = {};
    if (productData.name !== undefined) dataToUpdate.name = productData.name;
    if (productData.costPrice !== undefined) dataToUpdate.costPrice = productData.costPrice;
    if (productData.sellingPrice !== undefined) dataToUpdate.sellingPrice = productData.sellingPrice;
    if (productData.stock !== undefined) dataToUpdate.stock = productData.stock;
    if (productData.category !== undefined) dataToUpdate.category = productData.category;
    if (productData.subcategory !== undefined) dataToUpdate.subcategory = productData.subcategory;

    await updateDocument<Product>('products', id, dataToUpdate);
    await addActivityLog(user, `memperbarui produk: "${originalProduct.name}"`);
};

export const deleteProduct = async (id: string, user: UserRole) => {
    const product = await getProductById(id);
    if (product) {
        await deleteDocument('products', id);
        await addActivityLog(user, `menghapus produk: "${product.name}"`);
    }
};




// Sale-specific functions
export const getSales = async (): Promise<Sale[]> => {
    const salesData = await getCollection<any>('sales');

    const normalized = salesData.map((rawSale) => {
        const saleDate = rawSale.date instanceof Date ? rawSale.date : new Date(rawSale.date);
        const payments: PaymentSplit[] | undefined = rawSale.payments?.map((payment: PaymentSplit) => ({
            ...payment,
            dueDate: payment.dueDate ? new Date(payment.dueDate) : undefined,
        }));

        return {
            ...rawSale,
            date: saleDate,
            payments,
            paymentStatus: rawSale.paymentStatus || rawSale.paidStatus,
            items: rawSale.items.map((item: any) => ({
                ...item,
                product: item.product || { id: 'unknown', name: 'Produk Dihapus', costPrice: 0, sellingPrice: 0, stock: 0, category: 'Lainnya' }
            })),
        } as Sale;
    });

    normalized.sort((a, b) => b.date.getTime() - a.date.getTime());

    return normalized.slice(0, PAGE_SIZE);
}

export const getSaleById = (id: string) => getDocumentById<Sale>('sales', id);

export const addSale = async (sale: Omit<Sale, 'id'>, user: UserRole): Promise<Sale> => {
    return (await batchAddSales([sale], user))[0];
}


export const batchAddSales = async (sales: Omit<Sale, 'id'>[], user: UserRole): Promise<Sale[]> => {
    const stockChanges: Record<string, number> = {};

    for (const sale of sales) {
        for (const item of sale.items) {
            stockChanges[item.product.id] = (stockChanges[item.product.id] || 0) + item.quantity;
        }
    }

    const newSales = await runTransaction(db, async (transaction) => {
        const productRefs = Object.keys(stockChanges).map(productId => doc(db, 'products', productId));
        const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));
        const productsData: Record<string, Product> = {};

        for (const docSnap of productDocs) {
            if (docSnap.exists()) {
                productsData[docSnap.id] = { id: docSnap.id, ...convertTimestampsToDates(docSnap.data()) } as Product;
            }
        }

        for (const productId in stockChanges) {
            if (productsData[productId]) {
                const productRef = doc(db, 'products', productId);
                const productData = productsData[productId];
                const newStock = productData.stock - stockChanges[productId];
                transaction.update(productRef, { stock: newStock });
            } else {
                console.warn(`Product with ID ${productId} not found. Stock not updated.`);
            }
        }

        const createdSales: Sale[] = [];

        for (const sale of sales) {
            const saleRef = doc(collection(db, 'sales'));
            const totalPayments = sale.payments?.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
            const paymentStatus: 'paid' | 'partial' | 'unpaid' = totalPayments >= sale.finalTotal
                ? 'paid'
                : totalPayments > 0
                    ? 'partial'
                    : 'unpaid';

            const cleanedItems = sale.items.map(item => ({
                product: {
                    id: item.product.id,
                    name: item.product.name,
                    category: item.product.category,
                    subcategory: item.product.subcategory || '',
                    costPrice: item.product.costPrice,
                },
                quantity: item.quantity,
                price: item.price,
                costPriceAtSale: productsData[item.product.id]?.costPrice ?? item.costPriceAtSale,
            }));

            const saleDataForFirestore = cleanUndefined({
                items: cleanedItems,
                subtotal: sale.subtotal,
                discount: sale.discount,
                finalTotal: sale.finalTotal,
                date: sale.date,
                channel: sale.channel,
                orderNo: sale.orderNo,
                customerName: sale.customerName,
                grossTotal: sale.grossTotal,
                taxAmount: sale.taxAmount,
                shippingFee: sale.shippingFee,
                otherFee: sale.otherFee,
                payments: sale.payments,
                paymentStatus,
                paidStatus: paymentStatus,
                paymentMethod: sale.paymentMethod,
                note: sale.note,
                sourceFileName: sale.sourceFileName,
            });

            transaction.set(saleRef, convertDatesToTimestamps(saleDataForFirestore));
            createdSales.push({ ...sale, id: saleRef.id, paymentStatus });
        }

        return createdSales;
    });

    for (const sale of newSales) {
        await recordSaleJournalEntry(sale, user, sale.sourceFileName ? 'sales-import' : 'pos');
    }

    await addActivityLog(user, `mencatat ${newSales.length} penjualan baru.`);
    return newSales;
};


export const updateSale = async (originalSale: Sale, updatedSaleData: Sale, user: UserRole): Promise<void> => {
    await runTransaction(db, async (transaction) => {
        const stockChanges: Record<string, number> = {};
        const allProductIds = new Set<string>();

        originalSale.items.forEach(item => {
            stockChanges[item.product.id] = (stockChanges[item.product.id] || 0) + item.quantity;
            allProductIds.add(item.product.id);
        });

        updatedSaleData.items.forEach(item => {
            stockChanges[item.product.id] = (stockChanges[item.product.id] || 0) - item.quantity;
            allProductIds.add(item.product.id);
        });

        for (const productId in stockChanges) {
            if (stockChanges[productId] === 0) continue;
            
            const productRef = doc(db, "products", productId);
            const productDoc = await transaction.get(productRef);

            if (!productDoc.exists()) {
                 console.warn(`Product with ID ${productId} not found during sale update. Stock not updated.`);
                continue;
            }
            const productData = productDoc.data() as Product;
            const newStock = productData.stock + stockChanges[productId];
            transaction.update(productRef, { stock: newStock });
        }

        const { id, displayId, ...saleDataForUpdate } = updatedSaleData;
        const cleanedItems = saleDataForUpdate.items.map(item => ({
            product: {
                id: item.product.id,
                name: item.product.name,
                category: item.product.category,
                subcategory: item.product.subcategory || '',
                costPrice: item.product.costPrice
            },
            quantity: item.quantity,
            price: item.price,
            costPriceAtSale: item.costPriceAtSale,
        }));
        
        const saleRef = doc(db, "sales", originalSale.id);
        transaction.update(saleRef, {
            ...saleDataForUpdate,
            items: cleanedItems,
            date: Timestamp.fromDate(new Date(updatedSaleData.date)),
        });
    });
     await addActivityLog(user, `memperbarui penjualan (ID: ...${originalSale.id.slice(-6)})`);
};

export const deleteSale = async (sale: Sale, user: UserRole): Promise<void> => {
    await runTransaction(db, async (transaction) => {
        // Restore stock for each item in the sale
        for (const item of sale.items) {
            if (!item.product || item.product.id === 'unknown') continue;
            
            const productRef = doc(db, "products", item.product.id);
            const productDoc = await transaction.get(productRef);

            if (productDoc.exists()) {
                const productData = productDoc.data() as Product;
                const newStock = productData.stock + item.quantity;
                transaction.update(productRef, { stock: newStock });
            } else {
                console.warn(`Product with ID ${item.product.id} not found during sale deletion. Stock not restored.`);
            }
        }

        // Delete the sale document
        const saleRef = doc(db, "sales", sale.id);
        transaction.delete(saleRef);
    });

    await addActivityLog(user, `menghapus penjualan (ID: ...${sale.id.slice(-6)})`);
};

export const batchDeleteSales = async (sales: Sale[], user: UserRole): Promise<void> => {
    await runTransaction(db, async (transaction) => {
        const stockChanges: Record<string, number> = {};

        // Aggregate all stock changes first
        for (const sale of sales) {
            for (const item of sale.items) {
                if (!item.product || item.product.id === 'unknown') continue;
                 stockChanges[item.product.id] = (stockChanges[item.product.id] || 0) + item.quantity;
            }
        }
        
        // Read all product docs
        const productRefs = Object.keys(stockChanges).map(id => doc(db, "products", id));
        const productDocs = await Promise.all(
            productRefs.map(ref => transaction.get(ref))
        );

        // Apply stock updates
        for (const productDoc of productDocs) {
             if (productDoc.exists()) {
                const productId = productDoc.id;
                const currentStock = productDoc.data().stock || 0;
                const change = stockChanges[productId] || 0;
                const newStock = currentStock + change;
                transaction.update(productDoc.ref, { stock: newStock });
            }
        }
        
        // Delete all selected sales
        for (const sale of sales) {
            const saleRef = doc(db, "sales", sale.id);
            transaction.delete(saleRef);
        }
    });

    await addActivityLog(user, `menghapus ${sales.length} transaksi penjualan secara massal.`);
};



// Expense-specific functions
export async function getExpenses(): Promise<Expense[]> {
    const expenses = await getCollection<Expense>('expenses');
    return expenses.map(e => ({...e, date: new Date(e.date) }));
}

export const addExpense = async (expense: Omit<Expense, 'id'>, user: UserRole | 'sistem') => {
    const newExpense = await addDocument<Expense>('expenses', expense);
    if(user !== 'sistem') {
        await addActivityLog(user, `mencatat pengeluaran: "${newExpense.name}" sebesar ${formatCurrency(newExpense.amount)}`);
    }
    await recordExpenseJournalEntry(newExpense, user);
    return newExpense;
};

export const updateExpense = async (id: string, expenseData: Partial<Omit<Expense, 'id'>>, user: UserRole) => {
    const dataToUpdate: any = { ...expenseData };
    if (expenseData.date) {
        dataToUpdate.date = Timestamp.fromDate(new Date(expenseData.date));
    }
    await updateDocument<Expense>('expenses', id, dataToUpdate);
    await addActivityLog(user, `memperbarui pengeluaran: "${expenseData.name}"`);
};

export const deleteExpense = async (expense: Expense, user: UserRole) => {
    await deleteDocument('expenses', expense.id);
    await addActivityLog(user, `menghapus pengeluaran: "${expense.name}"`);
};


// Return-specific functions
export async function getReturns(): Promise<Return[]> {
    const returnsData = await getCollection<any>('returns');
    return returnsData.map((ret: any) => ({
        ...ret,
        date: ret.date,
        items: ret.items.map((item: any) => ({
            ...item,
            product: item.product || { id: 'unknown', name: 'Produk Dihapus' }
        }))
    }));
}


export const addReturn = async (returnData: Omit<Return, 'id'>, user: UserRole): Promise<Return> => {
    try {
        const newReturn = await runTransaction(db, async (transaction) => {
            // --- READ PHASE ---
            const productRefs = returnData.items.map(item => doc(db, 'products', item.product.id));
            const productDocs = await Promise.all(
                productRefs.map(ref => transaction.get(ref))
            );

            // --- WRITE PHASE ---
            const newReturnRef = doc(collection(db, 'returns'));

            productDocs.forEach((productDoc, index) => {
                if (productDoc.exists()) {
                    const currentStock = productDoc.data().stock || 0;
                    const itemToReturn = returnData.items[index];
                    const newStock = currentStock + itemToReturn.quantity;
                    transaction.update(productDoc.ref, { stock: newStock });
                } else {
                    const itemToReturn = returnData.items[index];
                    console.warn(`Product with ID ${itemToReturn.product.id} not found during return. Stock not updated.`);
                }
            });

            const cleanedReturnData = {
                saleId: returnData.saleId,
                reason: returnData.reason,
                date: Timestamp.fromDate(returnData.date),
                totalRefund: returnData.totalRefund,
                items: returnData.items.map(item => ({
                    product: { 
                        id: item.product.id,
                        name: item.product.name,
                    },
                    quantity: item.quantity,
                    priceAtSale: item.priceAtSale,
                    costPriceAtSale: item.costPriceAtSale,
                })),
            };

            transaction.set(newReturnRef, cleanedReturnData);
            
            return {
                id: newReturnRef.id,
                ...returnData,
            };
        });

        await addActivityLog(user, `mencatat retur dari penjualan (ID: ...${newReturn.saleId.slice(-6)})`);
        await recordReturnJournalEntry(newReturn as Return, user);
        return newReturn as Return;

    } catch (e) {
        console.error("Return transaction failed: ", e);
        throw new Error("Gagal memproses retur. Silakan coba lagi.");
    }
};


// Other Income Functions
export async function getOtherIncomes(): Promise<OtherIncome[]> {
    const incomes = await getCollection<OtherIncome>('otherIncomes');
    return incomes.map(i => ({...i, date: new Date(i.date) }));
}

export const addOtherIncome = async (income: Omit<OtherIncome, 'id'>, user: UserRole) => {
    const newIncome = await addDocument<OtherIncome>('otherIncomes', income);
    await addActivityLog(user, `mencatat pemasukan lain: "${newIncome.name}" sebesar ${formatCurrency(newIncome.amount)}`);
    await recordOtherIncomeJournalEntry(newIncome, user);
    return newIncome;
};

export const updateOtherIncome = async (id: string, incomeData: Partial<Omit<OtherIncome, 'id'>>, user: UserRole) => {
    const dataToUpdate: any = { ...incomeData };
    if (incomeData.date) {
        dataToUpdate.date = Timestamp.fromDate(new Date(incomeData.date));
    }
    await updateDocument<OtherIncome>('otherIncomes', id, dataToUpdate);
    await addActivityLog(user, `memperbarui pemasukan lain: "${incomeData.name}"`);
};

export const deleteOtherIncome = async (income: OtherIncome, user: UserRole) => {
    await deleteDocument('otherIncomes', income.id);
    await addActivityLog(user, `menghapus pemasukan lain: "${income.name}"`);
};


// FlashSale-specific functions
export const getFlashSaleSettings = async (): Promise<FlashSale> => {
    const docRef = doc(db, 'settings', 'flashSale');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        return { id: 'main', ...data, products: data.products || [] } as FlashSale;
    } else {
        const defaultSettings: FlashSale = { id: 'main', title: 'Flash Sale', isActive: false, products: [] };
        await setDoc(docRef, defaultSettings);
        return defaultSettings;
    }
};

export const saveFlashSaleSettings = async (settings: FlashSale, user: UserRole): Promise<void> => {
    const { id, ...settingsData } = settings;
    const docRef = doc(db, 'settings', 'flashSale');
    await setDoc(docRef, settingsData, { merge: true });
    await addActivityLog(user, `memperbarui pengaturan Flash Sale. Status: ${settings.isActive ? 'Aktif' : 'Nonaktif'}`);
};

// Settings-specific functions
export const getPublicSettings = async (): Promise<PublicSettings> => {
    const docRef = doc(db, 'publicSettings', 'main');
    const docSnap = await getDoc(docRef);
     if (docSnap.exists()) {
        return docSnap.data() as PublicSettings;
    } else {
        const defaultSettings: PublicSettings = { defaultDiscount: 0 };
        await setDoc(docRef, defaultSettings);
        return defaultSettings;
    }
};

export const getSettings = async (): Promise<Settings> => {
    const docRef = doc(db, 'settings', 'main');
    const docSnap = await getDoc(docRef);
    const defaultSettings: Settings = { 
        storeName: 'Toko Cepat', 
        defaultDiscount: 0, 
        syncCostPrice: true, 
        theme: 'default',
        expenseCategories: [
            { id: 'exp-cat-1', name: 'Operasional', subcategories: [
                {id: 'exp-sub-1', name: 'Listrik & Air'},
                {id: 'exp-sub-2', name: 'Internet'},
            ] },
            { id: 'exp-cat-2', name: 'Gaji', subcategories: [] },
            { id: 'exp-cat-3', name: 'Pemasaran', subcategories: [] },
            { id: 'exp-cat-4', name: 'Lainnya', subcategories: [] },
        ]
    };

    if (docSnap.exists()) {
        const data = docSnap.data();
        const settings = { ...defaultSettings, ...data } as Settings;
        if(settings.expenseCategories) {
            settings.expenseCategories.forEach(cat => {
                if (!cat.subcategories) {
                    cat.subcategories = [];
                }
            });
        }
        return settings;
    } else {
        await setDoc(docRef, defaultSettings);
        return defaultSettings;
    }
};

export const saveSettings = async (settings: Partial<Settings>, user: UserRole): Promise<void> => {
    const { defaultDiscount, ...otherSettings } = settings;
    
    // Save public settings separately
    if (defaultDiscount !== undefined) {
        const publicSettingsRef = doc(db, 'publicSettings', 'main');
        await setDoc(publicSettingsRef, { defaultDiscount }, { merge: true });
    }
    
    // Save other settings
    if (Object.keys(otherSettings).length > 0) {
        const mainSettingsRef = doc(db, 'settings', 'main');
        await setDoc(mainSettingsRef, otherSettings, { merge: true });
    }
    
    await addActivityLog(user, `memperbarui pengaturan umum toko.`);
};


// Warehouse & Stock Transfer functions
export const getWarehouses = async (): Promise<Warehouse[]> => {
    return getCollection<Warehouse>('warehouses');
};

export const saveWarehouse = async (warehouse: Omit<Warehouse, 'id'> & { id?: string }): Promise<Warehouse> => {
    const id = warehouse.id || warehouse.name.toLowerCase().replace(/\s+/g, '-');
    const { id: _ignored, ...data } = warehouse;
    return addDocument<Warehouse>('warehouses', data, id);
};

export const deleteWarehouse = async (warehouseId: string): Promise<void> => {
    await deleteDocument('warehouses', warehouseId);
};

export const getStockTransfers = async (): Promise<StockTransfer[]> => {
    const transfers = await getCollection<StockTransfer>('stockTransfers');
    return transfers.map(t => ({ ...t, date: new Date(t.date) }));
};

export const transferStockBetweenWarehouses = async (
    transfer: Omit<StockTransfer, 'id'>,
    user: UserRole,
): Promise<void> => {
    const { productId, fromWarehouseId, toWarehouseId, quantity, date, note } = transfer;

    if (quantity <= 0) {
        throw new Error('Jumlah transfer harus lebih besar dari 0');
    }

    await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'products', productId);
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) {
            throw new Error('Produk tidak ditemukan untuk transfer stok');
        }

        const productData = { id: productDoc.id, ...productDoc.data() } as Product;
        const warehouses = [...(productData.warehouses || [])];

        const fromWarehouse = warehouses.find(w => w.warehouseId === fromWarehouseId);
        if (!fromWarehouse || fromWarehouse.quantity < quantity) {
            throw new Error('Stok di gudang asal tidak mencukupi');
        }

        fromWarehouse.quantity -= quantity;

        let toWarehouse = warehouses.find(w => w.warehouseId === toWarehouseId);
        if (!toWarehouse) {
            toWarehouse = { warehouseId: toWarehouseId, quantity: 0 };
            warehouses.push(toWarehouse);
        }
        toWarehouse.quantity += quantity;

        transaction.update(productRef, { warehouses });

        const transferData: Omit<StockTransfer, 'id'> = {
            productId,
            fromWarehouseId,
            toWarehouseId,
            quantity,
            date,
            note,
            user,
        };

        const transferRef = doc(collection(db, 'stockTransfers'));
        transaction.set(transferRef, convertDatesToTimestamps(transferData));
    });

    await addActivityLog(user, `memindahkan ${quantity} unit stok produk (${productId}) dari gudang ${fromWarehouseId} ke ${toWarehouseId}.`);
};

// Accounting exports
export const getAccounts = async (): Promise<Account[]> => getCollection<Account>('accounts');

export const upsertAccount = async (account: Account) => {
    await ensureAccountReference(account);
};

export const getJournalEntries = async (): Promise<JournalEntry[]> => {
    const entries = await getCollection<JournalEntry>('journalEntries');
    return entries.map(entry => ({
        ...entry,
        date: entry.date instanceof Date ? entry.date : new Date(entry.date),
    }));
};

export const getCashflowSnapshots = async (): Promise<CashflowSnapshot[]> => {
    const snapshots = await getCollection<CashflowSnapshot>('cashflowSnapshots');
    return snapshots.map(snapshot => ({
        ...snapshot,
        generatedAt: snapshot.generatedAt instanceof Date ? snapshot.generatedAt : new Date(snapshot.generatedAt),
    }));
};


// Stock Opname specific functions
export const getStockOpnameLogs = () => getCollection<StockOpnameLog>('stockOpnameLogs');

export const addStockOpnameLog = async (
    product: Product,
    newStock: number,
    notes: string,
    user: UserRole,
): Promise<void> => {
    const logData: Omit<StockOpnameLog, 'id'> = {
        productId: product.id,
        productName: product.name,
        previousStock: product.stock,
        newStock: newStock,
        date: new Date(),
        notes,
        user,
    };
    await addDocument<StockOpnameLog>('stockOpnameLogs', logData);
    await addActivityLog(user, `melakukan stok opname untuk "${product.name}". Stok berubah dari ${product.stock} menjadi ${newStock}.`);
};

export const batchUpdateStockToZero = async (products: Product[], user: UserRole): Promise<void> => {
    await runTransaction(db, async (transaction) => {
      const logCollectionRef = collection(db, 'stockOpnameLogs');
      for (const product of products) {
        const productRef = doc(db, "products", product.id);
        transaction.update(productRef, { stock: 0 });
  
        const logData: Omit<StockOpnameLog, 'id'> = {
          productId: product.id,
          productName: product.name,
          previousStock: product.stock,
          newStock: 0,
          date: new Date(),
          notes: "Diatur ke 0 secara massal",
          user: user,
        };
  
        const logDocRef = doc(logCollectionRef);
        transaction.set(logDocRef, { ...logData, date: Timestamp.fromDate(logData.date) });
      }
    });
     await addActivityLog(user, `mengatur stok 0 untuk ${products.length} produk secara massal.`);
  };


// Danger Zone functions
type DataType = 'products' | 'sales' | 'returns' | 'expenses';

export const clearData = async (dataToClear: Record<DataType, boolean>, user: UserRole): Promise<void> => {
    const collectionsToDelete = Object.entries(dataToClear)
        .filter(([, shouldDelete]) => shouldDelete)
        .map(([collectionName]) => collectionName);

    if (collectionsToDelete.length === 0) {
        return;
    }

    const batch = writeBatch(db);

    for (const collectionName of collectionsToDelete) {
        const querySnapshot = await getDocs(collection(db, collectionName));
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
    }

    await batch.commit();
    await addActivityLog(user, `menghapus data: ${collectionsToDelete.join(', ')}.`);
};

// Imported Files Functions
export const hasImportedFile = async (fileName: string): Promise<boolean> => {
    const q = query(collection(db, 'importedFiles'), where('name', '==', fileName));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
};

export const addImportedFile = async (fileName: string): Promise<void> => {
    const fileData: Omit<ImportedFile, 'id'> = {
        name: fileName,
        importedAt: new Date(),
    };
    await addDocument<ImportedFile>('importedFiles', fileData);
};

// SKU Mapping Functions
export const getSkuMappings = async (): Promise<SkuMapping[]> => {
    return getCollection<SkuMapping>('skuMappings');
};

export const saveSkuMapping = async (mapping: Omit<SkuMapping, 'id'>): Promise<SkuMapping> => {
    // Check if a mapping for this importSku already exists
    const q = query(collection(db, 'skuMappings'), where('importSku', '==', mapping.importSku));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        // Update the existing mapping
        const existingDoc = querySnapshot.docs[0];
        await updateDocument('skuMappings', existingDoc.id, {
            mappedProductId: mapping.mappedProductId,
            mappedProductName: mapping.mappedProductName,
        });
        return { id: existingDoc.id, ...existingDoc.data(), ...mapping } as SkuMapping;
    } else {
        // Add a new mapping
        return addDocument<SkuMapping>('skuMappings', mapping);
    }
};


// Helper
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
};
