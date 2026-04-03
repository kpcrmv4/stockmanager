import { Card, CardTitle, CardSubtitle, Step, RolesBar, RoleTag, TipBox, WarnBox, TableWrap, Th, Td, ImgPlaceholder } from '../manual-ui';

export function SectionCommission() {
  return (
    <>
      {/* ── ภาพรวม ── */}
      <Card>
        <RolesBar roles={['owner', 'accountant', 'manager']} />
        <CardTitle icon="💰">ภาพรวมระบบค่าคอมมิชชั่น</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
          ระบบบันทึกและจัดการค่าคอมมิชชั่น 2 ประเภท:
        </p>

        <TableWrap>
          <thead>
            <tr><Th>ประเภท</Th><Th>คำอธิบาย</Th><Th>สูตรคำนวณ</Th></tr>
          </thead>
          <tbody>
            <tr>
              <Td><span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">AE Commission</span></Td>
              <Td>ค่าตอบแทน AE (Account Executive) ที่พาลูกค้ามา</Td>
              <Td><code className="text-xs">ยอดบิล &times; Cashback% &times; (1 &minus; หักภาษี%)</code></Td>
            </tr>
            <tr>
              <Td><span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-900 dark:text-rose-300">Bottle Commission</span></Td>
              <Td>ค่าเปิดขวดให้พนักงาน</Td>
              <Td><code className="text-xs">จำนวนขวด &times; ราคาต่อขวด</code></Td>
            </tr>
          </tbody>
        </TableWrap>

        <TipBox>
          <strong>ตัวอย่าง AE Commission:</strong> ยอดบิล 17,050 &times; 10% = ค่าคอม 1,705 บาท &rarr; หักภาษี 3% = 51.15 บาท &rarr; <strong>ยอดจ่ายสุทธิ = 1,653.85 บาท</strong>
        </TipBox>

        <TipBox>
          <strong>ตัวอย่าง Bottle Commission:</strong> 2 ขวด &times; 500 บาท = <strong>ยอดจ่ายสุทธิ 1,000 บาท</strong>
        </TipBox>
      </Card>

      {/* ── สิทธิ์การเข้าถึง ── */}
      <Card>
        <CardTitle icon="🔑">สิทธิ์การเข้าถึงตาม Role</CardTitle>
        <TableWrap>
          <thead>
            <tr><Th>Role</Th><Th>แท็บที่เห็น</Th><Th>สิทธิ์พิเศษ</Th></tr>
          </thead>
          <tbody>
            <tr><Td><RoleTag role="owner" /></Td><Td>ทั้งหมด 6 แท็บ</Td><Td>ลบรายการ, ทำจ่าย, จัดการ AE</Td></tr>
            <tr><Td><RoleTag role="accountant" /></Td><Td>ทั้งหมด 6 แท็บ</Td><Td>ลบรายการ, ทำจ่าย, จัดการ AE</Td></tr>
            <tr><Td><RoleTag role="manager" /></Td><Td>ทั้งหมด 6 แท็บ</Td><Td>ทำจ่าย, จัดการ AE</Td></tr>
          </tbody>
        </TableWrap>
      </Card>

      {/* ── แท็บ 1: สรุปยอด ── */}
      <Card>
        <CardTitle icon="📊">แท็บ &quot;สรุปยอด&quot; (Dashboard)</CardTitle>
        <RolesBar roles={['owner', 'accountant', 'manager']} />
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">เลือกเดือนแล้วดูสรุปยอดค่าคอมทั้งหมด:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>3 การ์ดสรุป</strong> — AE Commission, Bottle Commission, ยอดจ่ายรวม</li>
          <li><strong>รายชื่อ AE</strong> — แสดงจำนวนบิล, ยอดรวม, ค่าคอม, ภาษี, สุทธิ</li>
          <li><strong>รายชื่อ Bottle</strong> — แสดงจำนวนขวด, จำนวนรายการ, ยอดสุทธิ</li>
          <li><strong>Drill-down</strong> — กดแต่ละคนเพื่อดูรายบิล + ข้อมูลธนาคาร</li>
        </ul>
        <ImgPlaceholder icon="📊" name="img-comm-01-dashboard.png" desc="แท็บสรุปยอด แสดง 3 การ์ด + รายชื่อ AE พร้อมยอดรวม" />
        <ImgPlaceholder icon="🔍" name="img-comm-02-dashboard-drilldown.png" desc="Drill-down เมื่อกดชื่อ AE แสดงรายบิลทั้งหมด + ข้อมูลธนาคาร" />
      </Card>

      {/* ── แท็บ 2: บันทึก ── */}
      <Card>
        <CardTitle icon="📝">แท็บ &quot;บันทึก&quot; (Create Entry)</CardTitle>
        <RolesBar roles={['owner', 'accountant', 'manager']} />

        <CardSubtitle>บันทึก AE Commission</CardSubtitle>
        <Step num={1} title="เลือกประเภท &rarr; AE Commission">
          <p>กดปุ่มเลือกประเภทด้านบน</p>
        </Step>
        <Step num={2} title="ค้นหา/เลือก AE">
          <p>พิมพ์ชื่อ AE ในช่องค้นหา &rarr; เลือกจาก dropdown หรือกด + เพื่อเพิ่ม AE ใหม่</p>
        </Step>
        <Step num={3} title="กรอกข้อมูลบิล">
          <p>วันที่บิล, เลขใบเสร็จ, เบอร์โต๊ะ, ถ่ายรูปบิล (กดปุ่มกล้อง หรือ เลือกรูป)</p>
        </Step>
        <Step num={4} title="กรอกยอดรวม (ก่อน VAT/SVC)">
          <p>ระบบคำนวณอัตโนมัติ: Cashback% (ค่าเริ่มต้น 10%) และ หักภาษี% (ค่าเริ่มต้น 3%) — ปรับได้</p>
        </Step>
        <Step num={5} title='กด "บันทึกคอมมิชชั่น"'>
          <p>ระบบบันทึก + แสดง preview ยอดสุทธิก่อนกดบันทึก</p>
        </Step>
        <ImgPlaceholder icon="📝" name="img-comm-03-form-ae.png" desc="ฟอร์มบันทึก AE Commission พร้อม preview คำนวณยอด" />

        <CardSubtitle>บันทึก Bottle Commission</CardSubtitle>
        <Step num={1} title="เลือกประเภท &rarr; Bottle Commission">
          <p>กดปุ่มเลือกประเภทด้านบน</p>
        </Step>
        <Step num={2} title="เลือกพนักงาน (ถ้ามี)">
          <p>เลือกจาก dropdown</p>
        </Step>
        <Step num={3} title="กรอกจำนวนขวด + ราคาต่อขวด">
          <p>ค่าเริ่มต้น: 1 ขวด &times; 500 บาท</p>
        </Step>
        <Step num={4} title='กด "บันทึกคอมมิชชั่น"'>
          <p>ระบบบันทึกเรียบร้อย</p>
        </Step>
        <ImgPlaceholder icon="🍾" name="img-comm-04-form-bottle.png" desc="ฟอร์มบันทึก Bottle Commission" />

        <CardSubtitle>เพิ่ม AE ใหม่ (Quick Add)</CardSubtitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">กดปุ่ม + ข้างช่องค้นหา AE เพื่อเพิ่ม AE ใหม่:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ชื่อ AE</strong> (จำเป็น)</li>
          <li>ชื่อเล่น, เบอร์โทร</li>
          <li>ธนาคาร, เลขบัญชี, ชื่อบัญชี</li>
          <li>หมายเหตุ</li>
        </ul>
        <ImgPlaceholder icon="👤" name="img-comm-05-quick-add-ae.png" desc="ฟอร์ม Quick Add AE พร้อมข้อมูลธนาคาร" />

        <WarnBox>
          <strong>AE Profiles เป็นข้อมูลกลาง</strong> — ใช้ร่วมกันทุกสาขา เพิ่มครั้งเดียวใช้ได้ทุกที่
        </WarnBox>
      </Card>

      {/* ── แท็บ 3: รายการ ── */}
      <Card>
        <CardTitle icon="📋">แท็บ &quot;รายการ&quot; (Entry List)</CardTitle>
        <RolesBar roles={['owner', 'accountant', 'manager']} />
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">แสดงรายการค่าคอมทั้งหมดของเดือนที่เลือก:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>กรองได้</strong> — เดือน + ประเภท (AE / Bottle / ทั้งหมด)</li>
          <li><strong>Badge สถานะ</strong> — <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">จ่ายแล้ว</span> หรือ <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-600">ยังไม่จ่าย</span></li>
          <li><strong>ดูรูปบิล</strong> — กดไอคอนรูปภาพ</li>
          <li><strong>ลบรายการ</strong> — เฉพาะ Owner/Accountant และต้องเป็นรายการที่ยังไม่จ่ายเท่านั้น</li>
        </ul>
        <ImgPlaceholder icon="📋" name="img-comm-06-entry-list.png" desc="รายการค่าคอม แสดง Badge จ่ายแล้ว/ยังไม่จ่าย + ปุ่มดูรูปบิล" />
      </Card>

      {/* ── แท็บ 4: ทำจ่าย ── */}
      <Card>
        <CardTitle icon="💳">แท็บ &quot;ทำจ่าย&quot; (Payment)</CardTitle>
        <RolesBar roles={['owner', 'accountant', 'manager']} />

        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">ระบบจ่ายค่าคอมมิชชั่นรายเดือน:</p>

        <CardSubtitle>หน้าจอหลัก</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>2 การ์ดสรุป</strong> — ค่าคอมรวมเดือนนี้ + ยอดค้างจ่าย</li>
          <li><strong>AE ค้างจ่าย</strong> — รายชื่อ + จำนวนบิล + ข้อมูลธนาคาร + ยอด + ปุ่ม &quot;จ่าย&quot;</li>
          <li><strong>Bottle ค้างจ่าย</strong> — รายชื่อ + จำนวนขวด + ยอด + ปุ่ม &quot;จ่าย&quot;</li>
        </ul>
        <ImgPlaceholder icon="💳" name="img-comm-07-payment-main.png" desc="หน้าทำจ่าย แสดงรายชื่อ AE/Bottle ที่ค้างจ่าย + 2 การ์ดสรุป" />

        <CardSubtitle>ขั้นตอนจ่ายเงิน</CardSubtitle>
        <Step num={1} title='กดปุ่ม "จ่าย" ข้างชื่อ AE/พนักงาน'>
          <p>ระบบแสดงจำนวนรายการ + ยอดจ่ายรวม</p>
        </Step>
        <Step num={2} title="ถ่ายรูปสลิป / เลือกรูปสลิปโอนเงิน">
          <p>กดปุ่มกล้อง (เปิดกล้องถ่ายสลิป) หรือ กดเลือกรูป (จากแกลเลอรี่)</p>
        </Step>
        <Step num={3} title="ใส่หมายเหตุ (ถ้ามี)">
          <p>บันทึกข้อความเพิ่มเติม</p>
        </Step>
        <Step num={4} title='กด "บันทึกจ่าย"'>
          <p>ระบบผูกรายการทั้งหมดของเดือนกับ Payment &rarr; สถานะเปลี่ยนเป็น &quot;จ่ายแล้ว&quot;</p>
        </Step>
        <ImgPlaceholder icon="📸" name="img-comm-08-payment-form.png" desc="ฟอร์มจ่ายเงิน แสดงยอดจ่าย + ช่องแนบสลิป + หมายเหตุ" />

        <CardSubtitle>ดูรายละเอียด / ยกเลิกการจ่าย</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ดูรายละเอียด</strong> — กดไอคอนตา: เห็นสลิป + ตารางรายการที่จ่าย</li>
          <li><strong>ยกเลิก</strong> — กดไอคอน X &rarr; ใส่เหตุผล &rarr; ยืนยัน</li>
          <li>เมื่อยกเลิก รายการทั้งหมดจะกลับเป็น &quot;ยังไม่จ่าย&quot; สามารถทำจ่ายใหม่ได้</li>
        </ul>
        <ImgPlaceholder icon="📄" name="img-comm-09-payment-detail.png" desc="Modal รายละเอียดการจ่าย แสดงสลิป + ตารางรายการ" />

        <WarnBox>
          <strong>การยกเลิกการจ่าย</strong> จะปลดล็อกรายการทั้งหมดที่ผูกอยู่ &mdash; กลับมาจ่ายใหม่ได้ แต่สลิปเก่าจะถูกเก็บบันทึกไว้ในประวัติ
        </WarnBox>
      </Card>

      {/* ── แท็บ 5: ประวัติ ── */}
      <Card>
        <CardTitle icon="📜">แท็บ &quot;ประวัติ&quot; (Payment History)</CardTitle>
        <RolesBar roles={['owner', 'accountant', 'manager']} />
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">ดูประวัติการจ่ายค่าคอมย้อนหลัง:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>เลือกปี</strong> — ย้อนหลัง 5 ปี (แสดงเป็น พ.ศ.)</li>
          <li><strong>สรุปยอด</strong> — จ่ายแล้วทั้งปี + ยกเลิกทั้งปี</li>
          <li><strong>จัดกลุ่มตามเดือน</strong> — แต่ละเดือนแสดงรายการจ่ายทั้งหมด</li>
          <li><strong>Badge สถานะ</strong> — จ่ายแล้ว (เขียว) / ยกเลิก (แดง + แสดงเหตุผล)</li>
          <li><strong>ดูรายละเอียด</strong> — กดไอคอนตาเพื่อดูสลิป + รายการที่ผูก</li>
        </ul>
        <ImgPlaceholder icon="📜" name="img-comm-10-history.png" desc="แท็บประวัติ แสดงรายการจ่ายจัดกลุ่มตามเดือน + Badge สถานะ" />
      </Card>

      {/* ── แท็บ 6: จัดการ AE ── */}
      <Card>
        <CardTitle icon="👥">แท็บ &quot;จัดการ AE&quot; (AE Management)</CardTitle>
        <RolesBar roles={['owner', 'accountant', 'manager']} />
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">จัดการข้อมูล AE (Account Executive):</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ค้นหา</strong> — ค้นหาด้วยชื่อ, ชื่อเล่น, เบอร์โทร</li>
          <li><strong>กรอง</strong> — Toggle แสดง AE ที่ปิดใช้งานแล้ว</li>
          <li><strong>เพิ่ม AE ใหม่</strong> — ชื่อ, ชื่อเล่น, เบอร์โทร, ธนาคาร, เลขบัญชี, ชื่อบัญชี, หมายเหตุ</li>
          <li><strong>แก้ไข</strong> — กดไอคอน Edit เพื่อแก้ข้อมูล + เปิด/ปิดใช้งาน</li>
        </ul>
        <ImgPlaceholder icon="👥" name="img-comm-11-ae-list.png" desc="รายชื่อ AE แสดงข้อมูลธนาคาร + ปุ่มแก้ไข" />
        <ImgPlaceholder icon="📝" name="img-comm-12-ae-form.png" desc="ฟอร์มเพิ่ม/แก้ไข AE พร้อมข้อมูลธนาคารครบทุกช่อง" />

        <TipBox>
          <strong>AE ไม่สามารถลบได้</strong> — ทำได้แค่ปิดใช้งาน (is_active = false) เพื่อไม่ให้แสดงใน dropdown ตอนบันทึกค่าคอม
        </TipBox>
      </Card>

      {/* ── Flow การทำงานหลัก ── */}
      <Card>
        <CardTitle icon="🔄">Flow การทำงานหลัก</CardTitle>
        <TableWrap>
          <thead>
            <tr><Th>ขั้นตอน</Th><Th>ผู้ดำเนินการ</Th><Th>รายละเอียด</Th></tr>
          </thead>
          <tbody>
            <tr><Td>1. ถ่ายรูปบิล</Td><Td><RoleTag role="manager" /> / <RoleTag role="accountant" /></Td><Td>ถ่ายรูปบิลจากกล้อง หรือเลือกรูปจากแกลเลอรี่</Td></tr>
            <tr><Td>2. บันทึกค่าคอม</Td><Td><RoleTag role="manager" /> / <RoleTag role="accountant" /></Td><Td>เลือก AE, กรอกยอดบิล, ระบบคำนวณอัตโนมัติ</Td></tr>
            <tr><Td>3. ตรวจสอบรายการ</Td><Td><RoleTag role="accountant" /> / <RoleTag role="owner" /></Td><Td>ดูสรุปยอดรายเดือน + ตรวจรายการทั้งหมด</Td></tr>
            <tr><Td>4. ทำจ่าย</Td><Td><RoleTag role="accountant" /> / <RoleTag role="owner" /></Td><Td>กด &quot;จ่าย&quot; + แนบสลิปโอนเงิน</Td></tr>
            <tr><Td>5. สถานะเปลี่ยน</Td><Td>ระบบ</Td><Td>รายการทั้งหมดเปลี่ยนเป็น &quot;จ่ายแล้ว&quot;</Td></tr>
          </tbody>
        </TableWrap>
        <ImgPlaceholder icon="🔄" name="img-comm-13-flow-diagram.png" desc="Diagram Flow: พนักงานบันทึก &rarr; บัญชีตรวจสอบ &rarr; ทำจ่าย &rarr; เสร็จ" />
      </Card>

      {/* ── Audit Log ── */}
      <Card>
        <CardTitle icon="📝">บันทึกการตรวจสอบ (Audit Log)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">ทุกการกระทำในระบบคอมมิชชั่นถูกบันทึกอัตโนมัติ:</p>
        <TableWrap>
          <thead>
            <tr><Th>การกระทำ</Th><Th>คำอธิบาย</Th></tr>
          </thead>
          <tbody>
            <tr><Td>บันทึกคอมมิชชั่น</Td><Td>สร้างรายการค่าคอมใหม่</Td></tr>
            <tr><Td>ลบคอมมิชชั่น</Td><Td>ลบรายการค่าคอม (เฉพาะที่ยังไม่จ่าย)</Td></tr>
            <tr><Td>จ่ายค่าคอมมิชชั่น</Td><Td>บันทึกการจ่ายเงิน + ผูกรายการทั้งหมด</Td></tr>
            <tr><Td>ยกเลิกจ่ายค่าคอม</Td><Td>ยกเลิกการจ่ายเงิน + ปลดล็อกรายการ</Td></tr>
            <tr><Td>เพิ่ม AE ใหม่</Td><Td>สร้างข้อมูล AE ใหม่</Td></tr>
            <tr><Td>แก้ไขข้อมูล AE</Td><Td>อัปเดตข้อมูล AE</Td></tr>
          </tbody>
        </TableWrap>
      </Card>
    </>
  );
}
