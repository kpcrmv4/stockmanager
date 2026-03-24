'use client';

import { use } from 'react';
import { ChatRoomView } from '@/components/chat/chat-room-view';

interface Props {
  params: Promise<{ roomId: string }>;
}

export default function ChatRoomPage({ params }: Props) {
  const { roomId } = use(params);
  return <ChatRoomView roomId={roomId} />;
}
