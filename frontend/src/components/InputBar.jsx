import { useState, useRef, useEffect, useMemo } from 'react';

const PLACEHOLDERS = [
  '说说你最近的事...',
  '遇到什么难题了？大家帮你出出主意...',
  '有什么想不通的事，问问老友们...',
  '抛一个话题，看看老友们怎么想...',
  '把你写的内容丢进来，听听老友们怎么说...',
  '分享一段思考，看看老友们的视角…',
  '输入 @ 可以点名书友回复...',
];

export default function InputBar({ onSend, disabled, books }) {
  const [text, setText] = useState('');
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);
  const [mentionQuery, setMentionQuery] = useState(null); // { start, query } or null
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [disabled]);

  useEffect(() => {
    const pick = () => {
      const idx = Math.floor(Math.random() * PLACEHOLDERS.length);
      setPlaceholder(PLACEHOLDERS[idx]);
    };
    const timer = setInterval(pick, 30000);
    return () => clearInterval(timer);
  }, []);

  const filteredBooks = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query.toLowerCase();
    return books.filter(
      (b) => b.name.toLowerCase().includes(q) || b.author.toLowerCase().includes(q),
    ).slice(0, 6);
  }, [mentionQuery, books]);

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);

    // 检测 @ 提及：找到文本中最后一个 @ 后面没有空格的内容
    const lastAt = val.lastIndexOf('@');
    if (lastAt >= 0) {
      const afterAt = val.slice(lastAt + 1);
      // 如果 @ 后面没有空格，说明正在输入提及
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        setMentionQuery({ start: lastAt, query: afterAt });
        return;
      }
    }
    setMentionQuery(null);
  };

  const selectMention = (book) => {
    if (!mentionQuery) return;
    const before = text.slice(0, mentionQuery.start);
    const after = text.slice(mentionQuery.start + 1 + mentionQuery.query.length);
    const newText = `${before}@${book.name} ${after}`;
    setText(newText);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    // 如果提及下拉打开，按 Enter 选第一个
    if (e.key === 'Enter' && mentionQuery && filteredBooks.length > 0) {
      e.preventDefault();
      selectMention(filteredBooks[0]);
      return;
    }
    if (e.key === 'Escape' && mentionQuery) {
      e.preventDefault();
      setMentionQuery(null);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 bg-gray-50 relative" style={{ padding: '10px', gap: '12px' }}>
      {/* 提及下拉 */}
      {mentionQuery && filteredBooks.length > 0 && (
        <div
          className="absolute bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden"
          style={{ bottom: '100%', left: '10px', right: '50px', marginBottom: '4px' }}
        >
          {filteredBooks.map((book) => (
            <button
              key={book.id}
              onClick={() => selectMention(book)}
              className="flex items-center w-full text-left hover:bg-gray-50 transition-colors"
              style={{ gap: '10px', padding: '8px 12px' }}
            >
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0 shadow-sm"
                style={{ backgroundColor: book.color }}
              >
                {book.emoji}
              </div>
              <span className="text-sm text-gray-700 font-medium">{book.name}</span>
              <span className="text-xs text-gray-400 truncate">{book.author}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end" style={{ gap: '12px' }}>
        <textarea
          ref={inputRef}
          className="flex-1 resize-none rounded-xl border border-gray-200 bg-white text-[14px] leading-relaxed outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 placeholder-gray-400 max-h-32"
          style={{ padding: '12px 20px' }}
          rows={1}
          placeholder={placeholder}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          onInput={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
          }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="bg-[#95ec69] text-gray-800 hover:bg-[#7ddc4f] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 flex items-center justify-center"
          style={{ width: '30px', height: '30px', borderRadius: '9px', boxShadow: '0 2px 8px rgba(149,236,105,0.4)', fontSize: '16px' }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
