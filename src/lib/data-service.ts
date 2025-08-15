

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
import type { Product, Sale, Return, Expense, FlashSale, Settings, SaleItem, ReturnItem, Category, SubCategory, StockOpnameLog, UserRole, ActivityLog, PublicSettings, OtherIncome, ImportedFile, SkuMapping } from './types';
import { placeholderProducts } from './placeholder-data';

// Generic Firestore interaction functions
async function getCollection<T>(collectionName: string): Promise<T[]> {
  const q = query(collection(db, collectionName));
  const querySnapshot = await getDocs(q);
  const results: T[] = [];
    querySnapshot.docs.forEach(doc => {
        const data = doc.data();
        // Convert Firestore Timestamps to JS Dates
        for (const key in data) {
          if (Object.prototype.hasOwnProperty.call(data, key)) {
            const value = data[key];
            if (value instanceof Timestamp) {
              data[key] = value.toDate();
            }
          }
        }
        results.push({ id: doc.id, ...data } as T);
    });
    return results;
}

async function getDocumentById<T>(collectionName: string, id: string): Promise<T | undefined> {
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        // Convert Firestore Timestamps to JS Dates
        Object.keys(data).forEach(key => {
            if (data[key] instanceof Timestamp) {
                data[key] = data[key].toDate();
            }
        });
        return { id: docSnap.id, ...data } as T;
    }
    return undefined;
}


async function addDocument<T>(collectionName: string, data: Omit<T, 'id'>, id?: string): Promise<T> {
    const dataWithTimestamp: { [key: string]: any } = { ...data };
    Object.keys(dataWithTimestamp).forEach(key => {
        if (dataWithTimestamp[key] instanceof Date) {
            dataWithTimestamp[key] = Timestamp.fromDate(dataWithTimestamp[key]);
        }
    });

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
    return salesData.map(sale => ({
        ...sale,
        date: sale.date,
        items: sale.items.map((item: any) => ({
             ...item,
             product: item.product || { id: 'unknown', name: 'Produk Dihapus', costPrice: 0, sellingPrice: 0, stock: 0, category: 'Lainnya' }
        }))
    }));
}

export const getSaleById = (id: string) => getDocumentById<Sale>('sales', id);

export const addSale = async (sale: Omit<Sale, 'id'>, user: UserRole): Promise<Sale> => {
    const productRefs = sale.items.map(item => doc(db, 'products', item.product.id));
    
    let newSaleId = '';
    const newSale = await runTransaction(db, async (transaction) => {
        const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));
        const productsData: Record<string, Product> = {};
        for (const docSnap of productDocs) {
            if (docSnap.exists()) {
                productsData[docSnap.id] = { id: docSnap.id, ...docSnap.data() } as Product;
            } else {
                // Find which product name is missing
                const missingProductId = docSnap.ref.id;
                const missingItem = sale.items.find(i => i.product.id === missingProductId);
                throw new Error(`Produk "${missingItem?.product.name || missingProductId}" tidak ditemukan.`);
            }
        }

        // Create a clean object for Firestore without displayId
        const saleDataForFirestore = {
            items: sale.items.map(item => ({
                product: {
                    id: item.product.id,
                    name: item.product.name,
                    category: item.product.category,
                    subcategory: item.product.subcategory || '',
                    costPrice: item.product.costPrice,
                },
                quantity: item.quantity,
                price: item.price,
                costPriceAtSale: productsData[item.product.id].costPrice,
            })),
            subtotal: sale.subtotal,
            discount: sale.discount,
            finalTotal: sale.finalTotal,
            date: Timestamp.fromDate(sale.date)
        };
        

        const saleRef = doc(collection(db, "sales"));
        newSaleId = saleRef.id;
        transaction.set(saleRef, saleDataForFirestore);

        for (const item of sale.items) {
            const productRef = doc(db, "products", item.product.id);
            const productData = productsData[item.product.id];
            const newStock = productData.stock - item.quantity;
            transaction.update(productRef, { stock: newStock });
        }
        
        return { ...sale, id: saleRef.id };
    });

    await addActivityLog(user, `mencatat penjualan baru (ID: ...${newSaleId.slice(-6)}) dengan total ${formatCurrency(sale.finalTotal)}`);
    return newSale;
}


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
