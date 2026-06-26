export default function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div className="message-bubble flex justify-end" style={{ paddingLeft: '32px', paddingRight: '10px', marginBottom: '20px' }}>
        <div className="max-w-[70%] bg-[#95ec69] text-gray-900 rounded-2xl rounded-br-md text-[14px] leading-relaxed shadow-sm" style={{ padding: '12px 20px' }}>
          {msg.content}
        </div>
      </div>
    );
  }

  // 书的回复
  return (
    <div className="message-bubble flex" style={{ gap: '16px', paddingLeft: '10px', paddingRight: '32px', marginBottom: '20px' }}>
      {/* 头像 */}
      <div
        className="rounded-xl flex items-center justify-center text-lg shrink-0 shadow-sm"
        style={{ width: '40px', height: '40px', backgroundColor: msg.color || '#999' }}
        title={msg.sender}
      >
        {msg.emoji || '📖'}
      </div>

      {/* 消息内容 */}
      <div className="max-w-[68%]">
        <div className="text-xs text-gray-400 mb-1.5" style={{ paddingLeft: '4px' }}>
          {msg.sender}
          <span className="text-gray-300 ml-2">{msg.author}</span>
        </div>
        <div className="bg-white text-gray-800 rounded-2xl rounded-bl-md text-[14px] leading-relaxed shadow-sm" style={{ padding: '12px 20px' }}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}
