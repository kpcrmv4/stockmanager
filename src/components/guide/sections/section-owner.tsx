import { Card, CardTitle, CardSubtitle, MenuItem, TipBox, ImgPlaceholder, Step, BottomNavPreview } from '../manual-ui';

export function SectionOwner() {
  return (
    <>
      <Card>
        <CardTitle icon="☰">เมนูหลักของ Owner</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">Owner เห็นเมนูทั้งหมดในแถบเมนูซ้าย แบ่งเป็น 5 หมวด:</p>

        <CardSubtitle>📌 หมวด &quot;หลัก&quot;</CardSubtitle>
        <MenuItem icon="📊" iconBg="bg-violet-500" name="ภาพรวม (Overview)" desc="Dashboard แสดง KPI ทุกสาขา, สรุปยอด, กิจกรรมล่าสุด" path="/overview" />
        <MenuItem icon="💬" iconBg="bg-blue-500" name="แชท (Chat)" desc="แชทภายในสาขา, Action Card, สรุปรายวัน" path="/chat" />

        <CardSubtitle>📦 หมวด &quot;คลังสินค้า&quot;</CardSubtitle>
        <MenuItem icon="📋" iconBg="bg-indigo-500" name="เช็คสต๊อก" desc="ดูผลเช็คสต๊อก, อนุมัติคำชี้แจง" path="/stock" />
        <MenuItem icon="🍷" iconBg="bg-emerald-500" name="ฝาก/เบิกเหล้า" desc="จัดการฝากเหล้า, เบิก, ดูสถานะทั้งหมด" path="/deposit" />
        <MenuItem icon="↔" iconBg="bg-blue-500" name="โอนสต๊อก" desc="โอนสินค้าระหว่างสาขา/คลังกลาง" path="/transfer" />
        <MenuItem icon="🔄" iconBg="bg-rose-500" name="ยืมสินค้า" desc="ยืมสินค้าระหว่างสาขา" path="/borrow" />
        <MenuItem icon="🏢" iconBg="bg-teal-500" name="คลังกลาง" desc="จัดการคลังสินค้ากลาง" path="/hq-warehouse" />
        <MenuItem icon="💰" iconBg="bg-amber-500" name="ค่าคอมมิชชั่น" desc="AE Commission & Bottle Commission — บันทึก สรุป ทำจ่าย" path="/commission" />

        <CardSubtitle>📈 หมวด &quot;รายงาน&quot;</CardSubtitle>
        <MenuItem icon="📊" iconBg="bg-amber-500" name="รายงาน" desc="รายงานสรุปข้อมูลฝาก/เบิก/สต๊อก" path="/reports" />
        <MenuItem icon="🔍" iconBg="bg-cyan-500" name="ตรวจสอบกิจกรรม" desc="Audit Log ดูประวัติการเปลี่ยนแปลงทั้งหมด" path="/activity" />

        <CardSubtitle>📈 หมวด &quot;วิเคราะห์&quot; (เฉพาะ Owner)</CardSubtitle>
        <MenuItem icon="🏆" iconBg="bg-amber-500" name="ประสิทธิภาพพนักงาน" desc="Ranking, กราฟ trend, เปรียบเทียบ" path="/performance/staff" />
        <MenuItem icon="⚖" iconBg="bg-indigo-500" name="เปรียบเทียบสาขา" desc="KPI ข้ามสาขา, Radar Chart" path="/performance/stores" />
        <MenuItem icon="⚡" iconBg="bg-rose-500" name="สถานะงาน Real-time" desc="งานค้าง, workload, alert" path="/performance/operations" />
        <MenuItem icon="📈" iconBg="bg-emerald-500" name="วิเคราะห์ลูกค้า" desc="Top customers, พฤติกรรม, retention" path="/performance/customers" />

        <CardSubtitle>⚙ หมวด &quot;ระบบ&quot;</CardSubtitle>
        <MenuItem icon="📣" iconBg="bg-pink-500" name="ประกาศภายใน" desc="ประกาศสำหรับพนักงาน (ลูกค้าใช้ LIFF แยก)" path="/announcements" />
        <MenuItem icon="👤" iconBg="bg-orange-500" name="จัดการผู้ใช้" desc="เพิ่ม/แก้ไข, รีเซ็ตรหัสผ่าน, กรองตามสาขา/ตำแหน่ง" path="/users" />
        <MenuItem icon="✉️" iconBg="bg-indigo-500" name="ลิงก์เชิญพนักงาน" desc="สร้าง/ปิดลิงก์ลงทะเบียน — กำหนดตำแหน่ง+สาขาต่อลิงก์" path="/users/invitations" />
        <MenuItem icon="⚙" iconBg="bg-gray-500" name="ตั้งค่า" desc="ตั้งค่าสาขา, LINE, การแจ้งเตือน" path="/settings" />

        <ImgPlaceholder icon="🖥" name="img-05-owner-sidebar.png" desc="แถบเมนูของ Owner แสดงเมนู 5 หมวด" />
      </Card>

      <Card>
        <CardTitle icon="📱">เมนูด้านล่างของ Owner (เมื่อใช้บนมือถือ)</CardTitle>
        <BottomNavPreview
          items={[
            { icon: '📋', label: 'สต๊อก', color: 'indigo' },
            { icon: '🍷', label: 'ฝาก/เบิก', color: 'emerald' },
            { icon: '📊', label: 'ภาพรวม', color: 'bg-violet-500', center: true },
            { icon: '💬', label: 'แชท', color: 'blue' },
            { icon: '📖', label: 'คู่มือ', color: 'cyan' },
          ]}
        />
        <TipBox>
          <strong>💡 หมายเหตุ:</strong> เมนูระบบ (ผู้ใช้/ลิงก์เชิญ/ตั้งค่า/ประกาศ) ในมือถือเข้าโดยกดปุ่ม ☰ (ขีด 3 ขีด) มุมซ้ายบนเพื่อเปิดเมนูสไลด์
        </TipBox>
      </Card>

      <Card>
        <CardTitle icon="📊">หน้า Overview (หน้าแรก Owner)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">Dashboard ภาพรวมแสดง:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>Summary Cards</strong> — จำนวนสาขา, ยอดฝากรวม, งานรออนุมัติ, แจ้งเตือนสต๊อก พร้อม Trend %</li>
          <li><strong>สถานะแต่ละสาขา</strong> — การ์ดแยกแต่ละสาขาแสดงงานค้าง/ปัญหา เรียงสาขาที่มีปัญหามากสุดไว้บนสุด</li>
          <li><strong>การ์ด HQ (คลังกลาง)</strong> — แสดงเฉพาะ &quot;รอรับโอนจากสาขา&quot;</li>
          <li><strong>Module Cards</strong> — ทางลัดไปยังระบบหลัก</li>
          <li><strong>Recent Activity</strong> — กิจกรรมล่าสุดของระบบ</li>
        </ul>
        <ImgPlaceholder icon="📊" name="img-07-owner-overview.png" desc="หน้า Overview ของ Owner" />
      </Card>

      <Card>
        <CardTitle icon="👤">จัดการผู้ใช้ (/users)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">ในหน้า <code>/users</code> Owner ทำได้:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ดูรายชื่อพนักงาน</strong> — แสดงตำแหน่ง, สาขาที่สังกัด, เข้าใช้ครั้งล่าสุดเมื่อกี่นาที/ชั่วโมง/วัน</li>
          <li><strong>กรองข้อมูล</strong> — ค้นหาด้วย username/ชื่อ + กรองตามสาขา + กรองตามตำแหน่ง</li>
          <li><strong>เปิด/ปิดบัญชี</strong> — ปุ่ม UserX/UserCheck</li>
          <li><strong>จัดการสิทธิ์</strong> — ปุ่ม Shield → /users/[id]/permissions</li>
          <li><strong>🔑 รีเซ็ตรหัสผ่าน</strong> — ตั้งใหม่เป็น <code>123456</code> ทันที (ดูการ์ดถัดไป)</li>
          <li><strong>บัญชี Print Server</strong> — เห็นในรายชื่อแต่กดอะไรไม่ได้ จัดการผ่านหน้าตั้งค่าเครื่องพิมพ์เท่านั้น</li>
        </ul>
        <ImgPlaceholder icon="👤" name="img-08-user-management.png" desc="หน้าจัดการผู้ใช้ พร้อม filter สาขา + ตำแหน่ง" />
      </Card>

      <Card>
        <CardTitle icon="🔑">รีเซ็ตรหัสผ่านพนักงาน</CardTitle>
        <Step num={1} title="ที่ /users กดปุ่ม 🔑 ของ user ที่ต้องการ">
          <p>โผล่ modal ยืนยันการรีเซ็ต</p>
        </Step>
        <Step num={2} title="ยืนยันรีเซ็ต">
          <p>ระบบเปลี่ยนรหัสผ่านเป็น <code className="font-mono">123456</code> และตั้ง flag &quot;ต้องเปลี่ยนรหัส&quot;</p>
        </Step>
        <Step num={3} title="แจ้งพนักงาน">
          <p>บอกว่ารหัสใหม่คือ <code>123456</code> ให้รีบเปลี่ยนหลังเข้าสู่ระบบ</p>
        </Step>
        <TipBox>
          <strong>🔒 ปลอดภัย:</strong> เมื่อพนักงานเข้าสู่ระบบด้วยรหัส default จะเห็น banner สีเหลืองทุกหน้า บังคับให้รีบเปลี่ยน → คลิก banner หรือ User Menu → &quot;เปลี่ยนรหัสผ่าน&quot;
        </TipBox>
      </Card>

      <Card>
        <CardTitle icon="✉️">ลิงก์เชิญพนักงาน (/users/invitations)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">วิธีใหม่ในการรับพนักงานเข้าระบบ — แทนที่ &quot;รหัสลงทะเบียน&quot; แบบเก่า:</p>
        <Step num={1} title="กด &quot;สร้างลิงก์เชิญ&quot;">
          <p>เลือก <strong>สาขา</strong> + <strong>ตำแหน่ง</strong> (staff/bar/manager/accountant/hq) + หมายเหตุ (เช่น &quot;เชิญน้องโจ บาร์ Baccarat&quot;)</p>
        </Step>
        <Step num={2} title="คัดลอกลิงก์">
          <p>กดไอคอน 📋 → ได้ URL <code>https://[domain]/invite/&#123;token&#125;</code></p>
        </Step>
        <Step num={3} title="ส่งให้พนักงาน">
          <p>ผ่าน LINE/SMS/อีเมล — พนักงานเปิดลิงก์ กรอก username/password/ชื่อแสดง → เข้าระบบได้ทันที</p>
        </Step>
        <Step num={4} title="ปิด/ลบลิงก์เมื่อไม่ใช้">
          <p>กดปุ่มสลับเป็น &quot;ปิด&quot; (ลิงก์ใช้ไม่ได้แต่ยังเก็บไว้) หรือกด 🗑️ ลบทิ้ง</p>
        </Step>
        <TipBox>
          <strong>💡 ตัวเลข &quot;ใช้แล้ว&quot;:</strong> นับจำนวนคนที่ใช้ลิงก์เดียวกัน — ลิงก์เดียวลงทะเบียนได้หลายคน เปิด-ปิดได้เพื่อควบคุม
        </TipBox>
      </Card>

      <Card>
        <CardTitle icon="🏆">Performance Analytics (เฉพาะ Owner)</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">ระบบวิเคราะห์ประสิทธิภาพเชิงลึก 4 มุมมอง:</p>

        <CardSubtitle>1. ประสิทธิภาพพนักงาน</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li>Ranking พนักงาน: งานสำเร็จ, เวลาเฉลี่ย, อัตรา timeout</li>
          <li>กราฟ daily trend ต่อคน</li>
          <li>Drill-down ดูรายละเอียดแต่ละคน</li>
        </ul>

        <CardSubtitle>2. เปรียบเทียบสาขา</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li>Side-by-side KPI ทุกสาขา + Radar Chart</li>
          <li>Ranking สาขาตาม KPI</li>
        </ul>

        <CardSubtitle>3. สถานะงาน Real-time</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li>Live view: งานค้าง/กำลังทำ/เกินเวลา</li>
          <li>Alert เมื่องานค้างนานผิดปกติ</li>
        </ul>

        <CardSubtitle>4. วิเคราะห์ลูกค้า</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li>Top customers by ความถี่และมูลค่า</li>
          <li>Customer retention &amp; expiry rates</li>
        </ul>
      </Card>
    </>
  );
}
