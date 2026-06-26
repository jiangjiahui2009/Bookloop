import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';

export default function ChatWindow({ messages, typing }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50" style={{ paddingTop: '32px', paddingBottom: '32px' }}>
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <div className="text-base font-medium mb-1.5">群聊</div>
          <div className="text-sm">你的书友们都在，随时开聊</div>
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} msg={msg} />
      ))}

      {typing && (
        <div className="flex items-start" style={{ gap: '16px', paddingLeft: '10px', paddingRight: '32px', marginBottom: '20px' }}>
          <div className="w-10 h-10 rounded-md bg-gray-200 flex items-center justify-center shrink-0">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
          <div className="text-gray-400 text-sm px-4 py-3">
            书友们正在思考...
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
