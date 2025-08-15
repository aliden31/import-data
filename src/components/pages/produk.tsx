

'use client';

import type { FC } from 'react';
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import type { Product, Sale, Settings, UserRole } from '@/lib/types';
import { PlusCircle, Edit, Trash2, MoreHorizontal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getProducts, addProduct, updateProduct, deleteProduct, getSales } from '@/lib/data-service';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ProdukPageProps {
    onDataChange: () => void;
    userRole: UserRole;
}

const ProductForm = ({ product, onSave, onOpenChange }: { product?: Product, onSave: (product: Product | Omit<Product, 'id'>) => Promise<void>, onOpenChange: (open: boolean) => void }) => {
    const [name, setName] = useState('');
    const [costPrice, setCostPrice] = useState<number | ''>('');
    const [sellingPrice, setSellingPrice] = useState<number | ''>('');
    const [stock, setStock] = useState<number | ''>('');
    const [category, setCategory] = useState('');
    const [subcategory, setSubcategory] = useState('');
    const [isSaving, setIsSaving] = useState(false);


    useEffect(() => {
        if (product) {
            setName(product.name || '');
            setCostPrice(product.costPrice ?? '');
            setSellingPrice(product.sellingPrice ?? '');
            setStock(product.stock ?? '');
            setCategory(product.category || '');
            setSubcategory(product.subcategory || '');
        } else {
            setName('');
            setCostPrice('');
            setSellingPrice('');
            setStock('');
            setCategory('');
            setSubcategory('');
        }
    }, [product]);
    

    const handleSubmit = async () => {
        if (!name || !category) {
            toast({ title: "Error", description: "Nama produk dan kategori wajib diisi.", variant: "destructive"});
            return;
        }
        setIsSaving(true);
        const productData = {
            name,
            costPrice: Number(costPrice) || 0,
            sellingPrice: Number(sellingPrice) || 0,
            stock: Number(stock) || 0,
            category,
            subcategory,
        };

        try {
            if (product?.id) {
                await onSave({ id: product.id, ...productData });
            } else {
                await onSave(productData);
            }
            onOpenChange(false);
        } finally {
            setIsSaving(false);
        }
    };
    
    const { toast } = useToast();

    return (
        <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
                <DialogTitle>{product ? 'Edit Produk' : 'Tambah Produk Baru'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">Nama</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" />
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="category" className="text-right">Kategori</Label>
                    <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="col-span-3" placeholder="Contoh: Makanan, Minuman" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="subcategory" className="text-right">Sub-Kategori</Label>
                    <Input id="subcategory" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} className="col-span-3" placeholder="Opsional. Contoh: Panas, Dingin"/>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="costPrice" className="text-right">Harga Modal</Label>
                    <Input id="costPrice" type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))} className="col-span-3" placeholder="0"/>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="sellingPrice" className="text-right">Harga Jual</Label>
                    <Input id="sellingPrice" type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value === '' ? '' : Number(e.target.value))} className="col-span-3" placeholder="0"/>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="stock" className="text-right">Stok</Label>
                    <Input id="stock" type="number" value={stock} onChange={(e) => setStock(e.target.value === '' ? '' : Number(e.target.value))} className="col-span-3" placeholder="0"/>
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="secondary" disabled={isSaving}>Batal</Button>
                </DialogClose>
                <Button onClick={handleSubmit} disabled={isSaving}>
                    {isSaving ? 'Menyimpan...' : 'Simpan'}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}

