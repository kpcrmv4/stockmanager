'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  Input,
  Select,
  Textarea,
  toast,
} from '@/components/ui';
import {
  ArrowLeft,
  Wine,
  Save,
} from 'lucide-react';

interface DepositFormProps {
  onBack: () => void;
  onSuccess: () => void;
}

const categoryOptions = [
  { value: '', label: 'เลือกประเภท', disabled: true },
  { value: 'whisky', label: 'วิสกี้' },
  { value: 'vodka', label: 'วอดก้า' },
  { value: 'brandy', label: 'บรั่นดี' },
  { value: 'rum', label: 'รัม' },
  { value: 'gin', label: 'จิน' },
  { value: 'tequila', label: 'เตกิล่า' },
  { value: 'wine', label: 'ไวน์' },
  { value: 'beer', label: 'เบียร์' },
  { value: 'sake', label: 'สาเก' },
  { value: 'soju', label: 'โซจู' },
  { value: 'other', label: 'อื่นๆ' },
];

function generateDepositCode(): string {
  const timestamp = String(Date.now()).slice(-5);
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `DEP-${timestamp}${random}`;
}

export function DepositForm({ onBack, onSuccess }: DepositFormProps) {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [expiryDays, setExpiryDays] = useState('30');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!customerName.trim()) {
      newErrors.customerName = 'กรุณาระบุชื่อลูกค้า';
    }
    if (!productName.trim()) {
      newErrors.productName = 'กรุณาระบุชื่อสินค้า';
    }
    if (!quantity || parseFloat(quantity) <= 0) {
      newErrors.quantity = 'กรุณาระบุจำนวนที่ถูกต้อง';
    }
    if (!expiryDays || parseInt(expiryDays) <= 0) {
      newErrors.expiryDays = 'กรุณาระบุจำนวนวันที่ถูกต้อง';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !currentStoreId || !user) return;

    setIsSubmitting(true);
    const supabase = createClient();
    const depositCode = generateDepositCode();

    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + parseInt(expiryDays));

    const qty = parseFloat(quantity);

    const { error } = await supabase.from('deposits').insert({
      store_id: currentStoreId,
      deposit_code: depositCode,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim() || null,
      product_name: productName.trim(),
      category: category || null,
      quantity: qty,
      remaining_qty: qty,
      remaining_percent: 100,
      table_number: tableNumber.trim() || null,
      status: 'in_store',
      expiry_date: expiryDate.toISOString(),
      received_by: user.id,
      notes: notes.trim() || null,
    });

    if (error) {
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถบันทึกรายการฝากเหล้าได้',
      });
    } else {
      toast({
        type: 'success',
        title: 'บันทึกสำเร็จ',
        message: `สร้างรายการฝากเหล้า ${depositCode}`,
      });
      onSuccess();
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับหน้าฝากเหล้า
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
            <Wine className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ฝากเหล้าใหม่</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              สร้างรายการฝากเหล้าสำหรับลูกค้า
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <Card padding="none">
        <CardHeader title="ข้อมูลลูกค้า" description="ระบุข้อมูลลูกค้าที่ต้องการฝากเหล้า" />
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="ชื่อลูกค้า *"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (errors.customerName) setErrors((prev) => ({ ...prev, customerName: '' }));
                }}
                placeholder="เช่น คุณสมชาย"
                error={errors.customerName}
              />
              <Input
                label="เบอร์โทรศัพท์"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="เช่น 0812345678"
                type="tel"
              />
            </div>
            <Input
              label="หมายเลขโต๊ะ"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="เช่น โต๊ะ 12, VIP 3"
            />
          </div>
        </CardContent>
      </Card>

      <Card padding="none">
        <CardHeader title="ข้อมูลสินค้า" description="ระบุรายละเอียดสินค้าที่ฝาก" />
        <CardContent>
          <div className="space-y-4">
            <Input
              label="ชื่อสินค้า *"
              value={productName}
              onChange={(e) => {
                setProductName(e.target.value);
                if (errors.productName) setErrors((prev) => ({ ...prev, productName: '' }));
              }}
              placeholder="เช่น Johnnie Walker Black Label 750ml"
              error={errors.productName}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="ประเภท"
                options={categoryOptions}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="เลือกประเภท"
              />
              <Input
                label="จำนวน *"
                type="number"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  if (errors.quantity) setErrors((prev) => ({ ...prev, quantity: '' }));
                }}
                placeholder="1"
                hint="จำนวนขวดหรือหน่วย"
                error={errors.quantity}
              />
            </div>
            <Input
              label="ระยะเวลาเก็บรักษา (วัน) *"
              type="number"
              value={expiryDays}
              onChange={(e) => {
                setExpiryDays(e.target.value);
                if (errors.expiryDays) setErrors((prev) => ({ ...prev, expiryDays: '' }));
              }}
              placeholder="30"
              hint={
                expiryDays && parseInt(expiryDays) > 0
                  ? `หมดอายุประมาณ ${new Date(Date.now() + parseInt(expiryDays) * 86400000).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`
                  : 'ระบุจำนวนวันที่เก็บรักษา'
              }
              error={errors.expiryDays}
            />
            <Textarea
              label="หมายเหตุ"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น เหลือประมาณ 60%, ขวดใหม่ยังไม่เปิด"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={onBack}
          className="min-h-[44px] sm:min-h-0"
        >
          ยกเลิก
        </Button>
        <Button
          onClick={handleSubmit}
          isLoading={isSubmitting}
          disabled={!customerName || !productName || !quantity}
          icon={<Save className="h-4 w-4" />}
          className="min-h-[44px] sm:min-h-0"
        >
          บันทึกรายการฝากเหล้า
        </Button>
      </div>
    </div>
  );
}
