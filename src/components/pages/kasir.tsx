

'use client';

import type { FC } from 'react';
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { SaleItem, Product, Settings, FlashSale, Sale, Expense, Return, UserRole, PaymentSplit, PaymentMethod } from '@/lib/types';
import { PlusCircle, MinusCircle, Search, Calendar as CalendarIcon, ArrowLeft, ShoppingCart, Zap, Undo2, Wallet, Trash2, FileUp, PauseCircle, Printer, Plus, Clock3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { addSale, addReturn, addExpense, getProducts } from '@/lib/data-service';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Skeleton } from '../ui/skeleton';
import { ReturnForm } from './retur';
import { ExpenseForm } from './pengeluaran';


const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
};

type PaymentRow = PaymentSplit & { id: string };

type ParkedTransaction = {
    id: string;
    label: string;
    cart: SaleItem[];
    discount: number;
    transactionDate: Date;
    payments: PaymentSplit[];
    note?: string;
    createdAt: Date;
};

const PARKED_STORAGE_KEY = 'tokocepat:parked-transactions';

const paymentMethodLabels: Record<PaymentMethod, string> = {
    cash: 'Tunai',
    transfer: 'Transfer Bank',
    ewallet: 'E-Wallet',
    credit: 'Kredit',
};

const loadParkedTransactions = (): ParkedTransaction[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(PARKED_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as any[];
        return parsed.map(item => ({
            ...item,
            transactionDate: item.transactionDate ? new Date(item.transactionDate) : new Date(),
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
            payments: Array.isArray(item.payments)
                ? item.payments.map((payment: any) => ({
                    method: payment.method as PaymentMethod,
                    amount: Number(payment.amount) || 0,
                    reference: payment.reference,
                    dueDate: payment.dueDate ? new Date(payment.dueDate) : undefined,
                }))
                : [],
        }));
    } catch (error) {
        console.warn('Gagal memuat transaksi parkir', error);
        return [];
    }
};

interface KasirPageProps {
  settings: Settings;
  flashSale: FlashSale;
  products: Product[];
  onDataNeedsRefresh: () => void;
  userRole: UserRole;
  sales: Sale[];
  cart: SaleItem[];
  setCart: React.Dispatch<React.SetStateAction<SaleItem[]>>;
  discount: number;
  setDiscount: React.Dispatch<React.SetStateAction<number>>;
  transactionDate: Date;
  setTransactionDate: React.Dispatch<React.SetStateAction<Date>>;
  cartItemCount: number;
}

