'use client';

import { formatThaiShortDate } from '@/lib/utils/format';

interface DepositData {
  deposit_code: string;
  customer_name: string;
  product_name: string;
  expiry_date: string | null;
  created_at: string;
}

interface DepositLabelProps {
  deposit: DepositData;
  storeName: string;
}

export function DepositLabel({ deposit, storeName }: DepositLabelProps) {
  return (
    <>
      <style>{`
        .deposit-label {
          display: none;
        }

        @media print {
          /* Hide everything on the page except the label */
          body * {
            visibility: hidden;
          }

          .deposit-label,
          .deposit-label * {
            visibility: visible;
          }

          .deposit-label {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            width: 70mm;
            height: 40mm;
            margin: 0;
            padding: 2mm 3mm;
            border: 1px dashed #000;
            box-sizing: border-box;
            font-family: 'Sarabun', sans-serif;
            color: #000;
            background: #fff;
          }

          .deposit-label__store {
            text-align: center;
            font-size: 7pt;
            line-height: 1.2;
            margin-bottom: 1mm;
            color: #333;
          }

          .deposit-label__code {
            text-align: center;
            font-size: 16pt;
            font-weight: 700;
            line-height: 1.1;
            letter-spacing: 0.5px;
            margin-bottom: 1.5mm;
          }

          .deposit-label__row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            font-size: 7pt;
            line-height: 1.4;
          }

          .deposit-label__label {
            color: #555;
            flex-shrink: 0;
            margin-right: 1mm;
          }

          .deposit-label__value {
            font-weight: 500;
            text-align: right;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .deposit-label__divider {
            border: none;
            border-top: 0.5px solid #999;
            margin: 1mm 0;
          }

          @page {
            size: 70mm 40mm;
            margin: 0;
          }
        }
      `}</style>

      <div className="deposit-label" id="deposit-label">
        <div className="deposit-label__store">{storeName}</div>

        <div className="deposit-label__code">{deposit.deposit_code}</div>

        <hr className="deposit-label__divider" />

        <div className="deposit-label__row">
          <span className="deposit-label__label">ลูกค้า:</span>
          <span className="deposit-label__value">{deposit.customer_name}</span>
        </div>

        <div className="deposit-label__row">
          <span className="deposit-label__label">สินค้า:</span>
          <span className="deposit-label__value">{deposit.product_name}</span>
        </div>

        {deposit.expiry_date && (
          <div className="deposit-label__row">
            <span className="deposit-label__label">หมดอายุ:</span>
            <span className="deposit-label__value">
              {formatThaiShortDate(deposit.expiry_date)}
            </span>
          </div>
        )}

        <div className="deposit-label__row">
          <span className="deposit-label__label">วันที่ฝาก:</span>
          <span className="deposit-label__value">
            {formatThaiShortDate(deposit.created_at)}
          </span>
        </div>
      </div>
    </>
  );
}

export function printLabel() {
  window.print();
}