const ProdukPage: FC<ProdukPageProps> = React.memo(({ onDataChange, userRole }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined);
  const { toast } = useToast();
  const [sortOrder, setSortOrder] = useState('nama-az');

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const productsDataPromise = getProducts();
            const salesDataPromise = getSales();

            const [productsData, salesData] = await Promise.all([productsDataPromise, salesDataPromise]);

            setProducts(productsData);
            setSales(salesData);
        } catch (error) {
            toast({ title: "Error", description: "Gagal memuat data.", variant: "destructive" });
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

  useEffect(() => {
    fetchInitialData();
  }, [userRole]);
  
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
                return (b.salesCount || 0) - (a.salesCount || 0);
            case 'nama-az':
                return a.name.localeCompare(b.name);
            case 'nama-za':
                return b.name.localeCompare(a.name);
            case 'stok-terbanyak':
                return b.stock - a.stock;
            case 'stok-tersedikit':
                return a.stock - b.stock;
            case 'harga-terendah':
                return a.sellingPrice - b.sellingPrice;
            case 'harga-tertinggi':
                return b.sellingPrice - a.sellingPrice;
            default:
                return 0;
        }
    });
  }, [products, sales, sortOrder]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
  };
  
  const handleSaveProduct = async (productData: Product | Omit<Product, 'id'>) => {
    try {
        if ('id' in productData) {
            await updateProduct(productData.id, productData as Product, userRole);
            toast({ title: "Produk diperbarui", description: `${productData.name} telah berhasil diperbarui.` });
        } else {
            await addProduct(productData, userRole);
            toast({ title: "Produk ditambahkan", description: `Produk baru telah berhasil ditambahkan.` });
        }
        await fetchInitialData();
        onDataChange();
    } catch (error) {
        toast({ title: "Error", description: "Gagal menyimpan produk.", variant: "destructive" });
        console.error(error);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
        await deleteProduct(productId, userRole);
        setProducts(prev => prev.filter(p => p.id !== productId));
        toast({
            title: "Produk Dihapus",
            description: "Produk telah berhasil dihapus dari daftar.",
        });
        onDataChange();
    } catch (error) {
        toast({ title: "Error", description: "Gagal menghapus produk.", variant: "destructive" });
        console.error(error);
    }
  }

  const handleOpenForm = (product?: Product) => {
      if (product) {
        setEditingProduct(product);
      } else {
        setEditingProduct(undefined);
      }
      setFormOpen(true);
  }

  if (loading) {
    return <div>Memuat data produk...</div>
  }

  return (
    <div className="space-y-6">
       <Dialog open={isFormOpen} onOpenChange={(isOpen) => { setFormOpen(isOpen); if (!isOpen) setEditingProduct(undefined); }}>
            <ProductForm product={editingProduct} onSave={handleSaveProduct} onOpenChange={setFormOpen} />
       </Dialog>

      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold">Manajemen Produk</h1>
            <p className="text-muted-foreground">Kelola daftar produk, stok, dan harga Anda.</p>
        </div>
        <Button onClick={() => handleOpenForm()} className="w-full md:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" />
            Tambah Produk
        </Button>
      </div>
      
      <Card>
        <CardHeader>
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <CardTitle>Daftar Produk</CardTitle>
                    <CardDescription>Total {products.length} produk ditemukan.</CardDescription>
                </div>
                 <Select value={sortOrder} onValueChange={setSortOrder}>
                    <SelectTrigger className="w-full md:w-[180px]">
                        <SelectValue placeholder="Urutkan berdasarkan" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="terlaris">Terlaris</SelectItem>
                        <SelectItem value="nama-az">Nama A-Z</SelectItem>
                        <SelectItem value="nama-za">Nama Z-A</SelectItem>
                        <SelectItem value="stok-terbanyak">Stok Terbanyak</SelectItem>
                        <SelectItem value="stok-tersedikit">Stok Tersedikit</SelectItem>
                        <SelectItem value="harga-terendah">Harga Terendah</SelectItem>
                        <SelectItem value="harga-tertinggi">Harga Tertinggi</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Nama Produk</TableHead>
                        <TableHead>SKU Gudang</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-right">Harga Modal</TableHead>
                        <TableHead className="text-right">Harga Jual</TableHead>
                        <TableHead className="text-right">Stok</TableHead>
                        <TableHead className="text-right">Terjual</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {sortedProducts.map((product) => (
                        <TableRow key={product.id}>
                        <TableCell
                            className="font-medium cursor-pointer hover:underline"
                            onClick={() => handleOpenForm(product)}
                        >
                            {product.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{product.id}</TableCell>
                        <TableCell>
                            {product.category}
                            {product.subcategory && <span className="text-muted-foreground text-xs"> / {product.subcategory}</span>}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(product.costPrice)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(product.sellingPrice)}</TableCell>
                        <TableCell className="text-right">{product.stock}</TableCell>
                        <TableCell className="text-right font-medium">{product.salesCount || 0}</TableCell>
                        <TableCell className="text-right">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                        <span className="sr-only">Buka menu</span>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Aksi</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleOpenForm(product)}>
                                        <Edit className="mr-2 h-4 w-4" />
                                        <span>Edit</span>
                                    </DropdownMenuItem>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                                                 <Trash2 className="mr-2 h-4 w-4" />
                                                 <span>Hapus</span>
                                            </DropdownMenuItem>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                            <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Tindakan ini tidak dapat diurungkan. Ini akan menghapus produk <span className="font-semibold">{product.name}</span> secara permanen dari database.
                                            </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                            <AlertDialogCancel>Batal</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteProduct(product.id)} className="bg-destructive hover:bg-destructive/90">Hapus</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
    </div>
  );
});

ProdukPage.displayName = 'ProdukPage';
export default ProdukPage;

    
