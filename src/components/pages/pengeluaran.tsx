

'use client';

import type { FC } from 'react';
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
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
import { Pie, PieChart, ResponsiveContainer, Tooltip, Legend, Cell } from 'recharts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Expense, Settings, UserRole, SubCategory } from '@/lib/types';
import { PlusCircle, Calendar as CalendarIcon, Edit, Search, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getExpenses, addExpense, getSettings, updateExpense, deleteExpense } from '@/lib/data-service';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { id } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { Skeleton } from '../ui/skeleton';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
};

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

const ExpenseChart = ({ expenses }: { expenses: Expense[] }) => {
    const expensesByCategory = expenses.reduce((acc, expense) => {
        const key = expense.name || expense.category;
        acc[key] = (acc[key] || 0) + expense.amount;
        return acc;
    }, {} as Record<string, number>);

    const chartData = Object.entries(expensesByCategory).map(([name, value]) => ({ name, value }));

    if (chartData.length === 0) {
        return (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Tidak ada data untuk ditampilkan pada rentang tanggal ini.
            </div>
        )
    }

    return (
        <ResponsiveContainer width="100%" height={300}>
            <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                }} formatter={(value: number) => formatCurrency(value)} />
                <Legend />
            </PieChart>
        </ResponsiveContainer>
    );
};

