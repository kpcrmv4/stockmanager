import { Card, CardTitle, CardSubtitle, MenuItem, TipBox, BottomNavPreview, ImgPlaceholder } from '../manual-ui';

export function SectionManager() {
  return (
    <>
      <Card>
        <CardTitle icon="☰">เมนูหลักของ Manager</CardTitle>

        <CardSubtitle>📌 หมวด &quot;หลัก&quot;</CardSubtitle>
        <MenuItem icon="📊" iconBg="bg-violet-500" name="ภาพรวม (Overview)" desc="Dashboard สรุปข้อมูลสาขาที่ดูแล" path="/overview" />
        <MenuItem icon="💬" iconBg="bg-blue-500" name="แชท" desc="แชทสาขา + Action Card" path="/chat" />

        <CardSubtitle>📦 หมวด &quot;คลังสินค้า&quot;</CardSubtitle>
        <MenuItem icon="📋" iconBg="bg-indigo-500" name="เช็คสต๊อก" desc="นับสต๊อก, อัปโหลด POS, เปรียบเทียบ" path="/stock" />
        <MenuItem icon="↔" iconBg="bg-blue-500" name="โอนสต๊อก" desc="โอนสินค้าระหว่างสาขา" path="/transfer" />
        <MenuItem icon="🔄" iconBg="bg-rose-500" name="ยืมสินค้า" desc="ยืมสินค้าระหว่างสาขา" path="/borrow" />
        <MenuItem icon="💰" iconBg="bg-amber-500" name="ค่าคอมมิชชั่น" desc="AE Commission & Bottle Commission — บันทึก สรุป ทำจ่าย" path="/commission" />

        <CardSubtitle>📈 หมวด &quot;รายงาน&quot;</CardSubtitle>
        <MenuItem icon="📊" iconBg="bg-amber-500" name="รายงาน" desc="รายงานสรุปข้อมูลสาขา" path="/reports" />

        <CardSubtitle>⚙ หมวด &quot;ระบบ&quot;</CardSubtitle>
        <MenuItem icon="👤" iconBg="bg-orange-500" name="จัดการผู้ใช้" desc="ดู/รีเซ็ตรหัสผ่านพนักงานในสาขา" path="/users" />
        <MenuItem icon="✉️" iconBg="bg-indigo-500" name="ลิงก์เชิญพนักงาน" desc="สร้างลิงก์ลงทะเบียน — Manager เชิญได้แค่ staff/bar" path="/users/invitations" />
        <MenuItem icon="⚙" iconBg="bg-gray-500" name="ตั้งค่าสาขา" desc="LINE config, แจ้งเตือน, เครื่องพิมพ์" path="/settings" />

        <ImgPlaceholder icon="🖥" name="img-13-manager-sidebar.png" desc="แถบเมนูของ Manager" />

        <TipBox>
          <strong>🔒 ขีดจำกัด Manager:</strong> ลิงก์เชิญสร้างได้แค่ตำแหน่ง staff/bar เท่านั้น (Owner เท่านั้นที่เชิญ accountant/manager/hq ได้)
        </TipBox>
      </Card>

      <Card>
        <CardTitle icon="📱">เมนูด้านล่างของ Manager (เมื่อใช้บนมือถือ)</CardTitle>
        <BottomNavPreview
          items={[
            { icon: '📋', label: 'สต๊อก', color: 'indigo' },
            { icon: '🍷', label: 'ฝาก/เบิก', color: 'emerald' },
            { icon: '📊', label: 'ภาพรวม', color: 'bg-violet-500', center: true },
            { icon: '💬', label: 'แชท', color: 'blue' },
            { icon: '🔔', label: 'แจ้งเตือน', color: 'rose' },
          ]}
        />
      </Card>

      <Card>
        <CardTitle icon="🏢">หน้า Store Overview (หน้าแรก Manager)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">Dashboard เฉพาะสาขาที่ Manager ดูแล:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li>สรุปยอดฝากเหล้า, เบิก, สต๊อกวันนี้</li>
          <li>รายการรออนุมัติ</li>
          <li>สถานะการเช็คสต๊อก</li>
          <li>งานค้างในสาขา</li>
        </ul>
        <ImgPlaceholder icon="🏢" name="img-14-manager-store-overview.png" desc="Store Overview" />
      </Card>
    </>
  );
}
