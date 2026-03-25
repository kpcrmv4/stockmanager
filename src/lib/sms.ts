/**
 * SMS Utility — send-sms.in.th API
 *
 * Required env vars:
 *   SMS_API_KEY    — ApiKey from send-sms.in.th
 *   SMS_CLIENT_ID  — ClientId from send-sms.in.th
 *   SMS_SENDER_ID  — Approved Sender ID
 */

const SMS_API_URL = 'https://api.send-sms.in.th/api/v2/SendSMS';

interface SendSmsParams {
  to: string;
  message: string;
}

/**
 * Normalize Thai phone number to international format (66xxxxxxxxx)
 * Accepts: 09xxxxxxxx, 08xxxxxxxx, +66xxxxxxxxx, 66xxxxxxxxx
 */
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');

  if (cleaned.startsWith('+66')) {
    return cleaned.slice(1); // remove +
  }
  if (cleaned.startsWith('66') && cleaned.length === 11) {
    return cleaned;
  }
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return '66' + cleaned.slice(1);
  }
  return cleaned;
}

export async function sendSms({ to, message }: SendSmsParams): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.SMS_API_KEY;
  const clientId = process.env.SMS_CLIENT_ID;
  const senderId = process.env.SMS_SENDER_ID || 'StockMgr';

  if (!apiKey || !clientId) {
    console.warn('[SMS] Missing SMS_API_KEY or SMS_CLIENT_ID — skipping SMS');
    return { success: false, error: 'SMS credentials not configured' };
  }

  const normalizedPhone = normalizePhone(to);

  try {
    const res = await fetch(SMS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        SenderId: senderId,
        ApiKey: apiKey,
        ClientId: clientId,
        MobileNumbers: normalizedPhone,
        Message: message,
        Is_Unicode: true,
        Is_Flash: false,
      }),
    });

    const data = await res.json();

    if (data.ErrorCode === 0 || data.ErrorDescription === 'Success') {
      return { success: true };
    }

    console.error('[SMS] API error:', data);
    return { success: false, error: data.ErrorDescription || 'SMS send failed' };
  } catch (err) {
    console.error('[SMS] Network error:', err);
    return { success: false, error: 'Network error sending SMS' };
  }
}
