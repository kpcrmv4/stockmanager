import { Card, CardTitle, Step, RolesBar, TipBox, ImgPlaceholder } from '../manual-ui';

export function SectionPrint() {
  return (
    <>
      <Card>
        <RolesBar roles={['owner', 'manager']} />
        <CardTitle icon="🖨">Print Server (เครื่องพิมพ์ใบเสร็จ)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">ระบบพิมพ์ใบเสร็จอัตโนมัติเมื่อมีการฝาก/เบิกเหล้า:</p>
        <ul className="mb-4 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>Thermal Printer 80mm</strong> — รองรับเครื่องพิมพ์ความร้อนทั่วไป</li>
          <li><strong>Print Queue</strong> — คิวพิมพ์อัตโนมัติ Real-time</li>
          <li><strong>Working Hours</strong> — ตั้งช่วงเวลาทำงานของเครื่องพิมพ์ได้</li>
          <li><strong>สัญญาณทำงาน</strong> — เครื่องพิมพ์ส่งสถานะให้ระบบทุก 60 วินาที → ระบบรู้ว่าออนไลน์อยู่หรือไม่</li>
        </ul>
      </Card>

      <Card>
        <RolesBar roles={['owner', 'manager']} />
        <CardTitle icon="⚙️">ติดตั้ง Print Server</CardTitle>
        <Step num={1} title="ไปที่ตั้งค่าสาขา">
          <p>เปิด <code>/settings/store/&#123;storeId&#125;</code> ของสาขาที่จะติดตั้ง</p>
        </Step>
        <Step num={2} title='กดปุ่ม "Setup Print Server"'>
          <p>ระบบสร้าง user บัญชีเครื่องพิมพ์ (<code>printer-&#123;store_code&#125;</code>) อัตโนมัติ + generate password + ดาวน์โหลด ZIP</p>
        </Step>
        <Step num={3} title="แตก ZIP บนเครื่อง PC">
          <p>เครื่อง PC ที่ต่อกับเครื่องพิมพ์ — Windows + Node.js + PowerShell</p>
        </Step>
        <Step num={4} title="รัน INSTALL.bat → START-PrintServer.bat">
          <p>เริ่มทำงาน — โปรแกรมตรวจคิวพิมพ์ทุก 10 วินาที และส่งสถานะกลับให้ระบบทุก 60 วินาที</p>
        </Step>
        <TipBox>
          <strong>🔁 Reset password เครื่องพิมพ์:</strong> กด &quot;Setup Print Server&quot; ซ้ำ → ระบบ reset password ของบัญชีเดิม + ดาวน์โหลด ZIP ใหม่ที่มี config ใหม่
        </TipBox>
        <ImgPlaceholder icon="🖨" name="img-43-print-station.png" desc="หน้า Print Station แสดง Print Queue + Printer Status" />
      </Card>

      <Card>
        <RolesBar roles={['owner', 'manager', 'bar', 'staff']} />
        <CardTitle icon="🟢">สถานะเครื่องพิมพ์ในทอปบาร์</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">
          ดูสถานะเครื่องพิมพ์ของสาขาปัจจุบัน <strong>โดยไม่ต้องเข้าหน้าตั้งค่า</strong> — ไอคอนเครื่องพิมพ์ในทอปบาร์ พร้อมจุดสี:
        </p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li>🟢 <strong>เขียว</strong> = ออนไลน์ (รับสัญญาณภายใน 2 นาทีล่าสุด)</li>
          <li>🟡 <strong>เหลือง</strong> = ไม่อัปเดต (รับสัญญาณล่าสุด 2-10 นาทีที่แล้ว)</li>
          <li>🔴 <strong>แดง</strong> = ออฟไลน์ (รับสัญญาณล่าสุดเกิน 10 นาที)</li>
          <li>⚪ <strong>เทา</strong> = ยังไม่เคยส่งสัญญาณ (เพิ่งติดตั้ง)</li>
        </ul>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
          ระบบ refresh สถานะอัตโนมัติทุก 45 วินาที (ไม่หนัก network)
        </p>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">
          <strong>คลิกไอคอน</strong> → เปิด panel แสดง:
        </p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li>สัญญาณล่าสุด, ชื่อเครื่องพิมพ์, จำนวนงานพิมพ์วันนี้, ชื่อเครื่อง PC ที่ติดตั้ง</li>
          <li><strong>งานล่าสุด 20 รายการ</strong> — เลื่อนดูประวัติได้ พร้อมสถานะ (รอ/กำลังพิมพ์/สำเร็จ/ผิดพลาด)</li>
          <li>ปุ่ม &quot;เปิดหน้าควบคุมเต็ม&quot; → ไป <code>/print-listener</code></li>
        </ul>
        <TipBox>
          <strong>📱 บนมือถือ:</strong> หน้าต่างจะเลื่อนขึ้นจากด้านล่างแทน dropdown
        </TipBox>
      </Card>

      <Card>
        <RolesBar roles={['owner']} />
        <CardTitle icon="🔒">บัญชีเครื่องพิมพ์ใน /users</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
          User ที่ชื่อขึ้นต้นด้วย <code>printer-</code> เป็นบัญชีระบบสำหรับเครื่องพิมพ์ — <strong>ห้ามแก้ไขจาก /users</strong>:
        </p>
        <ul className="ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li>ปุ่ม รีเซ็ตรหัส / ปิดบัญชี / สิทธิ์ จะถูกซ่อนอัตโนมัติ</li>
          <li>มีข้อความเตือน &quot;🔒 บัญชีระบบเครื่องพิมพ์ — จัดการผ่านหน้าตั้งค่าเครื่องพิมพ์&quot;</li>
          <li>หากต้องการ reset password เครื่องพิมพ์ ใช้ปุ่ม &quot;Setup Print Server&quot; ในหน้าตั้งค่าสาขาแทน</li>
        </ul>
      </Card>
    </>
  );
}
