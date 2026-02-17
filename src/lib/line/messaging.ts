const LINE_API_URL = 'https://api.line.me/v2/bot/message';

interface LineMessage {
  type: string;
  text?: string;
  altText?: string;
  contents?: Record<string, unknown>;
}

export async function pushMessage(to: string, messages: LineMessage[]) {
  const response = await fetch(`${LINE_API_URL}/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LINE API error: ${error}`);
  }
}

export async function replyMessage(replyToken: string, messages: LineMessage[]) {
  const response = await fetch(`${LINE_API_URL}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LINE API error: ${error}`);
  }
}

export async function getLineProfile(userId: string) {
  const response = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) return null;
  return response.json() as Promise<{
    userId: string;
    displayName: string;
    pictureUrl?: string;
    statusMessage?: string;
  }>;
}

export async function verifyLineAccessToken(accessToken: string) {
  const response = await fetch(
    `https://api.line.me/oauth2/v2.1/verify?access_token=${accessToken}`
  );

  if (!response.ok) return null;
  return response.json() as Promise<{
    scope: string;
    client_id: string;
    expires_in: number;
  }>;
}

export async function getLineProfileFromToken(accessToken: string) {
  const response = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;
  return response.json() as Promise<{
    userId: string;
    displayName: string;
    pictureUrl?: string;
  }>;
}
