import { useState, useEffect, useCallback } from 'react';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import Sidebar from './components/Sidebar';
import BatchModal from './components/BatchModal';
import SettingsModal from './components/SettingsModal';
import { fetchBooks, sendMessage } from './api';

export default function App() {
  const [books, setBooks] = useState([]);
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('bookloop_messages');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [configOk, setConfigOk] = useState(null); // null=loading, true/false
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showBatch, setShowBatch] = useState(false);

  const loadBooks = useCallback(() => {
    fetchBooks()
      .then(setBooks)
      .catch(() => setError('无法加载书友列表，请确认后端已启动'));
  }, []);

  // 启动时检查 API 配置状态
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => setConfigOk(data.has_api_key && data.connected))
      .catch(() => setConfigOk(false));
  }, []);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  // 消息持久化到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('bookloop_messages', JSON.stringify(messages));
    } catch {
      // localStorage 满或隐私模式，静默跳过
    }
  }, [messages]);

  const handleSend = async (text) => {
    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setTyping(true);
    setError('');

    try {
      const data = await sendMessage(text);
      const currentBooks = await fetchBooks();
      for (const r of data.responses) {
        const book = currentBooks.find((b) => b.id === r.book_id);
        setMessages((prev) => [
          ...prev,
          {
            role: 'book',
            sender: r.book_name,
            author: r.author,
            content: r.message,
            emoji: book?.emoji || '📖',
            color: book?.color || '#999',
          },
        ]);
        await new Promise((r) => setTimeout(r, 600));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTyping(false);
    }
  };

  const handleSettingsSaved = (data) => {
    setConfigOk(data.has_api_key && data.connected);
    setShowSettings(false);
  };

  return (
    <div className="h-screen flex items-center justify-center py-4">
      <div className="w-full max-w-5xl h-full max-h-[900px] flex rounded-xl overflow-hidden shadow-2xl bg-white">
        {sidebarOpen ? (
          <Sidebar
            books={books}
            onBooksChanged={loadBooks}
            onOpenSettings={() => setShowSettings(true)}
            onToggle={() => setSidebarOpen(false)}
          />
        ) : (
          <div className="bg-gray-100 border-r border-gray-200 flex flex-col items-center" style={{ width: '40px', paddingTop: '16px' }}>
            <button
              onClick={() => setSidebarOpen(true)}
              className="hover:opacity-70 transition-opacity"
              title="展开侧栏"
            >
              <img src="/展开.svg" width="24" height="24" alt="展开" />
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {/* API Key 未配置警告 */}
          {configOk === false && (
            <div className="px-5 py-3 bg-amber-50 text-amber-700 text-sm text-center border-b border-amber-100 flex items-center justify-center gap-2">
              ⚠ 尚未配置 API Key，书友们暂时无法回复
              <button
                onClick={() => setShowSettings(true)}
                className="underline font-medium hover:text-amber-800"
              >
                前往设置
              </button>
            </div>
          )}

          {error && (
            <div className="px-5 py-2.5 bg-red-50 text-red-600 text-sm text-center border-b border-red-100">
              {error}
            </div>
          )}

          <ChatWindow messages={messages} typing={typing} />
          <InputBar onSend={handleSend} disabled={typing || !configOk} books={books} onOpenBatch={() => setShowBatch(true)} />
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={handleSettingsSaved}
        />
      )}

      {showBatch && (
        <BatchModal onClose={() => setShowBatch(false)} />
      )}
    </div>
  );
}
