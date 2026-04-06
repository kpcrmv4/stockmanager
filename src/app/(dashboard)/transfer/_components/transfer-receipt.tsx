'use client';

import { formatThaiDateTime, formatNumber } from '@/lib/utils/format';

interface TransferItem {
  product_name: string;
  customer_name: string | null;
  deposit_code: string | null;
  quantity: number;
  remaining_percent?: number | null;
  category: string | null;
}

interface TransferReceiptProps {
  transferCode: string;
  storeName: string;
  items: TransferItem[];
  submittedByName: string;
  createdAt: string;
  notes?: string | null;
}

const DASHED_LINE = '--------------------------------';

export function TransferReceipt({
  transferCode,
  storeName,
  items,
  submittedByName,
  createdAt,
  notes,
}: TransferReceiptProps) {
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      <style>{`
        .transfer-receipt {
          display: none;
        }

        @media print {
          body * {
            visibility: hidden;
          }

          .transfer-receipt,
          .transfer-receipt * {
            visibility: visible;
          }

          .transfer-receipt {
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            width: 302px;
            max-width: 302px;
            padding: 8px 4px;
            margin: 0;
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            line-height: 1.4;
            color: #000;
            background: #fff;
          }
        }
      `}</style>

      <div id="transfer-receipt" className="transfer-receipt">
        {/* Store Name Header */}
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
          {storeName}
        </div>

        <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>

        {/* Title */}
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', margin: '4px 0' }}>
          ใบนำส่งเหล้าคลังกลาง
        </div>

        {/* Transfer Code */}
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '18px', margin: '4px 0', letterSpacing: '1px' }}>
          {transferCode}
        </div>

        <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>

        {/* Info */}
        <div style={{ margin: '6px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>วันที่:</span>
            <span>{formatThaiDateTime(createdAt)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>สาขา:</span>
            <span style={{ fontWeight: 'bold' }}>{storeName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>จำนวนรวม:</span>
            <span style={{ fontWeight: 'bold' }}>{formatNumber(totalQty)} รายการ ({items.length} ขวด)</span>
          </div>
        </div>

        <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>

        {/* Items */}
        <div style={{ margin: '6px 0' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>รายการ:</div>
          {items.map((item, idx) => (
            <div key={idx} style={{ marginBottom: '4px', paddingBottom: '4px', borderBottom: idx < items.length - 1 ? '1px dotted #ccc' : 'none' }}>
              <div style={{ fontWeight: 'bold' }}>
                {idx + 1}. {item.product_name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span>{item.customer_name || '-'}</span>
                <span>{item.deposit_code || ''}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span>จำนวน: {formatNumber(item.quantity)}</span>
                {item.category && <span>({item.category})</span>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>

        {/* Notes */}
        {notes && (
          <div style={{ margin: '6px 0', fontSize: '11px' }}>
            <span>หมายเหตุ: </span>
            <span>{notes}</span>
          </div>
        )}

        {/* Signatures */}
        <div style={{ margin: '16px 0 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>ผู้นำส่ง:</span>
            <span style={{ fontWeight: 'bold' }}>{submittedByName}</span>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <span>ลงชื่อ: </span>
            <span style={{ borderBottom: '1px solid #000', display: 'inline-block', width: '180px' }}>
              &nbsp;
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>ผู้รับ (HQ):</span>
            <span>_______________</span>
          </div>
          <div style={{ marginBottom: '4px' }}>
            <span>ลงชื่อ: </span>
            <span style={{ borderBottom: '1px solid #000', display: 'inline-block', width: '180px' }}>
              &nbsp;
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: '11px', margin: '4px 0' }}>
          เอกสารนี้ใช้เป็นหลักฐานการนำส่งเหล้า
        </div>
      </div>
    </>
  );
}

export function printTransferReceipt() {
  window.print();
}
