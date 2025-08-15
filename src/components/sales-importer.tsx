

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { extractSales } from '@/ai/flows/extract-sales-flow';
import type { ExtractedSaleItem } from '@/ai/schemas/extract-sales-schema';
import { getProducts, addProduct, hasImportedFile, addImportedFile, addExpense } from '@/lib/data-service';
import type { Product, UserRole, SaleItem } from '@/lib/types';
import { FileQuestion, Loader2, Wand2, CheckCircle2, AlertCircle, Sparkles, FileSpreadsheet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
};

type AnalysisState = 'idle' | 'analyzing' | 'review' | 'saving' | 'error';
type AggregatedSaleItem = {
    sku: string;
    name: string;
    quantity: number;
    price: number;
    isNew: boolean;
};

interface SalesImporterProps {
    onImportComplete: (items: SaleItem[]) => void;
    userRole: UserRole;
}

export const SalesImporter: React.FC<SalesImporterProps> = ({ onImportComplete, userRole }) => {
    const [file, setFile] = useState<File | null>(null);
    const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
    const [dbProducts, setDbProducts] = useState<Product[]>([]);
    const [errorMessage, setErrorMessage] = useState('');
    const { toast } = useToast();

    // State to hold the final, processed data for review
    const [aggregatedItems, setAggregatedItems] = useState<AggregatedSaleItem[]>([]);
    const [newProducts, setNewProducts] = useState<ExtractedSaleItem[]>([]);
    const [matchedProducts, setMatchedProducts] = useState<Map<string, Product>>(new Map());
    const [uniqueOrderCount, setUniqueOrderCount] = useState(0);
    const [resiCount, setResiCount] = useState(0);


    useEffect(() => {
        const fetchDbProducts = async () => {
            const products = await getProducts();
            setDbProducts(products);
        };
        fetchDbProducts();
    }, []);

    const processExtractedItems = (items: ExtractedSaleItem[], uniqueOrderCountValue: number = 0, uniqueResiCount: number = 0) => {
        const itemsBySku = new Map<string, { totalQuantity: number; totalValue: number; name: string; originalItems: ExtractedSaleItem[] }>();
        setUniqueOrderCount(uniqueOrderCountValue);
        setResiCount(uniqueResiCount);

        // 1. Group items and aggregate quantities and values
        items.forEach(item => {
            const skuKey = item.sku; // Use SKU as the primary key
            if (!itemsBySku.has(skuKey)) {
                itemsBySku.set(skuKey, { totalQuantity: 0, totalValue: 0, name: item.name, originalItems: [] });
            }
            const existing = itemsBySku.get(skuKey)!;
            existing.totalQuantity += item.quantity;
            existing.totalValue += item.price * item.quantity;
            existing.originalItems.push(item);
        });

        // 2. Calculate final aggregated list and identify new/matched products
        const finalAggregatedItems: AggregatedSaleItem[] = [];
        const finalNewProducts = new Map<string, ExtractedSaleItem>();
        const finalMatchedProducts = new Map<string, Product>();

        for (const [skuKey, aggregatedData] of itemsBySku.entries()) {
            const { totalQuantity, totalValue, originalItems } = aggregatedData;
            // Use the name from the first item found with that SKU
            const name = originalItems[0].name;
            const averagePrice = totalQuantity > 0 ? totalValue / totalQuantity : 0;
            const representativeItem = originalItems[0];

            const dbProduct = dbProducts.find(p => p.id.toLowerCase() === skuKey.toLowerCase());
            const isNew = !dbProduct;

            if (isNew) {
                finalNewProducts.set(skuKey, representativeItem);
            } else {
                finalMatchedProducts.set(skuKey, dbProduct);
            }
            
            finalAggregatedItems.push({
                sku: skuKey,
                name,
                quantity: totalQuantity,
                price: averagePrice,
                isNew,
            });
        }
        
        // 3. Set the state
        setAggregatedItems(finalAggregatedItems);
        setNewProducts(Array.from(finalNewProducts.values()));
        setMatchedProducts(finalMatchedProducts);
        setAnalysisState('review');
    };


    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
        }
    };
    
    const handleStructuredFileParse = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet) as any[];

                const uniqueResi = new Set<string>();

                const items: ExtractedSaleItem[] = json
                    .map((row) => {
                        const sku = (row['SKU Gudang'] || row['SKU'] || '').toString().trim();
                        if (!sku) return null; // Skip rows with empty SKU
                        
                        const resiNumber = (row['Nomor Resi'] || '').toString().trim();
                        if(resiNumber) {
                            uniqueResi.add(resiNumber);
                        }
                        return {
                            name: (row['Nama SKU'] || sku).toString(),
                            sku: sku,
                            quantity: Number(row['Jumlah'] || 0),
                            price: Number(row['Harga Satuan'] || 0),
                        };
                    })
                    .filter((item): item is ExtractedSaleItem => item !== null && item.quantity > 0);


                if (items.length > 0) {
                    processExtractedItems(items, uniqueResi.size, uniqueResi.size);
                } else {
                    setErrorMessage('Format file tidak sesuai atau tidak ada data yang valid. Pastikan ada kolom "SKU Gudang" atau "SKU" dan "Jumlah".');
                    setAnalysisState('error');
                }
            } catch (err) {
                 setErrorMessage('Gagal memproses file. Pastikan formatnya benar.');
                 setAnalysisState('error');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handlePdfImageParse = (file: File) => {
         const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                try {
                    const fileDataUri = reader.result as string;
                    const existingProducts = dbProducts.map(p => ({ id: p.id, name: p.name }));
                    const result = await extractSales({ fileDataUri, products: existingProducts });
                    
                    if (result && result.sales.length > 0) {
                        const allItems = result.sales.flatMap(s => s.items);
                        // Here, uniqueOrderCount is the number of separate invoices/notes found
                        processExtractedItems(allItems, result.sales.length, 0); // No resi count from PDF/Image
                    } else {
                        setErrorMessage('AI tidak dapat menemukan data penjualan di dalam file. Coba file lain atau pastikan formatnya jelas.');
                        setAnalysisState('error');
                    }
                } catch (error) {
                    console.error('Analysis failed:', error);
                    setErrorMessage('Terjadi kesalahan saat menganalisis file. Lihat konsol untuk detail.');
                    setAnalysisState('error');
                }
            };
            reader.onerror = () => {
                 setErrorMessage('Gagal membaca file. Silakan coba lagi.');
                 setAnalysisState('error');
            };
    }

    const handleAnalyze = async () => {
        if (!file) return;

        setAnalysisState('analyzing');
        setErrorMessage('');
        
        if(file.type.includes('spreadsheetml') || file.type.includes('csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
            handleStructuredFileParse(file);
        } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
            handlePdfImageParse(file);
        } else {
            setErrorMessage('Tipe file tidak didukung. Harap unggah file Excel, CSV, PDF, atau gambar.');
            setAnalysisState('error');
        }
    };

    const handleConfirmImport = async () => {
        if (!file) return;
        setAnalysisState('saving');
        try {
            // Check if file has been imported before to prevent duplicate expense creation
            const fileAlreadyImported = await hasImportedFile(file.name);

            if (resiCount > 0 && !fileAlreadyImported) {
                const resiExpense = {
                    name: `Biaya Resi Marketplace - ${file.name}`,
                    amount: resiCount * 1250,
                    category: 'Operasional', // Or a more specific category if available
                    date: new Date(),
                    subcategory: 'Biaya Pengiriman'
                };
                await addExpense(resiExpense, 'sistem');
                await addImportedFile(file.name);
                toast({
                    title: 'Pengeluaran Resi Dibuat',
                    description: `Otomatis membuat pengeluaran untuk ${resiCount} resi sebesar ${formatCurrency(resiExpense.amount)}.`,
                });
            } else if (resiCount > 0 && fileAlreadyImported) {
                 toast({
                    title: 'Pengeluaran Dilewati',
                    description: `Pengeluaran untuk file ini sudah pernah dibuat sebelumnya.`,
                    variant: 'default',
                });
            }

            const newProductIds = new Map<string, string>();
            let updatedDbProducts = [...dbProducts];

            // 1. Create new products
            for (const newProd of newProducts) {
                const productData = {
                    name: newProd.sku, // Use SKU as the name for new products
                    sellingPrice: newProd.price,
                    costPrice: 0,
                    stock: 0,
                    category: 'Impor',
                };
                const createdProduct = await addProduct(productData, userRole);
                newProductIds.set(newProd.sku, createdProduct.id);
                updatedDbProducts.push(createdProduct);
            }

            // 2. Construct SaleItem[] for the cart
            const cartItems = aggregatedItems.map(item => {
                const dbProduct = matchedProducts.get(item.sku);
                const newProductId = newProductIds.get(item.sku);
                const finalProductId = dbProduct?.id || newProductId;

                if (!finalProductId) return null;

                const productInfo = updatedDbProducts.find(p => p.id === finalProductId);

                if (!productInfo) return null;

                return {
                    product: {
                        id: productInfo.id,
                        name: productInfo.name,
                        category: productInfo.category,
                        subcategory: productInfo.subcategory,
                        costPrice: productInfo.costPrice,
                    },
                    quantity: item.quantity,
                    price: item.price,
                    costPriceAtSale: productInfo.costPrice,
                };
            }).filter((i): i is NonNullable<typeof i> => i !== null);
            
            onImportComplete(cartItems);

        } catch (error) {
            console.error('Import failed:', error);
            toast({
                title: 'Impor Gagal',
                description: 'Terjadi kesalahan saat menyimpan data. Perubahan telah dibatalkan.',
                variant: 'destructive',
            });
            setAnalysisState('review');
        }
    };


    const renderIdleState = () => (
        <div className="text-center py-10 px-6">
            <FileQuestion className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">Impor Penjualan dari File</h3>
            <p className="mt-2 text-sm text-muted-foreground">Unggah file Excel, CSV, PDF, atau gambar (JPG, PNG). AI akan digunakan untuk PDF/gambar.</p>
            <div className="mt-6">
                 <Input id="file-upload" type="file" onChange={handleFileChange} accept=".csv,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" />
            </div>
        </div>
    );
    
    const renderAnalyzingState = () => (
        <div className="text-center py-20">
            <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin" />
            <h3 className="mt-4 text-lg font-medium">Memproses File...</h3>
            <p className="mt-2 text-sm text-muted-foreground">Harap tunggu, sistem sedang membaca dan mengekstrak data dari file Anda. Ini mungkin memakan waktu sejenak.</p>
        </div>
    );
    
    const ReviewState = () => {
        const totalQuantity = useMemo(() => aggregatedItems.reduce((sum, item) => sum + item.quantity, 0), [aggregatedItems]);
        const uniqueMatchedProducts = useMemo(() => {
            const unique = new Set<Product>();
            matchedProducts.forEach(p => unique.add(p));
            return Array.from(unique);
        }, [matchedProducts]);


        return (
            <div className="space-y-4">
                 <Alert>
                    <Sparkles className="h-4 w-4" />
                    <AlertTitle>Hasil Analisis</AlertTitle>
                    <AlertDescription>
                        Sistem berhasil mengekstrak total <span className="font-bold">{totalQuantity} item</span> dari <span className="font-bold">{aggregatedItems.length} jenis produk</span>.
                        {resiCount > 0 && ` Ditemukan <span className="font-bold">${resiCount} resi</span> yang unik.`}
                        Harap tinjau data di bawah ini. Produk baru akan dibuat untuk item yang tidak dikenali.
                    </AlertDescription>
                </Alert>
                
                <div className="grid md:grid-cols-2 gap-4">
                     <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center"><CheckCircle2 className="h-4 w-4 mr-2 text-green-500"/> Produk Dikenali</CardTitle>
                        </CardHeader>
                        <CardContent>
                           {uniqueMatchedProducts.length > 0 ? (
                               <ul className="text-sm space-y-1">
                                   {uniqueMatchedProducts.map(p => <li key={p.id}>{p.name}</li>)}
                               </ul>
                           ) : <p className="text-sm text-muted-foreground">Tidak ada produk yang cocok.</p>}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center"><AlertCircle className="h-4 w-4 mr-2 text-amber-500"/>Produk Baru Akan Dibuat</CardTitle>
                        </CardHeader>
                        <CardContent>
                           {newProducts.length > 0 ? (
                                <ul className="text-sm space-y-1">
                                   {newProducts.map(p => <li key={p.sku}>{p.name}</li>)}
                               </ul>
                           ) : <p className="text-sm text-muted-foreground">Semua produk dikenali.</p>}
                        </CardContent>
                    </Card>
                </div>

                <ScrollArea className="h-64 border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nama Produk</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead className="text-right">Jumlah</TableHead>
                                <TableHead className="text-right">Harga Jual (Rata-rata)</TableHead>
                                <TableHead className="text-right">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {aggregatedItems.map((item, index) => (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell className="text-muted-foreground">{item.sku}</TableCell>
                                    <TableCell className="text-right">{item.quantity}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(item.price)}</TableCell>
                                    <TableCell className="text-right">
                                        <Badge variant={item.isNew ? "secondary" : "default"}>{item.isNew ? "Baru" : "OK"}</Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </div>
        );
    }
    
    const renderErrorState = () => (
         <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Analisis Gagal</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
    );

    const getAnalysisButton = () => {
        const fileType = file?.type;
        const fileName = file?.name || '';
        if(fileType?.includes('spreadsheetml') || fileType?.includes('csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
            return <><FileSpreadsheet className="mr-2 h-4 w-4"/>Proses File</>
        }
        return <><Wand2 className="mr-2 h-4 w-4"/>Analisis dengan AI</>
    }

    return (
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Impor Penjualan dari File</DialogTitle>
                <DialogDescription>
                    Unggah file Excel/CSV (disarankan untuk akurasi) atau PDF/gambar untuk dianalisis oleh AI.
                </DialogDescription>
            </DialogHeader>
            
            <div className="py-4">
                {analysisState === 'idle' && renderIdleState()}
                {analysisState === 'analyzing' && renderAnalyzingState()}
                {analysisState === 'review' && <ReviewState />}
                {analysisState === 'error' && renderErrorState()}
            </div>

            <DialogFooter>
                {analysisState === 'analyzing' ? (
                    <Button disabled>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sedang Menganalisis...
                    </Button>
                ) : analysisState === 'review' || analysisState === 'saving' ? (
                    <>
                        <Button variant="secondary" onClick={() => { setAnalysisState('idle'); setFile(null); setAggregatedItems([]); }}>Analisis Ulang</Button>
                        <Button onClick={handleConfirmImport} disabled={analysisState === 'saving'}>
                            {analysisState === 'saving' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Konfirmasi & Impor ke Keranjang
                        </Button>
                    </>
                ) : (
                    <>
                        <DialogClose asChild>
                            <Button variant="secondary">Batal</Button>
                        </DialogClose>
                        <Button onClick={handleAnalyze} disabled={!file}>
                            {getAnalysisButton()}
                        </Button>
                    </>
                )}
            </DialogFooter>
        </DialogContent>
    );
};