const KasirPage: FC<KasirPageProps> = React.memo(({ 
  settings, 
  flashSale, 
  products, 
  onDataNeedsRefresh, 
  userRole, 
  sales,
  cart,
  setCart,
  discount,
  setDiscount,
  transactionDate,
  setTransactionDate,
  cartItemCount
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [carouselApi, setCarouselApi] = React.useState<CarouselApi>()
  const [currentSlide, setCurrentSlide] = React.useState(0)
  const [sortOrder, setSortOrder] = useState('terlaris');
  const [isReturnFormOpen, setReturnFormOpen] = useState(false);
  const [isExpenseFormOpen, setExpenseFormOpen] = useState(false);
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([{ id: 'payment-row-1', method: 'cash', amount: 0 }]);
  const [isPaymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [saleNote, setSaleNote] = useState('');
  const [parkLabel, setParkLabel] = useState('');
  const [isParkDialogOpen, setParkDialogOpen] = useState(false);
  const [parkedTransactions, setParkedTransactions] = useState<ParkedTransaction[]>(() => loadParkedTransactions());
  const [isParkedSheetOpen, setParkedSheetOpen] = useState(false);
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const serializable = parkedTransactions.map(transaction => ({
        ...transaction,
        transactionDate: transaction.transactionDate.toISOString(),
        createdAt: transaction.createdAt.toISOString(),
        payments: transaction.payments.map(payment => ({
            ...payment,
            dueDate: payment.dueDate ? payment.dueDate.toISOString() : undefined,
        })),
    }));
    window.localStorage.setItem(PARKED_STORAGE_KEY, JSON.stringify(serializable));
  }, [parkedTransactions]);

  React.useEffect(() => {
    if (!carouselApi) {
      return
    }
 
    setCurrentSlide(carouselApi.selectedScrollSnap())
 
    carouselApi.on("select", () => {
      setCurrentSlide(carouselApi.selectedScrollSnap())
    })
  }, [carouselApi])

  const sortedProducts = useMemo(() => {
    const productsWithSales = products.map(product => {
        const salesCount = sales.reduce((count, sale) => {
            return count + (sale.items.find(item => item.product.id === product.id)?.quantity || 0);
        }, 0);
        return { ...product, salesCount };
    });

    return [...productsWithSales].sort((a, b) => {
        switch (sortOrder) {
            case 'terlaris':
                return b.salesCount - a.salesCount;
            case 'nama-az':
                return a.name.localeCompare(b.name);
            case 'nama-za':
                return b.name.localeCompare(a.name);
            case 'stok-terbanyak':
                return b.stock - a.stock;
            case 'stok-tersedikit':
                return a.stock - b.stock;
            default:
                return 0;
        }
    });
  }, [products, sales, sortOrder]);

  const filteredProducts = useMemo(() => sortedProducts.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  ), [sortedProducts, searchTerm]);

  const addToCart = (product: Product) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.product.id === product.id);

      let price = product.sellingPrice;
      if (flashSale.isActive) {
        const productInSale = flashSale.products.find(p => p.id === product.id);
        if (productInSale) {
          price = productInSale.discountPrice;
        }
      }
      
      if (existingItem) {
        return prevCart.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1, price: price } : item
        );
      }
      return [...prevCart, { 
          product: { id: product.id, name: product.name, category: product.category, subcategory: product.subcategory, costPrice: product.costPrice }, 
          quantity: 1, 
          price: price, 
          costPriceAtSale: product.costPrice 
        }];
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    const newQuantity = Math.max(0, quantity); // Ensure quantity is not negative
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.product.id === productId ? { ...item, quantity: newQuantity } : item
      )
    );
  };
  
  const updatePrice = (productId: string, price: number) => {
      const newPrice = Math.max(0, price); // Ensure price is not negative
      setCart((prevCart) =>
        prevCart.map((item) =>
          item.product.id === productId ? { ...item, price: newPrice } : item
        )
      );
  };

  const clearCart = () => {
    setCart([]);
    setPaymentRows([{ id: `payment-row-${Date.now()}`, method: 'cash', amount: 0 }]);
    setSaleNote('');
  };

  const { subtotal, discountAmount, total } = useMemo(() => {
    const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const discountAmount = (subtotal * discount) / 100;
    const total = subtotal - discountAmount;
    return { subtotal, discountAmount, total };
  }, [cart, discount]);

  const paymentTotal = useMemo(() => paymentRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0), [paymentRows]);
  const paymentDifference = useMemo(() => paymentTotal - total, [paymentTotal, total]);

  const addPaymentRow = () => {
    const newRow: PaymentRow = { id: `payment-row-${Date.now()}`, method: 'cash', amount: Math.max(total - paymentTotal, 0) };
    setPaymentRows(prev => [...prev, newRow]);
  };

  const removePaymentRow = (id: string) => {
    setPaymentRows(prev => (prev.length === 1 ? prev : prev.filter(row => row.id !== id)));
  };

  const updatePaymentRow = (id: string, changes: Partial<PaymentRow>) => {
    setPaymentRows(prev => prev.map(row => (row.id === id ? { ...row, ...changes } : row)));
  };

  const handlePaymentClick = () => {
    if (cart.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Keranjang Kosong',
        description: 'Silakan tambahkan produk ke keranjang terlebih dahulu.',
      });
      return;
    }

    const itemsInCart = cart.filter(item => item.quantity > 0);
    if (itemsInCart.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Keranjang Kosong',
        description: 'Tidak ada item dengan jumlah lebih dari 0 untuk dibayar.',
      });
      return;
    }

    if (paymentRows.length === 0) {
        setPaymentRows([{ id: `payment-row-${Date.now()}`, method: 'cash', amount: total }]);
    } else {
        setPaymentRows(prev => prev.map((row, index) => ({ ...row, amount: index === 0 ? total : 0 })));
    }
    setPaymentDialogOpen(true);
  };

  const submitPayment = async () => {
    const itemsInCart = cart.filter(item => item.quantity > 0);
    if (itemsInCart.length === 0) {
      toast({ variant: 'destructive', title: 'Keranjang Kosong', description: 'Tidak ada item untuk diproses.' });
      return;
    }

    const roundedTotal = Math.round(total);
    const preparedPayments = paymentRows
      .map(row => ({ ...row, amount: Math.round(Number(row.amount) || 0) }))
      .filter(row => row.amount > 0);

    if (preparedPayments.length === 0) {
      toast({ variant: 'destructive', title: 'Pembayaran Tidak Valid', description: 'Masukkan minimal satu metode pembayaran.' });
      return;
    }

    const paymentsSum = preparedPayments.reduce((sum, row) => sum + row.amount, 0);
    const difference = roundedTotal - paymentsSum;

    if (Math.abs(difference) > 1 && roundedTotal !== 0) {
      toast({ variant: 'destructive', title: 'Jumlah Pembayaran Tidak Sesuai', description: 'Total pembayaran harus sama dengan total belanja.' });
      return;
    }

    if (difference !== 0 && preparedPayments.length > 0) {
      preparedPayments[0].amount += difference;
    }

    if (preparedPayments[0].amount < 0) {
      toast({ variant: 'destructive', title: 'Jumlah Pembayaran Tidak Valid', description: 'Pembayaran tidak boleh bernilai negatif.' });
      return;
    }

    const paymentsToSave: PaymentSplit[] = preparedPayments.map(({ id, ...rest }) => rest);
    const subtotalValue = itemsInCart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const finalTotalValue = Math.round(subtotalValue * (1 - discount / 100));

    const salePayload: Omit<Sale, 'id'> = {
        items: itemsInCart,
        subtotal: subtotalValue,
        discount,
        finalTotal: finalTotalValue,
        date: transactionDate,
        payments: paymentsToSave,
        paymentMethod: paymentsToSave.length === 1 ? paymentsToSave[0].method : undefined,
        channel: 'Offline',
        orderNo: `POS-${Date.now()}`,
        customerName: 'Walk-in',
        grossTotal: subtotalValue,
        note: saleNote ? saleNote.trim() : undefined,
    };

    try {
        const savedSale = await addSale(salePayload, userRole);
        setLastCompletedSale({ ...savedSale, payments: paymentsToSave });
        toast({ title: 'Pembayaran Berhasil', description: `Total pembayaran ${formatCurrency(finalTotalValue)} telah diproses.` });
        clearCart();
        setDiscount(settings.defaultDiscount || 0);
        onDataNeedsRefresh();
        setPaymentDialogOpen(false);
    } catch (error) {
        console.error(error);
        toast({ title: 'Error', description: 'Gagal menyimpan transaksi.', variant: 'destructive' });
    }
  };

  const printReceipt = (sale: Sale) => {
    if (typeof window === 'undefined') return;
    const receiptWindow = window.open('', 'printWindow');
    if (!receiptWindow) {
      toast({ title: 'Gagal Membuka Cetak', description: 'Izinkan popup untuk mencetak struk.', variant: 'destructive' });
      return;
    }

    const saleDate = format(new Date(sale.date), 'dd MMM yyyy HH:mm', { locale: id });
    const itemsHtml = sale.items.map(item => {
        const lineTotal = item.price * item.quantity;
        return `<tr><td>${item.product.name}</td><td class="qty">${item.quantity}</td><td class="amount">${formatCurrency(item.price)}</td><td class="amount">${formatCurrency(lineTotal)}</td></tr>`;
    }).join('');

    const paymentsHtml = (sale.payments || []).map(payment => {
        const methodLabel = paymentMethodLabels[payment.method] || payment.method;
        return `<li>${methodLabel}: <strong>${formatCurrency(payment.amount)}</strong>${payment.reference ? ` (Ref: ${payment.reference})` : ''}</li>`;
    }).join('');

    const html = `<!DOCTYPE html>
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Struk Pembayaran</title>
        <style>
          body { font-family: 'PT Sans', Arial, sans-serif; margin: 0; padding: 16px; color: #1f2937; }
          h1 { font-size: 1.25rem; margin-bottom: 4px; }
          .meta { font-size: 0.85rem; color: #6b7280; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th, td { text-align: left; padding: 4px 0; font-size: 0.85rem; }
          th { border-bottom: 1px solid #e5e7eb; }
          .qty { text-align: center; width: 48px; }
          .amount { text-align: right; width: 96px; }
          .totals { margin-top: 8px; font-size: 0.9rem; }
          .totals div { display: flex; justify-content: space-between; margin-bottom: 4px; }
          ul { padding-left: 16px; margin: 0; }
        </style>
      </head>
      <body>
        <h1>${settings.storeName}</h1>
        <div class="meta">
          <div>Tanggal: ${saleDate}</div>
          <div>Invoice: ${sale.orderNo || sale.id}</div>
        </div>
        <table>
          <thead>
            <tr><th>Produk</th><th class="qty">Qty</th><th class="amount">Harga</th><th class="amount">Total</th></tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="totals">
          <div><span>Subtotal</span><span>${formatCurrency(sale.subtotal)}</span></div>
          <div><span>Diskon (${sale.discount}% )</span><span>- ${formatCurrency((sale.subtotal * sale.discount) / 100)}</span></div>
          <div style="font-weight:600;"><span>Total</span><span>${formatCurrency(sale.finalTotal)}</span></div>
        </div>
        ${paymentsHtml ? `<div style="margin-top:12px"><strong>Metode Pembayaran</strong><ul>${paymentsHtml}</ul></div>` : ''}
        ${sale.note ? `<p style="margin-top:12px">Catatan: ${sale.note}</p>` : ''}
        <p style="margin-top:16px; font-size:0.8rem;">Terima kasih telah berbelanja!</p>
      </body>
    </html>`;

    receiptWindow.document.open();
    receiptWindow.document.write(html);
    receiptWindow.document.close();
    receiptWindow.focus();
    receiptWindow.print();
  };

  useEffect(() => {
    if (!lastCompletedSale) return;
    printReceipt(lastCompletedSale);
    setLastCompletedSale(null);
  }, [lastCompletedSale]);

  const handleSaveReturn = async (itemData: Omit<Return, 'id'>) => {
    try {
        await addReturn(itemData, userRole);
        toast({ title: "Retur Disimpan", description: "Data retur baru telah berhasil disimpan." });
        onDataNeedsRefresh();
    } catch(error) {
        const errorMessage = error instanceof Error ? error.message : "Gagal menyimpan data retur.";
        toast({ title: "Error", description: errorMessage, variant: "destructive" });
        console.error(error);
    }
  }

  const handleSaveExpense = async (expenseData: Omit<Expense, 'id'>) => {
    try {
        await addExpense(expenseData, userRole);
        toast({ title: "Pengeluaran Disimpan", description: `Pengeluaran telah berhasil disimpan.` });
        onDataNeedsRefresh();
    } catch(error) {
        toast({ title: "Error", description: "Gagal menyimpan pengeluaran.", variant: "destructive" });
        console.error(error);
    }
  }

  const parkCurrentTransaction = () => {
    if (cart.length === 0) {
        toast({ variant: 'destructive', title: 'Tidak Ada Item', description: 'Keranjang masih kosong sehingga tidak dapat diparkir.' });
        return;
    }

    const itemsInCart = cart.filter(item => item.quantity > 0);
    if (itemsInCart.length === 0) {
        toast({ variant: 'destructive', title: 'Jumlah Tidak Valid', description: 'Pastikan ada item dengan kuantitas lebih dari 0 sebelum parkir.' });
        return;
    }

    const label = parkLabel.trim() || `Transaksi ${format(transactionDate, 'dd MMM HH:mm', { locale: id })}`;
    const snapshot: ParkedTransaction = {
        id: `park-${Date.now()}`,
        label,
        cart: itemsInCart.map(item => ({
            ...item,
            product: { ...item.product },
        })),
        discount,
        transactionDate,
        payments: paymentRows.map(({ id, ...rest }) => rest),
        note: saleNote ? saleNote.trim() : undefined,
        createdAt: new Date(),
    };

    setParkedTransactions(prev => [...prev, snapshot]);
    setParkLabel('');
    setParkDialogOpen(false);
    clearCart();
    toast({ title: 'Transaksi Disimpan', description: 'Transaksi berhasil diparkir. Anda dapat melanjutkannya kapan saja.' });
  };

  const resumeParkedTransaction = (transaction: ParkedTransaction) => {
    setCart(transaction.cart.map(item => ({ ...item, product: { ...item.product } })));
    setDiscount(transaction.discount);
    setTransactionDate(new Date(transaction.transactionDate));
    if (transaction.payments.length > 0) {
        setPaymentRows(transaction.payments.map((payment, index) => ({ ...payment, id: `payment-row-${Date.now()}-${index}` })));
    } else {
        const fallbackSubtotal = transaction.cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
        const fallbackTotal = Math.round(fallbackSubtotal * (1 - transaction.discount / 100));
        setPaymentRows([{ id: `payment-row-${Date.now()}`, method: 'cash', amount: fallbackTotal }]);
    }
    setSaleNote(transaction.note || '');
    setParkedTransactions(prev => prev.filter(item => item.id !== transaction.id));
    setParkedSheetOpen(false);
    toast({ title: 'Transaksi Dipulihkan', description: `${transaction.label} siap diproses.` });
  };

  const removeParkedTransaction = (id: string) => {
    setParkedTransactions(prev => prev.filter(item => item.id !== id));
  };

  const renderProductGrid = (isMobile = false) => (
    <Card className={`h-full flex flex-col shadow-none border-0 ${isMobile ? '' : 'lg:col-span-2'}`}>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Pilih Produk</CardTitle>
          {flashSale.isActive && (
            <Badge variant="destructive" className="animate-pulse">
              <Zap className="mr-2 h-4 w-4" /> {flashSale.title}
            </Badge>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Cari produk..."
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Urutkan berdasarkan" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="terlaris">Terlaris</SelectItem>
                    <SelectItem value="nama-az">Nama A-Z</SelectItem>
                    <SelectItem value="nama-za">Nama Z-A</SelectItem>
                    <SelectItem value="stok-terbanyak">Stok Terbanyak</SelectItem>
                    <SelectItem value="stok-tersedikit">Stok Tersedikit</SelectItem>
                </SelectContent>
            </Select>
        </div>
      </CardHeader>
      <CardContent className="flex-grow p-0">
        <ScrollArea className={isMobile ? "h-[calc(100vh-22rem)]" : "h-full lg:h-[calc(100vh-16rem)]"}>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            {filteredProducts.map((product) => {
              let displayPrice = product.sellingPrice;
              let originalPrice = undefined;
              if (flashSale.isActive) {
                const saleProduct = flashSale.products.find(p => p.id === product.id);
                if (saleProduct) {
                    displayPrice = saleProduct.discountPrice;
                    originalPrice = product.sellingPrice;
                }
              }

              return (
                <Card
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="cursor-pointer hover:shadow-lg transition-shadow group flex flex-col p-3"
                >
                  <div className="flex-grow flex flex-col text-center justify-center">
                    <h3 className="font-semibold text-sm md:text-base leading-tight">{product.name}</h3>
                    {originalPrice !== undefined ? (
                      <div className="mt-1">
                        <p className="text-xs md:text-sm text-muted-foreground line-through">{formatCurrency(originalPrice)}</p>
                        <p className="text-sm md:text-base text-destructive font-bold">{formatCurrency(displayPrice)}</p>
                      </div>
                    ) : (
                      <p className="text-sm md:text-base text-primary font-medium mt-1">{formatCurrency(displayPrice)}</p>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );

  const renderCartView = (isMobile = false) => (
    <>
     <Card className={`h-full flex flex-col shadow-none border-0 ${isMobile ? '' : 'lg:col-span-1'}`}>
        <CardHeader>
            <div className="flex justify-between items-center mb-2">
                {isMobile && (
                    <Button variant="outline" size="sm" onClick={() => carouselApi?.scrollPrev()}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Produk
                    </Button>
                )}
                <CardTitle>Keranjang</CardTitle>
                <div className="flex items-center gap-2">
                    {cart.length > 0 && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Kosongkan Keranjang?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Tindakan ini akan menghapus semua item dari keranjang Anda saat ini.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Batal</AlertDialogCancel>
                                    <AlertDialogAction onClick={clearCart}>Ya, Hapus Semua</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                    <Sheet open={isParkedSheetOpen} onOpenChange={setParkedSheetOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 relative" title="Transaksi Tertahan">
                                <PauseCircle className="h-4 w-4" />
                                {parkedTransactions.length > 0 && (
                                    <Badge
                                        variant="destructive"
                                        className="absolute -top-1 -right-1 h-4 min-w-[1.25rem] px-1 text-[10px] font-medium"
                                    >
                                        {parkedTransactions.length}
                                    </Badge>
                                )}
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-[320px] sm:w-[420px] overflow-y-auto">
                            <SheetHeader>
                                <SheetTitle>Transaksi Tertahan</SheetTitle>
                            </SheetHeader>
                            <div className="mt-4 space-y-4">
                                {parkedTransactions.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Belum ada transaksi yang diparkir.</p>
                                ) : (
                                    parkedTransactions.map((transaction) => {
                                        const itemCount = transaction.cart.reduce((sum, item) => sum + item.quantity, 0);
                                        const subtotalParked = transaction.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
                                        const discountValue = (subtotalParked * transaction.discount) / 100;
                                        const finalValue = subtotalParked - discountValue;
                                        return (
                                            <Card key={transaction.id}>
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-base">{transaction.label}</CardTitle>
                                                    <CardDescription>
                                                        {format(transaction.createdAt, 'dd MMM yyyy HH:mm', { locale: id })}
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent className="space-y-2 text-sm">
                                                    <div className="flex justify-between"><span>Item</span><span>{itemCount}</span></div>
                                                    <div className="flex justify-between"><span>Diskon</span><span>{transaction.discount}%</span></div>
                                                    <div className="flex justify-between"><span>Total</span><span>{formatCurrency(finalValue)}</span></div>
                                                    {transaction.note && <p className="text-xs text-muted-foreground">Catatan: {transaction.note}</p>}
                                                </CardContent>
                                                <CardFooter className="flex gap-2">
                                                    <Button size="sm" className="flex-1" onClick={() => resumeParkedTransaction(transaction)}>
                                                        Gunakan
                                                    </Button>
                                                    <Button size="sm" variant="outline" onClick={() => removeParkedTransaction(transaction.id)}>
                                                        Hapus
                                                    </Button>
                                                </CardFooter>
                                            </Card>
                                        );
                                    })
                                )}
                            </div>
                        </SheetContent>
                    </Sheet>
                    <Badge variant="outline">{cartItemCount} Item</Badge>
                </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-2 gap-2">
                <Dialog open={isReturnFormOpen} onOpenChange={setReturnFormOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">
                            <Undo2 className="mr-2 h-4 w-4" /> Retur
                        </Button>
                    </DialogTrigger>
                    <ReturnForm onSave={handleSaveReturn} onOpenChange={setReturnFormOpen} userRole={userRole} />
                </Dialog>
                <Dialog open={isExpenseFormOpen} onOpenChange={setExpenseFormOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">
                            <Wallet className="mr-2 h-4 w-4" /> Pengeluaran
                        </Button>
                    </DialogTrigger>
                    <ExpenseForm onSave={handleSaveExpense} onOpenChange={setExpenseFormOpen} userRole={userRole}/>
                </Dialog>
            </div>
        </CardHeader>
        <CardContent className="flex-grow">
            <ScrollArea className={isMobile ? "h-[calc(100vh-30rem)]" : "h-full lg:h-[calc(100vh-29rem)]"}>
            {cart.length === 0 ? (
                <div className="text-center text-muted-foreground py-10 flex flex-col items-center justify-center h-full">
                  <ShoppingCart className="h-10 w-10 mb-4 text-muted-foreground/50"/>
                  <p>Keranjang masih kosong.</p>
                  <p className="text-xs">Pilih produk untuk memulai transaksi.</p>
                </div>
            ) : (
                <div className="space-y-4">
                {cart.map((item, index) => (
                    <div key={`${item.product.id}-${index}`} className="flex items-center gap-4">
                        <div className="flex-grow">
                            <p className="font-semibold text-sm md:text-base">{item.product.name}</p>
                            <Input
                                type="number"
                                value={item.price}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    updatePrice(item.product.id, value === '' ? 0 : parseInt(value, 10) || 0);
                                }}
                                className="w-28 h-8 text-xs"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                            >
                                <MinusCircle className="h-4 w-4" />
                            </Button>
                             <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    updateQuantity(item.product.id, value === '' ? 0 : parseInt(value, 10) || 0);
                                }}
                                className="w-12 h-8 text-center"
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                            >
                                <PlusCircle className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="font-semibold text-sm md:text-base w-24 text-right">{formatCurrency(item.price * item.quantity)}</p>
                    </div>
                ))}
                </div>
            )}
            </ScrollArea>
        </CardContent>
        <Separator />
        <CardFooter className="flex-col !p-4">
            <div className="w-full space-y-2 text-sm">
                <div className="flex justify-between items-center">
                    <span>Tanggal Transaksi</span>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            className="w-[160px] justify-start text-left font-normal text-xs h-8"
                        >
                            <CalendarIcon className="mr-2 h-3 w-3" />
                            {format(transactionDate, "PPP", { locale: id })}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                        <Calendar
                            mode="single"
                            selected={transactionDate}
                            onSelect={(date) => date && setTransactionDate(date)}
                            initialFocus
                        />
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span>Diskon (%)</span>
                    <Input 
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    className="w-20 h-8 text-sm"
                    step="0.1"
                    min="0"
                    max="100"
                    />
                </div>
                <div className="flex justify-between text-muted-foreground">
                    <span>Potongan Diskon</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                </div>
            </div>
            <div className="flex w-full gap-2 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => setParkDialogOpen(true)}>
                    <PauseCircle className="mr-2 h-4 w-4" /> Parkir
                </Button>
                <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90" onClick={handlePaymentClick}>
                    <Printer className="mr-2 h-4 w-4" /> Bayar & Cetak
                </Button>
            </div>
        </CardFooter>
        </Card>

        <Dialog open={isPaymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>Proses Pembayaran</DialogTitle>
              <DialogDescription>Pilih metode pembayaran dan pastikan jumlahnya sesuai dengan total belanja.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {paymentRows.map((row, index) => (
                <div key={row.id} className="grid gap-3 sm:grid-cols-12 items-end">
                  <div className="sm:col-span-3">
                    <Label>Metode</Label>
                    <Select
                      value={row.method}
                      onValueChange={(value) =>
                        updatePaymentRow(row.id, {
                          method: value as PaymentMethod,
                          dueDate: value === 'credit' ? row.dueDate : undefined,
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pilih metode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Tunai</SelectItem>
                        <SelectItem value="transfer">Transfer Bank</SelectItem>
                        <SelectItem value="ewallet">E-Wallet</SelectItem>
                        <SelectItem value="credit">Kredit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-3">
                    <Label>Jumlah</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={row.amount}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        updatePaymentRow(row.id, { amount: Number.isNaN(parsed) ? 0 : parsed });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Label>Referensi</Label>
                    <Input
                      value={row.reference ?? ''}
                      placeholder="Opsional"
                      onChange={(event) => updatePaymentRow(row.id, { reference: event.target.value })}
                    />
                  </div>
                  {row.method === 'credit' && (
                    <div className="sm:col-span-3">
                      <Label>Jatuh Tempo</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <Clock3 className="mr-2 h-4 w-4" />
                            {row.dueDate ? format(row.dueDate, 'dd MMM yyyy', { locale: id }) : 'Pilih tanggal'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={row.dueDate}
                            onSelect={(date) => updatePaymentRow(row.id, { dueDate: date ?? undefined })}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                  <div className="sm:col-span-12 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePaymentRow(row.id)}
                      disabled={paymentRows.length === 1}
                      aria-label={`Hapus metode pembayaran ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <Button type="button" variant="ghost" className="flex items-center gap-2" onClick={addPaymentRow}>
                <Plus className="h-4 w-4" /> Tambah Metode Pembayaran
              </Button>

              <div className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex justify-between"><span>Total Belanja</span><span>{formatCurrency(total)}</span></div>
                <div className={cn('flex justify-between', Math.abs(paymentDifference) > 1 ? 'text-destructive font-medium' : '')}>
                  <span>Selisih</span>
                  <span>{formatCurrency(paymentDifference)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Catatan Struk</Label>
                <Textarea
                  value={saleNote}
                  onChange={(event) => setSaleNote(event.target.value)}
                  placeholder="Catatan opsional untuk struk"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Batal
                </Button>
              </DialogClose>
              <Button type="button" onClick={submitPayment}>
                Selesaikan Pembayaran
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isParkDialogOpen} onOpenChange={setParkDialogOpen}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Parkir Transaksi</DialogTitle>
              <DialogDescription>Simpan transaksi saat ini untuk dilanjutkan di lain waktu.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nama / Catatan</Label>
                <Input
                  value={parkLabel}
                  onChange={(event) => setParkLabel(event.target.value)}
                  placeholder="Contoh: Pesanan Pak Budi"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Item, diskon, dan metode pembayaran akan disimpan sebagaimana kondisi saat ini.
              </p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">Batal</Button>
              </DialogClose>
              <Button type="button" onClick={parkCurrentTransaction}>Simpan ke Parkir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </>
  );

  if (loading) {
    return (
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full lg:h-[calc(100vh-5rem)]">
        <Card className="h-full flex flex-col shadow-none border-0 lg:col-span-2">
            <CardHeader>
                <Skeleton className="h-8 w-48" />
                <div className="flex gap-2 mt-2">
                    <Skeleton className="h-10 flex-grow" />
                    <Skeleton className="h-10 w-48" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <Skeleton key={i} className="h-24" />
                    ))}
                </div>
            </CardContent>
        </Card>
        <Card className="h-full flex flex-col shadow-none border-0 lg:col-span-1">
            <CardHeader>
                <div className="flex justify-between items-center mb-2">
                     <Skeleton className="h-8 w-32" />
                     <Skeleton className="h-6 w-16 rounded-full" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            </CardHeader>
            <CardContent className="flex-grow flex items-center justify-center">
                <div className="text-center text-muted-foreground py-10 flex flex-col items-center justify-center h-full">
                    <ShoppingCart className="h-10 w-10 mb-4 text-muted-foreground/50"/>
                    <p>Keranjang masih kosong.</p>
                    <p className="text-xs">Pilih produk untuk memulai transaksi.</p>
                </div>
            </CardContent>
             <Separator />
             <CardFooter className="flex-col !p-4 space-y-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-10 w-full" />
             </CardFooter>
        </Card>
       </div>
    );
  }

  return (
    <>
      {/* Mobile View */}
      <div className="lg:hidden">
        <Carousel setApi={setCarouselApi} className="w-full" opts={{watchDrag: false}}>
          <CarouselContent>
            <CarouselItem>
              {renderProductGrid(true)}
            </CarouselItem>
            <CarouselItem>
              {renderCartView(true)}
            </CarouselItem>
          </CarouselContent>
        </Carousel>

        {currentSlide === 0 && (
          <Button
            className="fixed bottom-4 right-4 h-16 w-16 rounded-full shadow-lg z-20"
            size="icon"
            onClick={() => carouselApi?.scrollNext()}
          >
            <ShoppingCart className="h-6 w-6" />
            <span className="sr-only">Keranjang</span>
            {cartItemCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full p-2 text-xs"
              >
                {cartItemCount}
              </Badge>
            )}
          </Button>
        )}
      </div>

      {/* Desktop View */}
      <div className="hidden lg:grid grid-cols-1 lg:grid-cols-3 gap-6 h-full lg:h-[calc(100vh-5rem)]">
        {renderProductGrid()}
        {renderCartView()}
      </div>
    </>
  );
});

KasirPage.displayName = 'KasirPage';
export default KasirPage;
