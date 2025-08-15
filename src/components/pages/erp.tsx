

'use client';

import type { FC } from 'react';
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, ShoppingCart, TrendingUp, Package, Wallet, AreaChart, Settings, ArrowRight, Calculator, PlusSquare, FileAxis3d, LayoutGrid, ClipboardList, ScrollText, Undo2, Zap, History, FileUp, Home } from 'lucide-react';
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import type { Sale, Return, Product, Expense, OtherIncome } from '@/lib/types';
import { getSales, getReturns, getProducts, getExpenses, getOtherIncomes } from '@/lib/data-service';
import { useToast } from '@/hooks/use-toast';
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

type View =
  | 'dashboard'
  | 'kasir'
  | 'produk'
  | 'stok-opname'
  | 'penjualan'
  | 'retur'
  | 'pengeluaran'
  | 'pemasukan-lain'
  | 'laporan'
  | 'flash-sale'
  | 'pengaturan'
  | 'activity-log'
  | 'erp'
  | 'kalkulator-roas'
  | 'pdf-converter'
  | 'sales-importer';

interface ErpPageProps {
  onNavigate: (view: View) => void;
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
};

const ErpPage: FC<ErpPageProps> = React.memo(({ onNavigate }) => {
    const [sales, setSales] = useState<Sale[]>([]);
    const [returns, setReturns] = useState<Return[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [otherIncomes, setOtherIncomes] = useState<OtherIncome[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [salesData, returnsData, expensesData, otherIncomesData] = await Promise.all([getSales(), getReturns(), getExpenses(), getOtherIncomes()]);
                setSales(salesData);
                setReturns(returnsData);
                setExpenses(expensesData);
                setOtherIncomes(otherIncomesData);
            } catch (error) {
                toast({ title: "Error", description: "Gagal memuat data dashboard.", variant: "destructive" });
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [toast]);

    const last14DaysStats = useMemo(() => {
        const todayEnd = endOfDay(new Date());
        const last14DaysStart = startOfDay(subDays(new Date(), 13));
        const interval = { start: last14DaysStart, end: todayEnd };

        const salesInRange = sales.filter(s => isWithinInterval(s.date, interval));
        const returnsInRange = returns.filter(r => isWithinInterval(r.date, interval));
        const expensesInRange = expenses.filter(e => isWithinInterval(e.date, interval));
        const otherIncomesInRange = otherIncomes.filter(i => isWithinInterval(i.date, interval));

        const totalRevenue = salesInRange.reduce((sum, sale) => sum + sale.finalTotal, 0);
        const totalReturnValue = returnsInRange.reduce((sum, ret) => sum + ret.totalRefund, 0);
        const totalExpenses = expensesInRange.reduce((sum, exp) => sum + exp.amount, 0);
        const totalOtherIncomes = otherIncomesInRange.reduce((sum, income) => sum + income.amount, 0);
        
        const totalCostOfGoodsSold = salesInRange.reduce((sum, sale) => 
            sum + sale.items.reduce((itemSum, item) => itemSum + ((item.costPriceAtSale || 0) * item.quantity), 0), 0);
        
        const totalCostOfReturnedGoods = returnsInRange.reduce((sum, ret) =>
            sum + ret.items.reduce((itemSum, item) => itemSum + ((item.costPriceAtSale || 0) * item.quantity), 0), 0);

        const netRevenue = totalRevenue - totalReturnValue;
        const netCOGS = totalCostOfGoodsSold - totalCostOfReturnedGoods;
        const grossProfit = netRevenue - netCOGS;
        const profit = grossProfit - totalExpenses + totalOtherIncomes;

        return { netRevenue, profit, totalExpenses, totalReturns: totalReturnValue };
    }, [sales, returns, expenses, otherIncomes]);

    const salesChartData = useMemo(() => {
        return Array.from({ length: 14 }).map((_, i) => {
            const date = subDays(new Date(), 13 - i);
            const dayStart = startOfDay(date);
            const dayEnd = endOfDay(date);
            const interval = { start: dayStart, end: dayEnd };
            const dailySales = sales.filter(s => isWithinInterval(s.date, interval));
            const total = dailySales.reduce((sum, sale) => sum + sale.finalTotal, 0);
            return {
                name: format(date, 'd/MM'),
                Penjualan: total,
            };
        });
    }, [sales]);

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                     <Skeleton className="h-64" />
                     <Skeleton className="h-64" />
                </div>
                 <div className="grid gap-4 md:grid-cols-2">
                     <Skeleton className="h-64" />
                     <Skeleton className="h-64" />
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Pusat Kontrol ERP</h1>
                <p className="text-muted-foreground">Dasbor terpusat untuk mengelola seluruh operasi toko Anda.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Penjualan (14 Hari)</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(last14DaysStats.netRevenue)}</div>
                        <p className="text-xs text-muted-foreground">Total penjualan bersih 14 hari terakhir</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Laba (14 Hari)</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(last14DaysStats.profit)}</div>
                         <p className="text-xs text-muted-foreground">Perkiraan laba bersih 14 hari terakhir</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pengeluaran (14 Hari)</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(last14DaysStats.totalExpenses)}</div>
                         <p className="text-xs text-muted-foreground">Total pengeluaran 14 hari terakhir</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Retur (14 Hari)</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                         <div className="text-2xl font-bold">{formatCurrency(last14DaysStats.totalReturns)}</div>
                        <p className="text-xs text-muted-foreground">Total pengembalian dana 14 hari terakhir</p>
                    </CardContent>
                </Card>
            </div>

            {/* Module Cards */}
            <div className="grid gap-6 md:grid-cols-2">
                 <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><LayoutGrid/> Kasir & Penjualan</CardTitle>
                        <CardDescription>Akses cepat ke modul kasir dan riwayat transaksi.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-3">
                        <Button className="w-full justify-between" onClick={() => onNavigate('kasir')}>
                            <span>Buka Kasir</span>
                            <ArrowRight className="h-4 w-4"/>
                        </Button>
                        <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('penjualan')}>
                            <span>Riwayat Penjualan</span>
                             <ArrowRight className="h-4 w-4"/>
                        </Button>
                        <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('retur')}>
                            <span>Manajemen Retur</span>
                             <ArrowRight className="h-4 w-4"/>
                        </Button>
                    </CardContent>
                </Card>
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Package/> Produk & Stok</CardTitle>
                        <CardDescription>Kelola inventaris, harga, stok, dan penjualan kilat.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-3">
                        <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('produk')}>
                            <span>Daftar Produk</span>
                            <ArrowRight className="h-4 w-4"/>
                        </Button>
                        <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('stok-opname')}>
                            <span>Stok Opname</span>
                             <ArrowRight className="h-4 w-4"/>
                        </Button>
                         <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('flash-sale')}>
                            <span>Manajemen Flash Sale</span>
                             <ArrowRight className="h-4 w-4"/>
                        </Button>
                    </CardContent>
                </Card>
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><AreaChart/> Laporan & Keuangan</CardTitle>
                        <CardDescription>Analisis performa bisnis dan lacak keuangan.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-3">
                         <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('dashboard')}>
                            <span>Dasbor Utama</span>
                             <ArrowRight className="h-4 w-4"/>
                        </Button>
                        <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('laporan')}>
                            <span>Laporan Arus Kas</span>
                            <ArrowRight className="h-4 w-4"/>
                        </Button>
                        <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('pengeluaran')}>
                            <span>Catat Pengeluaran</span>
                             <ArrowRight className="h-4 w-4"/>
                        </Button>
                        <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('pemasukan-lain')}>
                            <span>Pemasukan Lain</span>
                            <ArrowRight className="h-4 w-4"/>
                        </Button>
                    </CardContent>
                </Card>
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Settings/> Utilitas & Sistem</CardTitle>
                        <CardDescription>Konfigurasi, impor data, dan kelola sistem.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-3">
                         <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('kalkulator-roas')}>
                            <span>Kalkulator ROAS</span>
                             <ArrowRight className="h-4 w-4"/>
                        </Button>
                         <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('pdf-converter')}>
                            <span>PDF ke Excel</span>
                            <ArrowRight className="h-4 w-4"/>
                        </Button>
                        <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('sales-importer')}>
                            <span>Impor Penjualan</span>
                             <ArrowRight className="h-4 w-4"/>
                        </Button>
                        <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('pengaturan')}>
                            <span>Pengaturan Umum</span>
                            <ArrowRight className="h-4 w-4"/>
                        </Button>
                        <Button variant="outline" className="w-full justify-between" onClick={() => onNavigate('activity-log')}>
                            <span>Log Aktivitas Sistem</span>
                             <ArrowRight className="h-4 w-4"/>
                        </Button>
                    </CardContent>
                </Card>
            </div>
            
             <Card>
                <CardHeader>
                    <CardTitle>Penjualan 14 Hari Terakhir</CardTitle>
                </CardHeader>
                <CardContent className="pl-2">
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={salesChartData}>
                            <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `Rp${Number(value) / 1000}k`} />
                            <Tooltip
                                cursor={{ fill: 'hsl(var(--muted))' }}
                                contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}
                                formatter={(value: number) => [formatCurrency(value), "Penjualan"]}
                            />
                            <Bar dataKey="Penjualan" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

        </div>
    );
});

ErpPage.displayName = 'ErpPage';
export default ErpPage;