export const ExpenseForm = ({ 
    expense,
    onSave, 
    onOpenChange, 
    userRole
}: { 
    expense?: Expense;
    onSave: (data: Omit<Expense, 'id'> | Expense) => Promise<void>, 
    onOpenChange: (open: boolean) => void, 
    userRole: UserRole,
}) => {
    const [name, setName] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    const [category, setCategory] = useState('');
    const [date, setDate] = useState<Date>(new Date());
    const [isSaving, setIsSaving] = useState(false);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
    const [resiMultiplier, setResiMultiplier] = useState<number | ''>('');
    
    useEffect(() => {
        const fetchFormSettings = async () => {
            try {
                const settingsData = await getSettings();
                setSettings(settingsData);
            } catch (e) {
                console.error("Failed to fetch settings for expense form", e);
            }
        };
        fetchFormSettings();

        if (expense) {
            setName(expense.name);
            setAmount(expense.amount);
            setCategory(expense.category);
            setDate(new Date(expense.date));
            setSelectedSubCategory(expense.subcategory || '');
        } else {
            setName('');
            setAmount('');
            setCategory('');
            setDate(new Date());
            setSelectedSubCategory('');
        }
    }, [expense]);
    
    useEffect(() => {
        if (selectedSubCategory && selectedSubCategory !== 'lainnya') {
            setName(selectedSubCategory);
        } else if (selectedSubCategory === 'lainnya') {
            setName('');
        }
    }, [selectedSubCategory]);

    const activeSubcategories = useMemo(() => {
        return settings?.expenseCategories?.find(c => c.name === category)?.subcategories || [];
    }, [category, settings]);
    
    const showSubCategoryInput = activeSubcategories.length > 0;
    const showFreeTextInput = selectedSubCategory === 'lainnya' || !showSubCategoryInput;

    const isResi = name.toLowerCase().includes('resi');

    const handleMultiplierChange = (value: string) => {
        const numValue = value === '' ? '' : parseInt(value, 10);
        setResiMultiplier(numValue);
        if (typeof numValue === 'number' && !isNaN(numValue)) {
            setAmount(numValue * 1250);
        } else {
            setAmount(0);
        }
    };


    const handleSubmit = async () => {
        if (amount === '' || amount <= 0 || !category || !name) {
            return;
        }
        
        setIsSaving(true);
        const expenseData: Omit<Expense, 'id'> = {
            name: name,
            amount: Number(amount),
            category,
            date,
            subcategory: selectedSubCategory,
        };

        if (expense?.id) {
            await onSave({ ...expenseData, id: expense.id });
        } else {
            await onSave(expenseData);
        }

        onOpenChange(false);
        setIsSaving(false);
    }
    
    const isSaveDisabled = isSaving || !settings || amount === '' || amount <= 0 || !category || !name;
    
    if (!settings) {
        return <DialogContent><div>Memuat kategori...</div></DialogContent>
    }

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{expense ? 'Edit Pengeluaran' : 'Catat Pengeluaran Baru'}</DialogTitle>
            </DialogHeader>
             <div className="grid gap-4 py-4">
                 <div className="space-y-2">
                    <Label htmlFor="category">Kategori</Label>
                    <Select onValueChange={(value) => setCategory(value)} value={category}>
                        <SelectTrigger>
                            <SelectValue placeholder="Pilih kategori" />
                        </SelectTrigger>
                        <SelectContent>
                            {(settings.expenseCategories || []).map(cat => (
                                <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                 
                 {showSubCategoryInput && (
                     <div className="space-y-2">
                        <Label htmlFor="subcategory">Deskripsi</Label>
                        <Select onValueChange={setSelectedSubCategory} value={selectedSubCategory}>
                            <SelectTrigger>
                                <SelectValue placeholder="Pilih deskripsi" />
                            </SelectTrigger>
                            <SelectContent>
                                {activeSubcategories.map(sub => (
                                    <SelectItem key={sub.id} value={sub.name}>{sub.name}</SelectItem>
                                ))}
                                <SelectItem value="lainnya">Lainnya...</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                 )}

                 {showFreeTextInput && (
                    <div className="space-y-2">
                        <Label htmlFor="name">
                           {showSubCategoryInput ? 'Deskripsi Lain' : 'Deskripsi'}
                        </Label>
                        <Input 
                            id="name" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            placeholder="Deskripsi pengeluaran"
                        />
                    </div>
                 )}

                {isResi && (
                    <div className="space-y-2">
                        <Label htmlFor="resi-multiplier">Jumlah Resi</Label>
                        <Input 
                            id="resi-multiplier" 
                            type="number" 
                            value={resiMultiplier} 
                            onChange={(e) => handleMultiplierChange(e.target.value)} 
                            placeholder="Contoh: 10"
                        />
                    </div>
                )}


                <div className="space-y-2">
                    <Label htmlFor="amount">Jumlah</Label>
                    <Input 
                        id="amount" 
                        type="number" 
                        value={amount} 
                        onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} 
                        placeholder="0"
                        disabled={isResi}
                     />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="date">Tanggal</Label>
                     <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            className="w-full justify-start text-left font-normal"
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {format(date, "PPP", { locale: id })}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={(selectedDate) => selectedDate && setDate(selectedDate)}
                            initialFocus
                        />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
            <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="secondary" disabled={isSaving}>Batal</Button>
                </DialogClose>
                <Button onClick={handleSubmit} disabled={isSaveDisabled}>{isSaving ? 'Menyimpan...' : 'Simpan'}</Button>
            </DialogFooter>
        </DialogContent>
    )
}

interface PengeluaranPageProps {
    userRole: UserRole;
}

const PengeluaranPage: FC<PengeluaranPageProps> = React.memo(({ userRole }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>(undefined);
  const { toast } = useToast();
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
  });
  const [searchTerm, setSearchTerm] = useState('');

  const fetchInitialData = async () => {
    setLoading(true);
    try {
        const expensesData = await getExpenses();
        setExpenses(expensesData.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (error) {
        toast({ title: "Error", description: "Gagal memuat data.", variant: "destructive"});
        console.error(error);
    } finally {
        setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchInitialData();
  }, []);
  
  const filteredExpenses = useMemo(() => {
    let dateFilteredExpenses = expenses;

    if (date?.from) {
        const toDate = date.to ? endOfDay(date.to) : endOfDay(date.from);
        const interval = { start: startOfDay(date.from), end: toDate };
        dateFilteredExpenses = expenses.filter(expense => isWithinInterval(new Date(expense.date), interval));
    }

    if (!searchTerm) {
        return dateFilteredExpenses;
    }

    const lowercasedTerm = searchTerm.toLowerCase();
    return dateFilteredExpenses.filter(expense => 
        expense.name.toLowerCase().includes(lowercasedTerm) ||
        expense.category.toLowerCase().includes(lowercasedTerm) ||
        (expense.subcategory && expense.subcategory.toLowerCase().includes(lowercasedTerm))
    );
  }, [expenses, date, searchTerm]);

  const totalFilteredAmount = useMemo(() => {
    return filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  }, [filteredExpenses]);


  const handleSaveExpense = async (expenseData: Omit<Expense, 'id'> | Expense) => {
    try {
        if ('id' in expenseData) {
            await updateExpense(expenseData.id, expenseData, userRole);
            toast({ title: "Pengeluaran Diperbarui", description: `Pengeluaran telah berhasil diperbarui.` });
        } else {
            await addExpense(expenseData, userRole);
            toast({ title: "Pengeluaran Disimpan", description: `Pengeluaran telah berhasil disimpan.` });
        }
        await fetchInitialData();
    } catch(error) {
        toast({ title: "Error", description: "Gagal menyimpan pengeluaran.", variant: "destructive" });
        console.error(error);
    }
  }

  const handleDeleteExpense = async (expense: Expense) => {
      try {
          await deleteExpense(expense, userRole);
          toast({ title: "Pengeluaran Dihapus", description: `Pengeluaran "${expense.name}" telah dihapus.` });
          await fetchInitialData();
      } catch (error) {
          toast({ title: "Error", description: "Gagal menghapus pengeluaran.", variant: "destructive" });
      }
  };

  const handleOpenForm = (expense?: Expense) => {
    setEditingExpense(expense);
    setFormOpen(true);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-80" />
            </div>
            <div className="flex items-center gap-2">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-10 w-24" />
            </div>
        </div>
        <Card>
            <CardHeader>
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-72" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-48 w-full" />
            </CardContent>
        </Card>
    </div>
    );
  }
    
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold">Manajemen Pengeluaran</h1>
            <p className="text-muted-foreground">Catat dan lihat semua pengeluaran toko Anda.</p>
        </div>
        <div className="flex items-center gap-2">
            <Dialog open={isFormOpen} onOpenChange={(isOpen) => { setFormOpen(isOpen); if (!isOpen) setEditingExpense(undefined); }}>
                <DialogTrigger asChild>
                    <Button onClick={() => handleOpenForm()}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Catat
                    </Button>
                </DialogTrigger>
                <ExpenseForm 
                    expense={editingExpense} 
                    onSave={handleSaveExpense} 
                    onOpenChange={setFormOpen} 
                    userRole={userRole}
                />
            </Dialog>
        </div>
      </div>
      
      {userRole === 'admin' ? (
        <Tabs defaultValue="riwayat">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="riwayat">Riwayat Pengeluaran</TabsTrigger>
            <TabsTrigger value="diagram">Diagram</TabsTrigger>
          </TabsList>
          <TabsContent value="riwayat" className="mt-4">
              <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                        <div>
                            <CardTitle>Riwayat Pengeluaran</CardTitle>
                            <CardDescription>
                                Ditemukan {filteredExpenses.length} transaksi dengan total <span className="font-semibold text-primary">{formatCurrency(totalFilteredAmount)}</span>.
                            </CardDescription>
                        </div>
                        <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2">
                             <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Cari pengeluaran..."
                                    className="pl-10 w-full sm:w-auto"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
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
                  </CardHeader>
                  <CardContent>
                      <div className="overflow-x-auto">
                          <Table>
                              <TableHeader>
                              <TableRow>
                                  <TableHead>Tanggal</TableHead>
                                  <TableHead>Deskripsi</TableHead>
                                  <TableHead>Kategori</TableHead>
                                  <TableHead className="text-right">Jumlah</TableHead>
                                  <TableHead className="text-right">Aksi</TableHead>
                              </TableRow>
                              </TableHeader>
                              <TableBody>
                              {filteredExpenses.length > 0 ? filteredExpenses.map((expense) => (
                                  <TableRow key={expense.id}>
                                  <TableCell>{new Date(expense.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</TableCell>
                                  <TableCell className="font-medium">{expense.name}</TableCell>
                                  <TableCell>
                                      {expense.category}
                                      {expense.subcategory && <span className="text-muted-foreground text-xs"> / {expense.subcategory}</span>}
                                  </TableCell>
                                  <TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell>
                                  <TableCell className="text-right space-x-2">
                                    <Button variant="ghost" size="icon" onClick={() => handleOpenForm(expense)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Hapus Pengeluaran?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Tindakan ini akan menghapus catatan pengeluaran "{expense.name}" secara permanen. Apakah Anda yakin?
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Batal</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDeleteExpense(expense)} className="bg-destructive hover:bg-destructive/90">
                                                    Hapus
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                  </TableCell>
                                  </TableRow>
                              )) : (
                                  <TableRow>
                                      <TableCell colSpan={5} className="h-24 text-center">
                                          Belum ada data pengeluaran pada rentang tanggal atau pencarian ini.
                                      </TableCell>
                                  </TableRow>
                              )}
                              </TableBody>
                          </Table>
                      </div>
                  </CardContent>
              </Card>
          </TabsContent>
          <TabsContent value="diagram" className="mt-4">
              <Card>
                  <CardHeader>
                      <CardTitle>Diagram Pengeluaran</CardTitle>
                      <CardDescription>Visualisasi pengeluaran berdasarkan kategori dalam rentang waktu terpilih.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <ExpenseChart expenses={filteredExpenses} />
                  </CardContent>
              </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>Catat Pengeluaran</CardTitle>
                <CardDescription>Gunakan tombol "Catat" di atas untuk menambahkan pengeluaran baru. Anda tidak memiliki akses untuk melihat riwayat.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-40 flex items-center justify-center bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Riwayat pengeluaran hanya dapat dilihat oleh Admin.</p>
                </div>
            </CardContent>
        </Card>
      )}
    </div>
  );
});

PengeluaranPage.displayName = 'PengeluaranPage';
export default PengeluaranPage;



