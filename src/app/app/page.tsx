
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
  SidebarMenuBadge,
} from '@/components/ui/sidebar';
import {
  LayoutGrid,
  Package,
  ScrollText,
  Undo2,
  Wallet,
  AreaChart,
  Zap,
  Settings,
  Store,
  ClipboardList,
  Home as HomeIcon,
  History,
  LogOut,
  ShoppingCart,
  LayoutDashboard,
  Calculator,
  PlusSquare,
  FileAxis3d,
  FileUp,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import DashboardPage from '@/components/pages/dashboard';
import KasirPage from '@/components/pages/kasir';
import ProdukPage from '@/components/pages/produk';
import StokOpnamePage from '@/components/pages/stok-opname';
import PenjualanPage from '@/components/pages/penjualan';
import ReturPage from '@/components/pages/retur';
import PengeluaranPage from '@/components/pages/pengeluaran';
import PemasukanLainPage from '@/components/pages/pemasukan-lain';
import LaporanPage from '@/components/pages/laporan';
import FlashSalePage from '@/components/pages/flash-sale';
import PengaturanPage from '@/components/pages/pengaturan';
import ActivityLogPage from '@/components/pages/activity-log';
import ErpPage from '@/components/pages/erp';
import KalkulatorRoasPage from '@/components/pages/kalkulator-roas';
import PdfConverterPage from '@/components/pages/pdf-converter';
import SalesImporterPage from '@/components/pages/sales-importer-page';
import { SaleItem, Product, Settings as AppSettings, UserRole, FlashSale, Category, PublicSettings, Sale, Return } from '@/lib/types';
import { getSettings, getFlashSaleSettings, getProducts, getPublicSettings, getSales, getReturns } from '@/lib/data-service';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/auth-provider';
import { logout } from '@/lib/auth-service';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';

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

const defaultSettings: AppSettings = { 
  storeName: 'Memuat...', 
  defaultDiscount: 0, 
  syncCostPrice: true, 
  theme: 'default',
  categories: [],
  expenseCategories: [],
};
const defaultFlashSale: FlashSale = { id: 'main', title: '', isActive: false, products: [] };

function AppPageContent() {
  const { user, userRole, loading: authLoading } = useAuth();
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const [activeView, setActiveView] = useState<View>('erp');
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [flashSale, setFlashSale] = useState<FlashSale>(defaultFlashSale);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<Return[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Cart state lifted from KasirPage
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [discount, setDiscount] = useState(settings.defaultDiscount || 0);
  const [transactionDate, setTransactionDate] = useState<Date>(new Date());
  
  useEffect(() => {
    setDiscount(settings.defaultDiscount || 0);
  }, [settings.defaultDiscount]);

  const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);


  const refreshAllData = async (shouldKeepCart = false) => {
    if (!userRole) return;
    setIsLoading(true);
    try {
      const settingsPromise = getSettings();
      const flashSalePromise = getFlashSaleSettings();
      const productsPromise = getProducts();
      const publicSettingsPromise = getPublicSettings();
      const salesPromise = getSales();
      const returnsPromise = getReturns();

      const [
        appSettings, 
        flashSaleSettings, 
        productsData, 
        publicSettings,
        salesData,
        returnsData
      ] = await Promise.all([
        settingsPromise, 
        flashSalePromise, 
        productsPromise,
        publicSettingsPromise,
        salesPromise,
        returnsPromise
      ]);

      setSettings({ ...appSettings, defaultDiscount: publicSettings.defaultDiscount });
      setFlashSale(flashSaleSettings);
      setProducts(productsData);
      setSales(salesData);
      setReturns(returnsData);

      if (!shouldKeepCart) {
          setCart([]);
      }

    } catch (error) {
      console.error(error);
      toast({
        title: "Gagal memuat data",
        description: "Terjadi kesalahan saat memuat data aplikasi. Periksa koneksi dan izin Anda.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };


  useEffect(() => {
    if (user) {
        refreshAllData();
    }
  }, [user, userRole]);
  
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.className = document.documentElement.className.replace(/\btheme-\S+/g, '');
    if (settings.theme !== 'dark' && settings.theme !== 'default') {
      document.documentElement.classList.add(`theme-${settings.theme}`);
    }
  }, [settings.theme]);
  
  useEffect(() => {
    if (!authLoading && userRole === 'kasir') {
      setActiveView('kasir');
    } else if (!authLoading && userRole === 'admin') {
      setActiveView('erp');
    }
  }, [authLoading, userRole]);


  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
      toast({
        title: "Anda Telah Logout",
        description: "Anda telah berhasil keluar dari aplikasi.",
      });
    } catch (error) {
       toast({
        title: "Gagal Logout",
        description: "Terjadi kesalahan saat mencoba logout.",
        variant: "destructive",
      });
    }
  }

  const allMenuItems = [
    { id: 'erp', label: 'ERP', icon: LayoutDashboard, roles: ['admin'] },
    { id: 'dashboard', label: 'Dashboard', icon: HomeIcon, roles: ['admin'] },
    { id: 'kasir', label: 'Kasir', icon: LayoutGrid, roles: ['admin', 'kasir'] },
    { id: 'produk', label: 'Produk', icon: Package, roles: ['admin'] },
    { id: 'stok-opname', label: 'Stok Opname', icon: ClipboardList, roles: ['admin'] },
    { id: 'penjualan', label: 'Riwayat Penjualan', icon: ScrollText, roles: ['admin'] },
    { id: 'retur', label: 'Retur', icon: Undo2, roles: ['admin', 'kasir'] },
    { id: 'pengeluaran', label: 'Pengeluaran', icon: Wallet, roles: ['admin', 'kasir'] },
    { id: 'pemasukan-lain', label: 'Pemasukan Lain', icon: PlusSquare, roles: ['admin'] },
    { id: 'laporan', label: 'Laporan Arus Kas', icon: AreaChart, roles: ['admin'] },
    { id: 'kalkulator-roas', label: 'Kalkulator ROAS', icon: Calculator, roles: ['admin'] },
    { id: 'pdf-converter', label: 'PDF ke Excel', icon: FileAxis3d, roles: ['admin'] },
    { id: 'sales-importer', label: 'Impor Penjualan', icon: FileUp, roles: ['admin'] },
    { id: 'flash-sale', label: 'Flash Sale', icon: Zap, roles: ['admin'] },
    { id: 'pengaturan', label: 'Pengaturan', icon: Settings, roles: ['admin', 'kasir'] },
    { id: 'activity-log', label: 'Log Aktivitas', icon: History, roles: ['admin'] },
  ];

  const menuItems = allMenuItems.filter(item => userRole && item.roles.includes(userRole));
  
  const activeMenu = menuItems.find(item => item.id === activeView);

  const handleNavigate = (view: View) => {
    setActiveView(view);
    setOpenMobile(false);
  }

  const renderView = () => {
    if (isLoading || authLoading) {
      return (
        <div className="space-y-6 p-4 md:p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )
    }

    if (userRole === 'kasir' && (activeView === 'dashboard' || activeView === 'erp')) {
      setActiveView('kasir');
    }

    switch (activeView) {
      case 'erp':
        return <ErpPage onNavigate={handleNavigate} />;
      case 'dashboard':
        return <DashboardPage onNavigate={handleNavigate} />;
      case 'kasir':
        return <KasirPage 
          settings={settings}
          flashSale={flashSale}
          products={products}
          onDataNeedsRefresh={() => refreshAllData(true)}
          userRole={userRole!}
          sales={sales}
          cart={cart}
          setCart={setCart}
          discount={discount}
          setDiscount={setDiscount}
          transactionDate={transactionDate}
          setTransactionDate={setTransactionDate}
          cartItemCount={cartItemCount}
        />;
      case 'produk':
        return <ProdukPage onDataChange={refreshAllData} userRole={userRole!} />;
      case 'stok-opname':
        return <StokOpnamePage onDataChange={refreshAllData} userRole={userRole!}/>;
      case 'penjualan':
        return <PenjualanPage onDataChange={refreshAllData} userRole={userRole!} />;
      case 'retur':
        return <ReturPage onDataChange={refreshAllData} userRole={userRole!} />;
      case 'pengeluaran':
        return <PengeluaranPage userRole={userRole!} />;
      case 'pemasukan-lain':
        return <PemasukanLainPage onDataChange={refreshAllData} userRole={userRole!} />;
      case 'laporan':
        return <LaporanPage onNavigate={handleNavigate} />;
      case 'kalkulator-roas':
        return <KalkulatorRoasPage />;
      case 'pdf-converter':
        return <PdfConverterPage />;
      case 'sales-importer':
        return <SalesImporterPage 
          onImportComplete={(items) => {
            setCart(items);
            refreshAllData(true);
          }} 
          userRole={userRole!} 
        />;
      case 'flash-sale':
        return <FlashSalePage onSettingsSave={refreshAllData} userRole={userRole!} />;
      case 'pengaturan':
        return <PengaturanPage settings={settings} onSettingsChange={refreshAllData} userRole={userRole!} />;
      case 'activity-log':
        return <ActivityLogPage />;
      default:
        return userRole === 'kasir' ? <KasirPage 
          settings={settings}
          flashSale={flashSale}
          products={products}
          onDataNeedsRefresh={() => refreshAllData(true)}
          userRole={userRole!}
          sales={sales}
          cart={cart}
          setCart={setCart}
          discount={discount}
          setDiscount={setDiscount}
          transactionDate={transactionDate}
          setTransactionDate={setTransactionDate}
          cartItemCount={cartItemCount}
        /> : <ErpPage onNavigate={handleNavigate} />;
    }
  };

  if (authLoading || !user) {
    return <div className="flex h-screen items-center justify-center">Memuat data pengguna...</div>;
  }

  return (
      <div className={cn("flex min-h-screen bg-background")}>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <Store className="h-5 w-5 text-primary" />
              </Button>
              <div className="flex flex-col">
                <span className="font-semibold tracking-tight">{settings.storeName}</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    onClick={() => handleNavigate(item.id as View)}
                    isActive={activeView === item.id}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {item.id === 'kasir' && cartItemCount > 0 && (
                      <SidebarMenuBadge>{cartItemCount}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <Separator />
          <SidebarFooter>
            <div className="flex flex-col gap-4 p-2">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={`https://api.dicebear.com/8.x/initials/svg?seed=${user.email}`} alt="Avatar" />
                    <AvatarFallback>{user.email?.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold capitalize">{userRole}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <Button variant="ghost" onClick={handleLogout} className="w-full justify-start">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
            <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
                <SidebarTrigger className="md:hidden" />
                <h1 className="text-xl font-semibold">{activeMenu?.label}</h1>
            </header>
            <main className="p-4 md:p-6">{renderView()}</main>
             
             {isMobile && activeView !== 'kasir' && (
                <Button
                    className="fixed bottom-4 right-4 h-16 w-16 rounded-full shadow-lg z-20"
                    size="icon"
                    onClick={() => handleNavigate('kasir')}
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

        </SidebarInset>
      </div>
  );
}


export default function AppPage() {
  return (
    <SidebarProvider>
      <AppPageContent />
    </SidebarProvider>
  )
}
