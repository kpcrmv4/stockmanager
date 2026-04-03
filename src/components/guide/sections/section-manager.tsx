import { Card, CardTitle, CardSubtitle, MenuItem, BottomNavPreview, ImgPlaceholder } from '../manual-ui';

export function SectionManager() {
  return (
    <>
      <Card>
        <CardTitle icon="☰">Sidebar Menu — Manager</CardTitle>

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

        <ImgPlaceholder icon="🖥" name="img-13-manager-sidebar.png" desc="Sidebar ของ Manager แสดง 3 หมวด" />
      </Card>

      <Card>
        <CardTitle icon="📱">Bottom Navigation — Manager (Mobile View)</CardTitle>
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
        <ImgPlaceholder icon="🏢" name="img-14-manager-store-overview.png" desc="Store Overview แสดง KPI สาขาที่ Manager ดูแล" />
      </Card>
    </>
  );
}
