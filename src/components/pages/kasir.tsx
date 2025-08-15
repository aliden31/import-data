

'use client';

import type { FC } from 'react';
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { SaleItem, Product, Settings, FlashSale, Sale, Expense, Return, UserRole } from '@/lib/types';
import { PlusCircle, MinusCircle, Search, Calendar as CalendarIcon, ArrowLeft, ShoppingCart, Zap, Undo2, Wallet, Trash2, FileUp } from 'lucide-react';
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
import { Skeleton } from '../ui/skeleton';
import { ReturnForm } from './retur';
import { ExpenseForm } from './pengeluaran';


const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
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

  const { toast } = useToast();

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
  };

  const { subtotal, discountAmount, total } = useMemo(() => {
    const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const discountAmount = (subtotal * discount) / 100;
    const total = subtotal - discountAmount;
    return { subtotal, discountAmount, total };
  }, [cart, discount]);
  
  const handlePayment = async () => {
    if (cart.length === 0) {
      toast({
        variant: "destructive",
        title: "Keranjang Kosong",
        description: "Silakan tambahkan produk ke keranjang terlebih dahulu.",
      });
      return;
    }
    
    const itemsInCart = cart.filter(item => item.quantity > 0);

    if (itemsInCart.length === 0) {
       toast({
        variant: "destructive",
        title: "Keranjang Kosong",
        description: "Tidak ada item dengan jumlah lebih dari 0 untuk dibayar.",
      });
      return;
    }

    const subtotal = itemsInCart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const finalTotal = subtotal * (1 - discount / 100);

    const newSale = {
        items: itemsInCart,
        subtotal,
        discount,
        finalTotal: finalTotal,
        date: transactionDate,
    };

    try {
        await addSale(newSale, userRole);
        toast({
          title: "Pembayaran Berhasil",
          description: `Total pembayaran ${formatCurrency(total)} telah berhasil diproses.`,
        });
        clearCart();
        setDiscount(settings.defaultDiscount || 0);
        onDataNeedsRefresh();
    } catch (error) {
        toast({ title: "Error", description: "Gagal menyimpan transaksi.", variant: "destructive" });
        console.error(error);
    }
  }

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
            <Button className="w-full mt-4 bg-accent text-accent-foreground hover:bg-accent/90" onClick={handlePayment}>
                Bayar
            </Button>
        </CardFooter>
        </Card>
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
