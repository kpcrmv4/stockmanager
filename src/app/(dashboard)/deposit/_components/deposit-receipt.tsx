'use client';

import type { ReceiptSettings } from '@/types/database';
import { formatThaiDate, formatNumber } from '@/lib/utils/format';

interface DepositData {
  deposit_code: string;
  customer_name: string;
  customer_phone: string | null;
  product_name: string;
  category: string | null;
  quantity: number;
  remaining_qty: number;
  table_number: string | null;
  expiry_date: string | null;
  created_at: string;
}

interface DepositReceiptProps {
  ref?: React.Ref<HTMLDivElement>;
  deposit: DepositData;
  storeName: string;
  receivedByName: string | null;
  settings: ReceiptSettings | null;
}

const DASHED_LINE = '--------------------------------';

export function DepositReceipt({
  ref,
  deposit,
  storeName,
  receivedByName,
  settings,
}: DepositReceiptProps) {
  return (
    <>
      <style>{`
        .deposit-receipt {
          display: none;
        }

        @media print {
          body * {
            visibility: hidden;
          }

          .deposit-receipt,
          .deposit-receipt * {
            visibility: visible;
          }

          .deposit-receipt {
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

      <div
        ref={ref}
        id="deposit-receipt"
        className="deposit-receipt"
      >
        {/* Store Name Header */}
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
          {storeName}
        </div>

        {/* Optional Header Text */}
        {settings?.header_text && (
          <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '4px' }}>
            {settings.header_text}
          </div>
        )}

        {/* Separator */}
        <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>

        {/* Receipt Title */}
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', margin: '4px 0' }}>
          ใบรับฝากเหล้า
        </div>

        {/* Deposit Code */}
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '18px', margin: '4px 0', letterSpacing: '1px' }}>
          {deposit.deposit_code}
        </div>

        {/* Separator */}
        <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>

        {/* Customer Info */}
        <div style={{ margin: '6px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>ชื่อลูกค้า:</span>
            <span style={{ fontWeight: 'bold' }}>{deposit.customer_name}</span>
          </div>
          {deposit.customer_phone && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>เบอร์โทร:</span>
              <span>{deposit.customer_phone}</span>
            </div>
          )}
          {deposit.table_number && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>โต๊ะ:</span>
              <span>{deposit.table_number}</span>
            </div>
          )}
        </div>

        {/* Product Info */}
        <div style={{ margin: '6px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>สินค้า:</span>
            <span style={{ fontWeight: 'bold' }}>{deposit.product_name}</span>
          </div>
          {deposit.category && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>หมวด:</span>
              <span>{deposit.category}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>จำนวน:</span>
            <span>{formatNumber(deposit.remaining_qty)} / {formatNumber(deposit.quantity)}</span>
          </div>
        </div>

        {/* Dates */}
        <div style={{ margin: '6px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>วันที่ฝาก:</span>
            <span>{formatThaiDate(deposit.created_at)}</span>
          </div>
          {deposit.expiry_date && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>วันหมดอายุ:</span>
              <span>{formatThaiDate(deposit.expiry_date)}</span>
            </div>
          )}
        </div>

        {/* Received By */}
        {receivedByName && (
          <div style={{ margin: '6px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>ผู้รับฝาก:</span>
              <span>{receivedByName}</span>
            </div>
          </div>
        )}

        {/* Separator */}
        <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>

        {/* Optional Footer Text */}
        {settings?.footer_text && (
          <div style={{ textAlign: 'center', fontSize: '11px', margin: '4px 0' }}>
            {settings.footer_text}
          </div>
        )}

        {/* Thank You */}
        <div style={{ textAlign: 'center', margin: '6px 0 4px' }}>
          ขอบคุณที่ใช้บริการ
        </div>
      </div>
    </>
  );
}

export function printReceipt() {
  window.print();
}
