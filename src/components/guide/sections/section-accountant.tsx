import { Card, CardTitle, CardSubtitle, MenuItem, TipBox, ImgPlaceholder } from '../manual-ui';

export function SectionAccountant() {
  return (
    <Card>
      <CardTitle icon="☰">Sidebar Menu — Accountant</CardTitle>

      <CardSubtitle>📌 หมวด &quot;หลัก&quot;</CardSubtitle>
      <MenuItem icon="📊" iconBg="bg-violet-500" name="ภาพรวม" desc="Dashboard สรุปข้อมูลทุกสาขา" path="/overview" />
      <MenuItem icon="💬" iconBg="bg-blue-500" name="แชท" desc="แชทภายใน" path="/chat" />

      <CardSubtitle>📦 หมวด &quot;คลังสินค้า&quot;</CardSubtitle>
      <MenuItem icon="💰" iconBg="bg-amber-500" name="ค่าคอมมิชชั่น" desc="ดูสรุปยอด ทำจ่าย จัดการ AE" path="/commission" />

      <CardSubtitle>📈 หมวด &quot;รายงาน&quot;</CardSubtitle>
      <MenuItem icon="📊" iconBg="bg-amber-500" name="รายงาน" desc="รายงานสรุปข้อมูลฝาก/เบิก/สต๊อก ทุกสาขา" path="/reports" />

      <ImgPlaceholder icon="🖥" name="img-20-accountant-sidebar.png" desc="Sidebar ของ Accountant แสดง 2 หมวด (หลัก + รายงาน)" />

      <TipBox>
        <strong>💡 หมายเหตุ:</strong> Accountant เข้าถึงข้อมูลทุกสาขาเหมือน Owner แต่เป็นแบบ &quot;อ่านอย่างเดียว&quot; ไม่สามารถแก้ไขข้อมูลได้
      </TipBox>
    </Card>
  );
}
