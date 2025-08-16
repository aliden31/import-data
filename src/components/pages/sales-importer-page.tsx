

'use client';

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { extractSales } from '@/ai/flows/extract-sales-flow';
import type { ExtractedSale } from '@/ai/schemas/extract-sales-schema';
import { getProducts } from '@/lib/data-service';
import type { Product, UserRole } from '@/lib/types';
import { Loader2, Wand2, AlertCircle, FileSpreadsheet, FileUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type AnalysisState = 'idle' | 'analyzing' | 'error';
export type AggregatedSaleItem = {
    sku: string;
    name: string;
    quantity: number;
    price: number;
    isNew: boolean;
};

export interface AnalysisResult {
    aggregatedItems: AggregatedSaleItem[];
    unrecognizedItems: AggregatedSaleItem[];
    salesToCreate: Omit<ExtractedSale, 'id'>[];
    fileName: string;
}

interface SalesImporterPageProps {
    onNavigateToReview: () => void;
    userRole: UserRole;
}

const SalesImporterPage: React.FC<SalesImporterPageProps> = ({ onNavigateToReview, userRole }) => {
    const [file, setFile] = useState<File | null>(null);
    const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
    const [dbProducts, setDbProducts] = useState<Product[]>([]);
    const [errorMessage, setErrorMessage] = useState('');
    const { toast } = useToast();

    useEffect(() => {
        const fetchInitialData = async () => {
            const products = await getProducts();
            setDbProducts(products);
        };
        fetchInitialData();
    }, []);

    const processAndNavigate = (sales: ExtractedSale[], fileName: string) => {
        const allItems = sales.flatMap(s => s.items);
        const itemsBySku = new Map<string, { totalQuantity: number; lastPrice: number; name: string }>();

        allItems.forEach(item => {
            const skuKey = (item.sku || item.name).trim();
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

        for (const [skuKey, aggregatedData] of itemsBySku.entries()) {
            const { totalQuantity, lastPrice, name } = aggregatedData;
            const dbProduct = dbProducts.find(p => p.id.toLowerCase() === skuKey.toLowerCase());
            const isNew = !dbProduct;

            const aggregatedItem: AggregatedSaleItem = { sku: skuKey, name, quantity: totalQuantity, price: lastPrice, isNew };

            if (isNew) {
                finalUnrecognizedItems.push(aggregatedItem);
            }
            finalAggregatedItems.push(aggregatedItem);
        }

        const analysisResult: AnalysisResult = {
            aggregatedItems: finalAggregatedItems.sort((a, b) => a.name.localeCompare(b.name)),
            unrecognizedItems: finalUnrecognizedItems,
            salesToCreate: sales,
            fileName: fileName,
        };

        sessionStorage.setItem('salesImportAnalysis', JSON.stringify(analysisResult));
        onNavigateToReview();
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
                    processAndNavigate(extractedSales, file.name);
                } else {
                    setErrorMessage('Format file tidak sesuai atau tidak ada data yang valid. Pastikan ada kolom "Nomor Pesanan", "SKU Gudang", "Jumlah", dan "Harga Satuan".');
                    setAnalysisState('error');
                }
            } catch (err) {
                setErrorMessage('Gagal memproses file Excel. Pastikan formatnya benar.');
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
                    processAndNavigate(result.sales, file.name);
                } else {
                    setErrorMessage('AI tidak dapat menemukan data penjualan di dalam file. Coba file lain atau pastikan formatnya jelas.');
                    setAnalysisState('error');
                }
            } catch (error) {
                console.error('Analysis failed:', error);
                setErrorMessage('Terjadi kesalahan saat menganalisis file dengan AI. Lihat konsol untuk detail.');
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

    return (
        <div className="space-y-6">
            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileUp className="h-6 w-6"/> Impor Penjualan dari File
                    </CardTitle>
                    <CardDescription>
                        Unggah file Excel (disarankan), CSV, PDF, atau gambar (JPG, PNG). AI akan digunakan untuk PDF/gambar secara otomatis.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <Input id="file-upload" type="file" onChange={handleFileChange} accept=".csv,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" disabled={analysisState === 'analyzing'} />
                        <Button onClick={handleAnalyze} disabled={!file || analysisState === 'analyzing'}>
                            {analysisState === 'analyzing' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {file?.type.includes('spreadsheet') ? <FileSpreadsheet className="mr-2 h-4 w-4" /> : <Wand2 className="mr-2 h-4 w-4" />}
                            Proses File
                        </Button>
                    </div>
                     {analysisState === 'analyzing' && (
                        <div className="text-center py-4">
                            <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin" />
                            <h3 className="mt-2 text-md font-medium">Memproses File...</h3>
                            <p className="mt-1 text-sm text-muted-foreground">Harap tunggu, sistem sedang bekerja. Ini mungkin memakan waktu beberapa saat.</p>
                        </div>
                    )}
                    {analysisState === 'error' && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Analisis Gagal</AlertTitle>
                            <AlertDescription>{errorMessage}</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default SalesImporterPage;
