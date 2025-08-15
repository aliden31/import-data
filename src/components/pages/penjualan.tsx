

'use client';

import type { FC } from 'react';
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import type { Sale, Product, SaleItem, UserRole } from '@/lib/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getSales, getProducts, updateSale, deleteSale, batchDeleteSales } from '@/lib/data-service';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Edit, Loader2, MinusCircle, PlusCircle, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, isWithinInterval, startOfDay, endOfDay, subDays } from 'date-fns';
import { id } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { Checkbox } from '../ui/checkbox';


const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
};

const EditSaleForm = ({ sale, onSave, onOpenChange, userRole }: { sale: Sale, onSave: () => void, onOpenChange: (open: boolean) => void, userRole: UserRole }) => {
    const [editedSale, setEditedSale] = useState<Sale | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const saleCopy = JSON.parse(JSON.stringify(sale));
        saleCopy.date = new Date(saleCopy.date);
        setEditedSale(saleCopy);
    }, [sale]);

    const updateItemQuantity = (productId: string, newQuantity: number) => {
        if (!editedSale) return;

        let updatedItems = editedSale.items.map(item =>
            item.product.id === productId ? { ...item, quantity: newQuantity } : item
        );

        updatedItems = updatedItems.filter(item => item.quantity > 0);
        
        recalculateTotals(updatedItems, editedSale.discount, editedSale.date);
    };

    const updateItemPrice = (productId: string, newPrice: number) => {
        if (!editedSale) return;

        const updatedItems = editedSale.items.map(item =>
            item.product.id === productId ? { ...item, price: newPrice } : item
        );
        
        recalculateTotals(updatedItems, editedSale.discount, editedSale.date);
    };


    const handleDiscountChange = (newDiscount: number) => {
        if (!editedSale) return;
        if (newDiscount < 0) newDiscount = 0;
        if (newDiscount > 100) newDiscount = 100;
        recalculateTotals(editedSale.items, newDiscount, editedSale.date);
    };

    const handleDateChange = (newDate: Date | undefined) => {
        if (!editedSale || !newDate) return;
        recalculateTotals(editedSale.items, editedSale.discount, newDate);
    }

    const recalculateTotals = (items: SaleItem[], discount: number, date: Date) => {
        const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
        const finalTotal = subtotal * (1 - discount / 100);
        setEditedSale(prev => prev ? { ...prev, items, subtotal, discount, finalTotal, date } : null);
    };
    
    const handleSubmit = async () => {
      if (!editedSale) return;
      setIsSaving(true);
      try {
        await updateSale(sale, editedSale, userRole);
        toast({ title: "Transaksi Diperbarui", description: "Perubahan pada transaksi telah disimpan." });
        onSave();
        onOpenChange(false);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Gagal memperbarui transaksi.";
        toast({ title: "Error", description: errorMessage, variant: "destructive" });
      } finally {
        setIsSaving(false);
      }
    };

    if (!editedSale) return null;

    return (
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>Edit Transaksi (trx {String(sale.displayId).padStart(4, '0')})</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                 <ScrollArea className="h-64">
                    <div className="space-y-4 pr-6">
                        {editedSale.items.map((item) => (
                             <div key={item.product.id} className="flex items-center gap-4">
                                <div className="flex-grow">
                                    <p className="font-semibold text-sm">{item.product.name}</p>
                                    <Input
                                        type="number"
                                        value={item.price}
                                        onChange={(e) => updateItemPrice(item.product.id, parseInt(e.target.value) || 0)}
                                        className="w-28 h-8 text-xs"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                     <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateItemQuantity(item.product.id, item.quantity - 1)}>
                                        <MinusCircle className="h-4 w-4" />
                                    </Button>
                                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                                     <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateItemQuantity(item.product.id, item.quantity + 1)}>
                                        <PlusCircle className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="font-semibold text-sm w-24 text-right">{formatCurrency(item.price * item.quantity)}</p>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => updateItemQuantity(item.product.id, 0)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
                <Separator />
                <div className="w-full space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                        <Label htmlFor="transactionDate">Tanggal Transaksi</Label>
                         <Popover>
                            <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className="w-[180px] justify-start text-left font-normal h-8"
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {format(editedSale.date, "PPP", { locale: id })}
                            </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={editedSale.date}
                                onSelect={handleDateChange}
                                initialFocus
                            />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>{formatCurrency(editedSale.subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <Label htmlFor="discount">Diskon (%)</Label>
                        <Input 
                            id="discount"
                            type="number"
                            value={editedSale.discount}
                            onChange={(e) => handleDiscountChange(parseFloat(e.target.value) || 0)}
                            className="w-24 h-8 text-sm"
                            step="0.1"
                            min="0"
                            max="100"
                        />
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                        <span>Potongan Diskon</span>
                        <span>-{formatCurrency(editedSale.subtotal * editedSale.discount / 100)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-bold text-base">
                        <span>Total</span>
                        <span>{formatCurrency(editedSale.finalTotal)}</span>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="secondary" disabled={isSaving}>Batal</Button>
                </DialogClose>
                <Button onClick={handleSubmit} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Simpan Perubahan'}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}


const SalesChart = ({ sales, products }: { sales: Sale[], products: Product[] }) => {
    const salesByItem = useMemo(() => {
        const itemMap: Record<string, { name: string, quantity: number }> = {};
        
        products.forEach(p => {
            itemMap[p.id] = { name: p.name, quantity: 0 };
        });

        sales.flatMap(sale => sale.items).forEach(item => {
            if (item.product) {
                const productId = item.product.id;
                if (itemMap[productId]) {
                    itemMap[productId].quantity += item.quantity;
                }
            }
        });

        return Object.values(itemMap)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);

    }, [sales, products]);


    return (
        <Card>
            <CardHeader>
                <CardTitle>10 Item Terlaris</CardTitle>
                <CardDescription>Grafik penjualan produk terbanyak dalam periode terpilih.</CardDescription>
            </CardHeader>
            <CardContent>
                {salesByItem.filter(item => item.quantity > 0).length > 0 ? (
                    <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={salesByItem} layout="vertical">
                            <XAxis type="number" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                            <YAxis type="category" dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} width={120} />
                            <Tooltip
                                cursor={{ fill: 'hsl(var(--muted))' }}
                                contentStyle={{
                                    background: "hsl(var(--background))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "var(--radius)",
                                }}
                                formatter={(value: number) => [value, "Jumlah Terjual"]}
                            />
                            <Bar dataKey="quantity" fill="hsl(var(--primary))" name="Jumlah Terjual" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                        Tidak ada penjualan pada periode ini.
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

interface PenjualanPageProps {
    onDataChange: () => void;
    userRole: UserRole;
}


const PenjualanPage: FC<PenjualanPageProps> = React.memo(({ onDataChange, userRole }) => {
    const [sales, setSales] = useState<Sale[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingSale, setEditingSale] = useState<Sale | null>(null);
    const { toast } = useToast();
    const [date, setDate] = React.useState<DateRange | undefined>({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        to: new Date(),
    });
    const [selectedSales, setSelectedSales] = useState<Record<string, boolean>>({});
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchSalesData = async () => {
        setLoading(true);
        try {
            const [salesData, productsData] = await Promise.all([getSales(), getProducts()]);
            const salesWithDisplayId = salesData
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((sale, index) => ({
                    ...sale,
                    displayId: index + 1,
                    date: new Date(sale.date), 
                    items: sale.items.map((item: any) => ({
                        ...item,
                        product: item.product || { id: 'unknown', name: 'Produk Dihapus', costPrice: 0, sellingPrice: 0, stock: 0, category: 'Lainnya' }
                    }))
                }));
            setSales(salesWithDisplayId.sort((a, b) => b.date.getTime() - a.date.getTime()));
            setProducts(productsData);
        } catch (error) {
            toast({ title: "Error", description: "Gagal memuat data penjualan.", variant: "destructive" });
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchSalesData();
    }, []);
    
    const filteredSales = useMemo(() => {
        if (!date?.from) return sales;
        const toDate = date.to ? endOfDay(date.to) : endOfDay(date.from);
        const interval = { start: startOfDay(date.from), end: toDate };
        return sales.filter(sale => isWithinInterval(new Date(sale.date), interval));
    }, [sales, date]);

    const handleSelectSale = (saleId: string, checked: boolean) => {
        setSelectedSales(prev => ({
            ...prev,
            [saleId]: checked
        }));
    };

    const selectedSaleIds = useMemo(() => Object.keys(selectedSales).filter(id => selectedSales[id]), [selectedSales]);

    const handleSelectAll = (checked: boolean) => {
        const newSelected: Record<string, boolean> = {};
        if (checked) {
            filteredSales.forEach(sale => {
                newSelected[sale.id] = true;
            });
        }
        setSelectedSales(newSelected);
    };

    const handleBatchDelete = async () => {
        setIsDeleting(true);
        const salesToDelete = sales.filter(s => selectedSaleIds.includes(s.id));
        try {
            await batchDeleteSales(salesToDelete, userRole);
            toast({
                title: "Hapus Massal Berhasil",
                description: `${salesToDelete.length} transaksi telah dihapus.`,
            });
            handleSave(); // refetches all data
            setSelectedSales({});
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Gagal menghapus transaksi secara massal.";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setIsDeleting(false);
        }
    };


    const handleEditClick = (sale: Sale) => {
      setEditingSale(sale);
    };
    
    const handleDeleteClick = async (sale: Sale) => {
        try {
            await deleteSale(sale, userRole);
            toast({
                title: "Transaksi Dihapus",
                description: `Transaksi (trx ${String(sale.displayId).padStart(4, '0')}) telah dihapus.`,
            });
            handleSave();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Gagal menghapus transaksi.";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };
    
    const handleSave = () => {
        fetchSalesData();
        onDataChange();
    };

    const handleDatePreset = (days: number) => {
        setDate({ from: subDays(new Date(), days - 1), to: new Date() });
    }

    if (loading) {
        return <div>Memuat data penjualan...</div>
    }

  return (
    <div className="space-y-6">
       <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
            <div>
              <h1 className="text-2xl font-bold">Riwayat Penjualan</h1>
              <p className="text-muted-foreground">Analisis riwayat penjualan dalam rentang waktu tertentu.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button variant="outline" size="sm" onClick={() => handleDatePreset(14)}>14 Hari</Button>
                <Button variant="outline" size="sm" onClick={() => handleDatePreset(30)}>1 Bulan Terakhir</Button>
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        className="w-full sm:w-[260px] justify-start text-left font-normal"
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date?.from ? (
                        date.to ? (
                            <>
                            {format(date.from, "LLL dd, y")} -{" "}
                            {format(date.to, "LLL dd, y")}
                            </>
                        ) : (
                            format(date.from, "LLL dd, y")
                        )
                        ) : (
                        <span>Pilih rentang tanggal</span>
                        )}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={setDate}
                        numberOfMonths={2}
                    />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
      {editingSale && (
        <Dialog open={!!editingSale} onOpenChange={(open) => !open && setEditingSale(null)}>
            <EditSaleForm sale={editingSale} onSave={handleSave} onOpenChange={(open) => !open && setEditingSale(null)} userRole={userRole}/>
        </Dialog>
      )}

      <Tabs defaultValue="riwayat">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="riwayat">Riwayat Transaksi</TabsTrigger>
          <TabsTrigger value="diagram">Diagram Penjualan</TabsTrigger>
        </TabsList>
        <TabsContent value="riwayat" className="mt-4">
             <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Daftar Transaksi</CardTitle>
                            <CardDescription>
                                Menampilkan {filteredSales.length} transaksi untuk periode yang dipilih.
                            </CardDescription>
                        </div>
                        {selectedSaleIds.length > 0 && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={isDeleting}>
                                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                    Hapus Terpilih ({selectedSaleIds.length})
                                </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Hapus {selectedSaleIds.length} Transaksi?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Tindakan ini akan menghapus semua transaksi yang dipilih secara permanen. Stok produk akan dikembalikan. Aksi ini tidak dapat diurungkan.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Batal</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleBatchDelete} className="bg-destructive hover:bg-destructive/90">
                                        Ya, Hapus
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                     <div className="flex items-center gap-2 p-4 border-b">
                        <Checkbox
                            id="select-all"
                            checked={filteredSales.length > 0 && selectedSaleIds.length === filteredSales.length}
                            onCheckedChange={(checked) => handleSelectAll(!!checked)}
                            aria-label="Pilih semua item"
                        />
                        <Label htmlFor="select-all" className="text-sm font-medium">Pilih Semua</Label>
                    </div>
                    <Accordion type="single" collapsible className="w-full">
                        {filteredSales.length > 0 ? filteredSales.map((sale: Sale) => {
                            const totalCost = sale.items.reduce((acc, item) => acc + (item.costPriceAtSale * item.quantity), 0);
                            const profit = sale.finalTotal - totalCost;

                            return (
                            <AccordionItem value={sale.id} key={sale.id}>
                                <div className="flex items-center w-full pr-4 text-sm">
                                    <Checkbox
                                        id={`select-${sale.id}`}
                                        className="ml-4"
                                        checked={!!selectedSales[sale.id]}
                                        onCheckedChange={(checked) => handleSelectSale(sale.id, !!checked)}
                                    />
                                    <AccordionTrigger className="flex-1">
                                        <div className="flex justify-between items-center w-full pl-4">
                                            <span className="font-semibold text-primary">ID: trx {String(sale.displayId).padStart(4, '0')}</span>
                                            <Badge variant="outline">{new Date(sale.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</Badge>
                                            <span className="font-bold text-base">{formatCurrency(sale.finalTotal)}</span>
                                        </div>
                                    </AccordionTrigger>
                                </div>
                                <AccordionContent>
                                <div className="p-4 bg-muted/50 rounded-md">
                                    <div className="flow-root">
                                        <dl className="-my-3 divide-y divide-border text-sm">
                                        {sale.items.map((item, itemIndex) => (
                                            <div key={itemIndex} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3 sm:gap-4">
                                                <dt className="font-medium text-foreground">{item.product?.name || 'Produk Dihapus'}</dt>
                                                <dd className="text-muted-foreground sm:col-span-2 sm:text-right">{item.quantity} x {formatCurrency(item.price)} = <span className="font-medium text-foreground">{formatCurrency(item.price * item.quantity)}</span></dd>
                                            </div>
                                        ))}
                                        </dl>
                                    </div>
                                    <Separator className="my-4"/>
                                    <div className="flex justify-between items-end">
                                        <div className="text-right space-y-1 text-sm flex-grow">
                                            <p>Subtotal: <span className="font-medium">{formatCurrency(sale.subtotal)}</span></p>
                                            <p>Diskon: <span className="font-medium">{sale.discount}% (-{formatCurrency(sale.subtotal * sale.discount / 100)})</span></p>
                                            <p className="font-bold text-base pt-2 mt-2 border-t">Total Akhir: <span className="text-primary">{formatCurrency(sale.finalTotal)}</span></p>
                                            <p className="text-sm font-semibold">Perkiraan Laba: <span className={profit >= 0 ? 'text-green-600' : 'text-destructive'}>{formatCurrency(profit)}</span></p>
                                        </div>
                                         <div className="flex gap-2">
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="sm">
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Hapus
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Tindakan ini akan menghapus transaksi (trx {String(sale.displayId).padStart(4, '0')}) secara permanen.
                                                            Stok produk yang terjual akan dikembalikan. Tindakan ini tidak dapat diurungkan.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Batal</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteClick(sale)} className="bg-destructive hover:bg-destructive/90">
                                                            Ya, Hapus
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                            <Button variant="outline" size="sm" onClick={() => handleEditClick(sale)}>
                                                <Edit className="mr-2 h-4 w-4" />
                                                Edit
                                            </Button>
                                         </div>
                                    </div>
                                </div>
                                </AccordionContent>
                            </AccordionItem>
                        )
                        }) : (
                            <div className="text-center text-muted-foreground py-10">
                                <p>Tidak ada riwayat penjualan pada periode ini.</p>
                            </div>
                        )}
                    </Accordion>
                </CardContent>
             </Card>
        </TabsContent>
        <TabsContent value="diagram" className="mt-4">
            <SalesChart sales={filteredSales} products={products} />
        </TabsContent>
      </Tabs>
    </div>
  );
});

PenjualanPage.displayName = 'PenjualanPage';
export default PenjualanPage;

    
