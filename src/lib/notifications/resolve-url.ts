/**
 * แปลง notification type + data → URL ที่ถูกต้อง
 *
 * ใช้ร่วมกันทั้ง NotificationCenter (bell popup) และ notifications page
 *
 * Route mapping (ตาม actual Next.js routes):
 *   deposit_confirmed, new_deposit, deposit_expiry → /deposit
 *   deposit_received → /bar-approval
 *   withdrawal_completed, withdrawal_request → /deposit/withdrawals
 *   approval_request, approval_result → /stock/approval
 *   explanation_submitted → /stock/explanation
 *   stock_alert → /stock
 *   borrow_request, borrow_approved → /borrow
 *   transfer_request, transfer_completed → /transfer
 *   hq_warehouse → /hq-warehouse
 *   promotion → /notifications
 */
export function resolveNotificationUrl(
  type: string | null,
  data?: Record<string, unknown> | null,
): string {
  // 1. If data.url is explicitly set, always prefer it
  if (data?.url && typeof data.url === 'string') {
    return data.url;
  }

  // 2. Map by notification type → correct route
  switch (type) {
    // ฝากเหล้า
    case 'deposit_confirmed':
    case 'new_deposit':
    case 'deposit_expiry':
      return '/deposit';

    // รอ bar ยืนยันรับเข้าระบบ
    case 'deposit_received':
      return '/bar-approval';

    // เบิกเหล้า
    case 'withdrawal_completed':
    case 'withdrawal_request':
      return '/deposit/withdrawals';

    // อนุมัติสต๊อก
    case 'approval_request':
    case 'approval_result':
      return '/stock/approval';

    // คำชี้แจง
    case 'explanation_submitted':
      return '/stock/explanation';

    // สต๊อก
    case 'stock_alert':
      return '/stock';

    // ยืมข้ามสาขา
    case 'borrow_request':
    case 'borrow_approved':
      return '/borrow';

    // โอนสินค้า
    case 'transfer_request':
    case 'transfer_completed':
      return '/transfer';

    // คลังกลาง
    case 'hq_warehouse':
      return '/hq-warehouse';

    // โปรโมชั่น
    case 'promotion':
      return '/notifications';

    default:
      return '/notifications';
  }
}
