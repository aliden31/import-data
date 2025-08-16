

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getProducts, addProduct, hasImportedFile, addImportedFile, addExpense, getSkuMappings, saveSkuMapping, batchAddSales, getPublicSettings } from '@/lib/data-service';
import type { Product, UserRole, SaleItem, SkuMapping, PublicSettings, Sale } from '@/lib/types';
import { Loader2, CheckCircle2, AlertCircle, Sparkles, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { AggregatedSaleItem, AnalysisResult } from './sales-importer-page';
import { ExtractedSale } from '@/ai/schemas/extract-sales-schema';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
};

const CREATE_NEW_PRODUCT_VALUE = 'CREATE_NEW_PRODUCT';

interface SalesImporterReviewPageProps {
    onImportComplete: () => void;
    onCancel: () => void;
    userRole: UserRole;
}

const SalesImporterReviewPage: React.FC<SalesImporterReviewPageProps> = ({ onImportComplete, onCancel, userRole }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Data from analysis
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [productMappings, setProductMappings] = useState<Record<string, string>>({});
    
    // Data from DB
    const [dbProducts, setDbProducts] = useState<Product[]>([]);
    const [dbSkuMappings, setDbSkuMappings] = useState<SkuMapping[]>([]);
    const [publicSettings, setPublicSettings] = useState<PublicSettings>({ defaultDiscount: 0 });
    
    const { toast } = useToast();

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                // Load analysis from session storage
                const storedAnalysis = sessionStorage.getItem('salesImportAnalysis');
                if (!storedAnalysis) {
                    toast({ title: "Tidak Ada Data", description: "Tidak ada data impor untuk direview. Silakan mulai dari halaman impor.", variant: "destructive" });
                    onCancel();
                    return;
                }
                const parsedAnalysis: AnalysisResult = JSON.parse(storedAnalysis);
                setAnalysisResult(parsedAnalysis);
                
                // Fetch required data from DB
                const productsPromise = getProducts();
                const mappingsPromise = getSkuMappings();
                const settingsPromise = getPublicSettings();

                const [products, mappings, settings] = await Promise.all([productsPromise, mappingsPromise, settingsPromise]);
                
                setDbProducts(products);
                setDbSkuMappings(mappings);
                setPublicSettings(settings);

                // Pre-fill mappings
                const initialMappings: Record<string, string> = {};
                parsedAnalysis.unrecognizedItems.forEach(item => {
                    const existingMapping = mappings.find(m => m.importSku.toLowerCase() === item.sku.toLowerCase());
                    if (existingMapping) {
                        initialMappings[item.sku] = existingMapping.mappedProductId;
                    }
                });
                setProductMappings(initialMappings);

            } catch (error) {
                console.error("Failed to load review data", error);
                toast({ title: "Gagal Memuat Data", description: "Terjadi kesalahan saat memuat data review.", variant: "destructive" });
                onCancel();
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    const isMappingComplete = useMemo(() => {
        if (!analysisResult) return false;
        return analysisResult.unrecognizedItems.every(item => productMappings[item.sku]);
    }, [analysisResult, productMappings]);

    const handleConfirmImport = async () => {
        if (!analysisResult || !analysisResult.salesToCreate) return;
        setIsSaving(true);
        try {
            const { salesToCreate, fileName, unrecognizedItems } = analysisResult;
            const fileAlreadyImported = await hasImportedFile(fileName);

            if (salesToCreate.length > 0 && !fileAlreadyImported) {
                const resiExpense = {
                    name: `Biaya Resi Marketplace - ${fileName}`,
                    amount: salesToCreate.length * 1250,
                    category: 'Operasional',
                    date: new Date(),
                    subcategory: 'Biaya Pengiriman'
                };
                await addExpense(resiExpense, 'sistem');
                await addImportedFile(fileName);
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
                    const productData: Product = { id: item.sku, name: item.name, sellingPrice: item.price, costPrice: 0, stock: 0, category: 'Impor' };
                    const createdProduct = await addProduct(productData, userRole, productData.id);
                    newProductIds.set(item.sku, createdProduct.id);
                    updatedDbProducts.push(createdProduct);
                } else {
                    const mappedProduct = dbProducts.find(p => p.id === mappingValue);
                    if (mappedProduct) {
                        await saveSkuMapping({ importSku: item.sku, mappedProductId: mappedProduct.id, mappedProductName: mappedProduct.name });
                    }
                }
            }

            const finalSales: Omit<Sale, 'id'>[] = salesToCreate.map((sale: ExtractedSale) => {
                const saleItems: SaleItem[] = sale.items.reduce((acc: SaleItem[], item) => {
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
                                product: { id: productInfo.id, name: productInfo.name, category: productInfo.category, subcategory: productInfo.subcategory, costPrice: productInfo.costPrice },
                                quantity: item.quantity, price: item.price, costPriceAtSale: productInfo.costPrice,
                            };
                        }
                    }

                    if (validItem) acc.push(validItem);
                    return acc;
                }, []);

                const subtotal = saleItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
                const discount = publicSettings.defaultDiscount || 0;
                const finalTotal = subtotal * (1 - discount / 100);

                return { items: saleItems, subtotal, discount, finalTotal, date: new Date() };
            }).filter(sale => sale.items.length > 0);

            if (finalSales.length > 0) {
                await batchAddSales(finalSales, userRole);
            }

            sessionStorage.removeItem('salesImportAnalysis');
            onImportComplete();
            toast({
                title: "Impor Berhasil",
                description: `${finalSales.length} transaksi baru dari file impor telah berhasil dicatat.`,
            });
        } catch (error) {
            console.error('Import failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan data.';
            toast({ title: 'Impor Gagal', description: errorMessage, variant: 'destructive' });
            setIsSaving(false);
        }
    };

    const sortedDbProducts = useMemo(() => [...dbProducts].sort((a, b) => a.name.localeCompare(b.name)), [dbProducts]);

    if (isLoading || !analysisResult) {
        return (
            <div className="flex flex-col items-center justify-center text-center p-8 h-full">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
                <h2 className="text-xl font-semibold mt-4">Memuat Data Review...</h2>
            </div>
        );
    }

    const { aggregatedItems, unrecognizedItems, salesToCreate } = analysisResult;
    const totalQuantity = aggregatedItems.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div className="space-y-6">
            <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertTitle>Hasil Analisis</AlertTitle>
                <AlertDescription>
                    Sistem berhasil mengekstrak <span className="font-bold">{salesToCreate.length} transaksi</span> dengan total <span className="font-bold">{totalQuantity} item</span>.
                    Harap tinjau dan petakan produk yang tidak dikenali di bawah ini sebelum melanjutkan.
                </AlertDescription>
            </Alert>
    
            {unrecognizedItems.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center"><AlertCircle className="h-5 w-5 mr-2 text-amber-500" />Petakan Produk Tidak Dikenali</CardTitle>
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
                                            onValueChange={value => setProductMappings(prev => ({ ...prev, [item.sku]: value }))}
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
                    <CardTitle className="text-lg flex items-center"><CheckCircle2 className="h-5 w-5 mr-2 text-green-500" />Ringkasan Impor</CardTitle>
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
            <div className="flex justify-end gap-4 mt-6">
                <Button variant="outline" onClick={onCancel} disabled={isSaving}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
                </Button>
                <Button onClick={handleConfirmImport} disabled={isSaving || !isMappingComplete}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Konfirmasi & Catat Penjualan
                </Button>
            </div>
        </div>
    );
}

export default SalesImporterReviewPage;
