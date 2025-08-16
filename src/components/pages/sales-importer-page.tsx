

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { extractSales } from '@/ai/flows/extract-sales-flow';
import type { ExtractedSale, ExtractedSaleItem } from '@/ai/schemas/extract-sales-schema';
import { getProducts, addProduct, hasImportedFile, addImportedFile, addExpense, getSkuMappings, saveSkuMapping, batchAddSales, getPublicSettings } from '@/lib/data-service';
import type { Product, UserRole, SaleItem, SkuMapping, PublicSettings, Sale } from '@/lib/types';
import { FileQuestion, Loader2, Wand2, CheckCircle2, AlertCircle, Sparkles, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useRouter } from 'next/navigation';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
};

const CREATE_NEW_PRODUCT_VALUE = 'CREATE_NEW_PRODUCT';
type AnalysisState = 'idle' | 'analyzing' | 'review' | 'saving' | 'error' | 'success';
type AggregatedSaleItem = {
    sku: string;
    name: string;
    quantity: number;
    price: number;
    isNew: boolean;
};

interface SalesImporterPageProps {
    onImportComplete: () => void;
    userRole: UserRole;
}

const SalesImporterPage: React.FC<SalesImporterPageProps> = ({ onImportComplete, userRole }) => {
    const [file, setFile] = useState<File | null>(null);
    const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
    const [dbProducts, setDbProducts] = useState<Product[]>([]);
    const [dbSkuMappings, setDbSkuMappings] = useState<SkuMapping[]>([]);
    const [publicSettings, setPublicSettings] = useState<PublicSettings>({ defaultDiscount: 0 });
    const [errorMessage, setErrorMessage] = useState('');
    const { toast } = useToast();

    // Data from analysis
    const [aggregatedItems, setAggregatedItems] = useState<AggregatedSaleItem[]>([]);
    const [unrecognizedItems, setUnrecognizedItems] = useState<AggregatedSaleItem[]>([]);
    const [productMappings, setProductMappings] = useState<Record<string, string>>({});
    const [salesToCreate, setSalesToCreate] = useState<Omit<Sale, 'id' | 'displayId'>[]>([]);

    const isMappingComplete = useMemo(() => {
      return unrecognizedItems.every(item => productMappings[item.sku]);
    }, [unrecognizedItems, productMappings]);

    useEffect(() => {
        const fetchInitialData = async () => {
            const products = await getProducts();
            const mappings = await getSkuMappings();
            const settings = await getPublicSettings();
            setDbProducts(products);
            setDbSkuMappings(mappings);
            setPublicSettings(settings);
        };
        fetchInitialData();
    }, []);

    const processExtractedSales = (sales: ExtractedSale[]) => {
        const allItems = sales.flatMap(s => s.items);
        const itemsBySku = new Map<string, { totalQuantity: number; lastPrice: number; name: string }>();

        allItems.forEach(item => {
            const skuKey = (item.sku || '').trim();
            if (!skuKey) return; 

            if (!itemsBySku.has(skuKey)) {
                itemsBySku.set(skuKey, { totalQuantity: 0, lastPrice: item.price, name: item.name });
            }
            const existing = itemsBySku.get(skuKey)!;
            existing.totalQuantity += item.quantity;
            existing.lastPrice = item.price;
        });

        const finalAggregatedItems: AggregatedSaleItem[] = [];
        const finalUnrecognizedItems: AggregatedSaleItem[] = [];
        const initialMappings: Record<string, string> = {};

        for (const [skuKey, aggregatedData] of itemsBySku.entries()) {
            const { totalQuantity, lastPrice, name } = aggregatedData;
            const dbProduct = dbProducts.find(p => p.id.toLowerCase() === skuKey.toLowerCase());
            const existingMapping = dbSkuMappings.find(m => m.importSku.toLowerCase() === skuKey.toLowerCase());
            
            const isNew = !dbProduct;

            const aggregatedItem: AggregatedSaleItem = {
                sku: skuKey,
                name,
                quantity: totalQuantity,
                price: lastPrice,
                isNew,
            };

            if (isNew) {
                if (existingMapping) {
                    initialMappings[skuKey] = existingMapping.mappedProductId;
                }
                finalUnrecognizedItems.push(aggregatedItem);
            }
            
            finalAggregatedItems.push(aggregatedItem);
        }
        
        const finalSalesToCreate: Omit<Sale, 'id'>[] = sales.map(sale => {
            const subtotal = sale.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            const discount = publicSettings.defaultDiscount || 0;
            const finalTotal = subtotal * (1 - discount / 100);
            return {
                items: sale.items.map(item => ({
                    ...item,
                    product: { id: '', name: item.name, category: '', costPrice: 0 },
                    costPriceAtSale: 0
                })),
                date: new Date(),
                subtotal: subtotal,
                discount: discount,
                finalTotal: finalTotal,
            };
        });

        setSalesToCreate(finalSalesToCreate);
        setProductMappings(initialMappings);
        setAggregatedItems(finalAggregatedItems.sort((a,b) => a.name.localeCompare(b.name)));
        setUnrecognizedItems(finalUnrecognizedItems);
        setAnalysisState('review');
    };


    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
             setAnalysisState('idle');
             setErrorMessage('');
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

                const orders = new Map<string, ExtractedSale>();

                json.forEach((row, index) => {
                    const orderId = (row['Nomor Pesanan'] || `excel-row-${index}`).toString().trim();
                    const sku = (row['SKU Gudang'] || row['Nomor Referensi SKU'] || '').toString().trim();
                    if (!sku) return;

                    if (!orders.has(orderId)) {
                        orders.set(orderId, { items: [], total: 0 });
                    }

                    const order = orders.get(orderId)!;
                    const quantity = Number(row['Jumlah'] || 0);
                    const price = Number(row['Harga Satuan'] || 0);
                    
                    if (quantity > 0) {
                        order.items.push({
                            name: (row['Nama Produk'] || sku).toString(),
                            sku: sku,
                            quantity: quantity,
                            price: price,
                        });
                        order.total += price * quantity;
                    }
                });

                const extractedSales = Array.from(orders.values());
                if (extractedSales.length > 0) {
                    processExtractedSales(extractedSales);
                } else {
                    setErrorMessage('Format file tidak sesuai atau tidak ada data yang valid. Pastikan ada kolom "Nomor Pesanan", "SKU Gudang", "Jumlah", dan "Harga Satuan".');
                    setAnalysisState('error');
                }
            } catch (err) {
                 setErrorMessage('Gagal memproses file. Pastikan formatnya benar.');
                 setAnalysisState('error');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handlePdfImageParse = async (file: File) => {
         const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                try {
                    const result = await extractSales({ 
                        fileDataUri: reader.result as string,
                        products: dbProducts,
                    });
                    
                    if (result && result.sales.length > 0) {
                        processExtractedSales(result.sales); 
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
        
        const isExcel = file.type.includes('spreadsheetml') || file.type.includes('csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
        const isImageOrPdf = file.type.startsWith('image/') || file.type === 'application/pdf';

        if (isExcel) {
            handleStructuredFileParse(file);
        } else if (isImageOrPdf) {
            await handlePdfImageParse(file);
        } else {
            setErrorMessage('Tipe file tidak didukung. Harap unggah file Excel, CSV, PDF, atau gambar.');
            setAnalysisState('error');
        }
    };

    const handleConfirmImport = async () => {
        if (!file || salesToCreate.length === 0) return;
        setAnalysisState('saving');
        try {
            const fileAlreadyImported = await hasImportedFile(file.name);

            if (salesToCreate.length > 0 && !fileAlreadyImported) {
                const resiExpense = {
                    name: `Biaya Resi Marketplace - ${file.name}`,
                    amount: salesToCreate.length * 1250,
                    category: 'Operasional',
                    date: new Date(),
                    subcategory: 'Biaya Pengiriman'
                };
                await addExpense(resiExpense, 'sistem');
                await addImportedFile(file.name);
                toast({
                    title: 'Pengeluaran Pesanan Dibuat',
                    description: `Otomatis membuat pengeluaran untuk ${salesToCreate.length} pesanan sebesar ${formatCurrency(resiExpense.amount)}.`,
                });
            } else if (salesToCreate.length > 0 && fileAlreadyImported) {
                 toast({
                    title: 'Pengeluaran Dilewati',
                    description: `Pengeluaran untuk file ini sudah pernah dibuat sebelumnya.`,
                    variant: 'default',
                });
            }

            const newProductIds = new Map<string, string>();
            let updatedDbProducts = [...dbProducts];

            for (const item of unrecognizedItems) {
                const mappingValue = productMappings[item.sku];
                if (!mappingValue) continue;

                if (mappingValue === CREATE_NEW_PRODUCT_VALUE) {
                     const productData: Product = {
                        id: item.sku,
                        name: item.name,
                        sellingPrice: item.price,
                        costPrice: 0,
                        stock: 0,
                        category: 'Impor',
                    };
                    const createdProduct = await addProduct(productData, userRole, productData.id);
                    newProductIds.set(item.sku, createdProduct.id);
                    updatedDbProducts.push(createdProduct);
                } else {
                    const mappedProduct = dbProducts.find(p => p.id === mappingValue);
                    if (mappedProduct) {
                       await saveSkuMapping({
                           importSku: item.sku,
                           mappedProductId: mappedProduct.id,
                           mappedProductName: mappedProduct.name
                       });
                    }
                }
            }
            
            const finalSales: Omit<Sale, 'id'>[] = salesToCreate.map(sale => {
                const saleItems = sale.items.reduce((acc: SaleItem[], item: any) => {
                    let validItem: SaleItem | null = null;
                    let finalProductId: string | undefined;
                    let importSku = item.sku;
            
                    const existingProduct = updatedDbProducts.find(p => p.id.toLowerCase() === importSku.toLowerCase());
            
                    if (existingProduct) {
                        finalProductId = existingProduct.id;
                    } else {
                        const mappedId = productMappings[importSku];
                        if (mappedId && mappedId !== CREATE_NEW_PRODUCT_VALUE) {
                            finalProductId = mappedId;
                        } else if (newProductIds.has(importSku)) {
                            finalProductId = newProductIds.get(importSku);
                        }
                    }
            
                    if (finalProductId) {
                        const productInfo = updatedDbProducts.find(p => p.id === finalProductId);
                        if (productInfo) {
                            validItem = {
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
                        }
                    }

                    if (validItem) {
                        acc.push(validItem);
                    }
                    
                    return acc;
                }, []);
                
                const subtotal = saleItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
                const discount = publicSettings.defaultDiscount || 0;
                const finalTotal = subtotal * (1 - discount / 100);

                return {
                    items: saleItems, subtotal, discount, finalTotal, date: new Date(),
                };
            }).filter(sale => sale.items.length > 0);

            if (finalSales.length > 0) {
              await batchAddSales(finalSales, userRole);
            }
            
            onImportComplete();
            setAnalysisState('success');
            toast({
              title: "Impor Berhasil",
              description: `${finalSales.length} transaksi baru dari file impor telah berhasil dicatat.`,
            });

        } catch (error) {
            console.error('Import failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan data.';
            toast({
                title: 'Impor Gagal',
                description: errorMessage,
                variant: 'destructive',
            });
            setAnalysisState('review');
        }
    };

    const resetState = () => {
        setFile(null);
        setAnalysisState('idle');
        setAggregatedItems([]);
        setUnrecognizedItems([]);
        setProductMappings({});
        setErrorMessage('');
        setSalesToCreate([]);
    }

    const totalQuantity = useMemo(() => aggregatedItems.reduce((sum, item) => sum + item.quantity, 0), [aggregatedItems]);
    const sortedDbProducts = useMemo(() => [...dbProducts].sort((a,b) => a.name.localeCompare(b.name)), [dbProducts]);


    if (analysisState === 'success') {
        return (
             <div className="flex flex-col items-center justify-center text-center p-8 h-full">
                <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                <h2 className="text-2xl font-bold mb-2">Impor Berhasil!</h2>
                <p className="text-muted-foreground mb-6">
                    {salesToCreate.length} transaksi telah berhasil dicatat sebagai penjualan baru.
                </p>
                <Button onClick={resetState}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Impor File Lain
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
             <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <CardTitle>Impor Penjualan dari File</CardTitle>
                    <CardDescription>
                        Unggah file Excel (disarankan), CSV, PDF, atau gambar (JPG, PNG). AI akan digunakan untuk PDF/gambar.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="flex items-center gap-4">
                        <Input id="file-upload" type="file" onChange={handleFileChange} accept=".csv,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" disabled={analysisState === 'analyzing' || analysisState === 'saving'}/>
                        <Button onClick={handleAnalyze} disabled={!file || analysisState === 'analyzing' || analysisState === 'saving'}>
                            {(analysisState === 'analyzing' || analysisState === 'saving') && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {file?.type.includes('spreadsheet') ? <FileSpreadsheet className="mr-2 h-4 w-4"/> : <Wand2 className="mr-2 h-4 w-4"/>}
                            Proses File
                        </Button>
                     </div>
                      {errorMessage && (
                         <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Analisis Gagal</AlertTitle>
                            <AlertDescription>{errorMessage}</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            {(analysisState === 'analyzing' || analysisState === 'saving') && (
                <div className="text-center py-10">
                    <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin" />
                    <h3 className="mt-4 text-lg font-medium">{analysisState === 'analyzing' ? 'Memproses File...' : 'Menyimpan Data...'}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Harap tunggu, sistem sedang bekerja.</p>
                </div>
            )}
            
            {analysisState === 'review' && (
                <div className="space-y-6">
                    <Alert>
                        <Sparkles className="h-4 w-4" />
                        <AlertTitle>Hasil Analisis</AlertTitle>
                        <AlertDescription>
                            Sistem berhasil mengekstrak <span className="font-bold">{salesToCreate.length} transaksi</span> dengan total <span className="font-bold">{totalQuantity} item</span>.
                            Harap tinjau dan petakan produk yang tidak dikenali di bawah ini.
                        </AlertDescription>
                    </Alert>
                    
                    {unrecognizedItems.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center"><AlertCircle className="h-5 w-5 mr-2 text-amber-500"/>Petakan Produk Tidak Dikenali</CardTitle>
                                <CardDescription>Cocokkan SKU dari file impor dengan produk yang ada di database Anda atau buat yang baru.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-52">
                                    <div className="space-y-4 pr-4">
                                    {unrecognizedItems.map(item => (
                                        <div key={item.sku} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 items-center">
                                            <div>
                                                <p className="font-semibold">{item.name}</p>
                                                <p className="text-xs text-muted-foreground">SKU Impor: {item.sku}</p>
                                            </div>
                                            <Select 
                                                value={productMappings[item.sku] || ''} 
                                                onValueChange={value => setProductMappings(prev => ({...prev, [item.sku]: value}))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih Aksi..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={CREATE_NEW_PRODUCT_VALUE}>
                                                        <span className="font-semibold text-primary">Buat Produk Baru (ID: {item.sku})</span>
                                                    </SelectItem>
                                                    {sortedDbProducts.map(p => (
                                                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.id})</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    ))}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    )}


                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center"><CheckCircle2 className="h-5 w-5 mr-2 text-green-500"/>Ringkasan Impor</CardTitle>
                             <CardDescription>Ini adalah rincian item yang akan dicatat sebagai penjualan setelah konfirmasi.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-64 border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nama Produk</TableHead>
                                            <TableHead>SKU</TableHead>
                                            <TableHead className="text-right">Jumlah</TableHead>
                                            <TableHead className="text-right">Harga Jual Satuan</TableHead>
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
                                                    <Badge variant={item.isNew ? "secondary" : "default"}>{item.isNew ? "Baru" : "Dikenali"}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            )}
            
            {analysisState === 'review' && (
                 <div className="flex justify-end gap-4 mt-6">
                    <Button variant="outline" onClick={resetState} disabled={analysisState === 'saving'}>Mulai Ulang</Button>
                    <Button onClick={handleConfirmImport} disabled={analysisState === 'saving' || !isMappingComplete}>
                        {analysisState === 'saving' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Konfirmasi & Catat Penjualan
                    </Button>
                </div>
            )}
        </div>
    );
}

export default SalesImporterPage;

