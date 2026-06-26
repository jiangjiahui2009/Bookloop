import { useState, useRef, useEffect } from 'react';
import { addBook, removeBook, fetchLibrary, startDistill, checkDistill, fetchBookSoul, resoulBook } from '../api';

export default function Sidebar({ books, onBooksChanged, onOpenSettings, onToggle }) {
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState('library');
  const [libraryBooks, setLibraryBooks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [bookName, setBookName] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [selectedLibraryBooks, setSelectedLibraryBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [groupName, setGroupName] = useState(() => localStorage.getItem('bookloop_group_name') || '群聊');
  const [editingName, setEditingName] = useState(false);
  // 蒸馏状态
  const [distillFile, setDistillFile] = useState(null);
  const [distillName, setDistillName] = useState('');
  const [distillAuthor, setDistillAuthor] = useState('');
  const [distilling, setDistilling] = useState(false);
  const [distillTaskId, setDistillTaskId] = useState(null);
  const [distillProgress, setDistillProgress] = useState(0);
  const [distillStage, setDistillStage] = useState('');
  const distillInputRef = useRef(null);
  const [soulBook, setSoulBook] = useState(null);
  const [loadingSoul, setLoadingSoul] = useState(false);
  const [redistilling, setRedistilling] = useState(false);

  const searchAbortRef = useRef(null);
  const searchTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (searchAbortRef.current) searchAbortRef.current.abort();
      clearTimeout(searchTimerRef.current);
    };
  }, []);

  const verifiedCount = books.filter((b) => b.verified).length;

  const toggleLibraryBook = (book) => {
    setSelectedLibraryBooks((prev) => {
      const exists = prev.find((b) => b.name === book.name);
      if (exists) return prev.filter((b) => b.name !== book.name);
      return [...prev, book];
    });
  };

  const handleAddSelected = async () => {
    if (selectedLibraryBooks.length === 0) return;
    setAdding(true);
    setAddError('');
    try {
      for (const book of selectedLibraryBooks) {
        await addBook(book.name, book.author, true);
      }
      setShowModal(false);
      setSearchQuery('');
      setSelectedLibraryBooks([]);
      onBooksChanged();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleAddManual = async () => {
    const name = bookName.trim();
    if (!name) return;
    setAdding(true);
    setAddError('');
    try {
      await addBook(name, bookAuthor.trim(), false);
      setShowModal(false);
      setBookName('');
      setBookAuthor('');
      onBooksChanged();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (bookId, bookName) => {
    try {
      await removeBook(bookId);
      onBooksChanged();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDistill = async () => {
    if (!distillFile || !distillName.trim()) return;
    setDistilling(true);
    setDistillProgress(0);
    setDistillStage('');
    setAddError('');
    try {
      const { task_id } = await startDistill(distillFile, distillName.trim(), distillAuthor.trim());
      setDistillTaskId(task_id);
    } catch (err) {
      setAddError(err.message);
      setDistilling(false);
    }
  };

  // 蒸馏进度轮询
  useEffect(() => {
    if (!distillTaskId || !distilling) return;
    const timer = setInterval(async () => {
      try {
        const data = await checkDistill(distillTaskId);
        setDistillProgress(data.progress);
        setDistillStage(data.stage);
        if (data.status === 'done') {
          setDistilling(false);
          setDistillTaskId(null);
          setDistillFile(null);
          setDistillName('');
          setDistillAuthor('');
          if (distillInputRef.current) distillInputRef.current.value = '';
          setShowModal(false);
          onBooksChanged();
        } else if (data.status === 'error') {
          setAddError(data.error || '蒸馏失败');
          setDistilling(false);
          setDistillTaskId(null);
        }
      } catch {
        // 静默处理轮询异常
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [distillTaskId, distilling, onBooksChanged]);

  const handleSearch = (q) => {
    setSearchQuery(q);
    // 取消上一次请求
    if (searchAbortRef.current) searchAbortRef.current.abort();
    clearTimeout(searchTimerRef.current);
    // 防抖 300ms
    searchTimerRef.current = setTimeout(() => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      fetchLibrary(q, controller.signal)
        .then(setLibraryBooks)
        .catch((err) => {
          if (err.name !== 'AbortError') setLibraryBooks([]);
        });
    }, 300);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAddManual();
  };

  return (
    <>
      <div className="w-72 bg-gray-100 border-r border-gray-200 flex flex-col shrink-0">
        {/* 群聊标题 */}
        <div className="border-b border-gray-200 flex items-center justify-between" style={{ padding: '16px 10px 16px 20px' }}>
          <div>
            {editingName ? (
                <input
                  className="text-base font-semibold text-gray-800 bg-white border border-gray-300 rounded px-1.5 py-0.5 outline-none focus:border-green-400 w-24"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  onBlur={() => { setEditingName(false); localStorage.setItem('bookloop_group_name', groupName); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setEditingName(false); localStorage.setItem('bookloop_group_name', groupName); } }}
                  autoFocus
                />
              ) : (
                <h2
                  className="text-base font-semibold text-gray-800 cursor-pointer hover:text-green-600 transition-colors"
                  onClick={() => setEditingName(true)}
                  title="点击修改群名"
                >
                  {groupName}
                </h2>
              )}
          </div>
          <button
            onClick={onToggle}
            className="hover:opacity-70 transition-opacity"
            title="收起侧栏"
          >
            <img src="/收起.svg" width="24" height="24" alt="收起" />
          </button>
        </div>

        {/* 成员列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-5" style={{ marginLeft: '10px', paddingTop: '10px' }}>
          <p className="text-xs text-gray-400 mb-3">群成员（{verifiedCount}）</p>
          {books.map((book) => {
            const isGray = !book.verified;
            return (
              <div
                key={book.id}
                onClick={() => setSelectedBook(book)}
                className={`flex items-center rounded-lg transition-colors group cursor-pointer ${
                  isGray
                    ? 'opacity-50 grayscale'
                    : 'hover:bg-gray-200/60'
                }`}
                style={{ gap: '16px', padding: '4px 16px' }}
              >
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center text-lg shrink-0 shadow-sm"
                  style={{ backgroundColor: book.color }}
                >
                  {book.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm truncate ${isGray ? 'text-gray-400' : 'text-gray-700 font-medium'}`}>
                    {book.name}
                    {isGray && (
                      <span className="text-xs ml-1" title="大模型不认识这本书，无法有效参与讨论">
                        ⚠
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 truncate">{book.author}</div>
                </div>
                <button
                  onClick={() => handleRemove(book.id, book.name)}
                  className="text-gray-300 hover:text-red-400 text-sm opacity-0 group-hover:opacity-100 transition-all"
                  title="移除"
                >
                  ✕
                </button>
              </div>
            );
          })}
          <div
            onClick={() => { setShowModal(true); setAddError(''); setModalTab('library'); setSearchQuery(''); setSelectedLibraryBooks([]); setDistillFile(null); setDistillName(''); setDistillAuthor(''); if (distillInputRef.current) distillInputRef.current.value = ''; const ctrl = new AbortController(); searchAbortRef.current = ctrl; fetchLibrary('', ctrl.signal).then(setLibraryBooks).catch(() => {}); }}
            className="flex items-center rounded-lg cursor-pointer hover:bg-gray-200/60 transition-colors mt-1"
            style={{ gap: '16px', padding: '4px 16px' }}
          >
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center text-lg shrink-0 border border-dashed border-gray-300 text-gray-400"
            >
              +
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-gray-400">添加书友</div>
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div style={{ padding: '14px 20px' }}>
          <button
            onClick={onOpenSettings}
            className="hover:opacity-70 transition-opacity"
            title="设置"
          >
            <img src="/设置.svg" width="18" height="18" alt="设置" />
          </button>
        </div>
      </div>

      {/* 添加书友弹窗 */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl mx-4 flex flex-col"
            style={{ width: '480px', maxHeight: '80vh', padding: '32px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-800 mb-4">添加书友</h3>

            {/* Tab 切换 */}
            <div className="flex gap-0 mb-4 border-b border-gray-200">
              <button
                onClick={() => setModalTab('library')}
                className="flex-1 text-center text-sm font-medium transition-colors"
                style={{
                  padding: '8px 0',
                  color: modalTab === 'library' ? '#333' : '#999',
                  borderBottom: modalTab === 'library' ? '2px solid #95ec69' : '2px solid transparent',
                }}
              >
                从书库选择
              </button>
              <button
                onClick={() => setModalTab('manual')}
                className="flex-1 text-center text-sm font-medium transition-colors"
                style={{
                  padding: '8px 0',
                  color: modalTab === 'manual' ? '#333' : '#999',
                  borderBottom: modalTab === 'manual' ? '2px solid #95ec69' : '2px solid transparent',
                }}
              >
                手动输入
              </button>
              <button
                onClick={() => setModalTab('distill')}
                className="flex-1 text-center text-sm font-medium transition-colors"
                style={{
                  padding: '8px 0',
                  color: modalTab === 'distill' ? '#333' : '#999',
                  borderBottom: modalTab === 'distill' ? '2px solid #95ec69' : '2px solid transparent',
                }}
              >
                蒸馏原书
              </button>
            </div>

            {/* 书库 Tab */}
            {modalTab === 'library' && (
              <>
                <input
                  className="w-full rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 mb-3"
                  style={{ padding: '8px 12px' }}
                  placeholder="搜索书名或作者..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  autoFocus
                  disabled={adding}
                />
                <div className="overflow-y-auto flex-1" style={{ minHeight: '200px', maxHeight: '320px' }}>
                  {libraryBooks.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">没有匹配的书</p>
                  ) : (
                    libraryBooks.map((book) => {
                      const isSelected = selectedLibraryBooks.some((b) => b.name === book.name);
                      return (
                        <div
                          key={book.name}
                          onClick={() => toggleLibraryBook(book)}
                          className="flex items-center rounded-lg cursor-pointer transition-colors"
                          style={{
                            gap: '12px',
                            padding: '6px 12px',
                            backgroundColor: isSelected ? '#f0fdf4' : 'transparent',
                          }}
                        >
                          <div
                            className="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0 shadow-sm"
                            style={{ backgroundColor: book.color }}
                          >
                            {book.emoji}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-gray-700 font-medium truncate">{book.name}</div>
                            <div className="text-xs text-gray-400 truncate">{book.author}</div>
                          </div>
                          <div
                            className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                            style={{
                              borderColor: isSelected ? '#95ec69' : '#d1d5db',
                              backgroundColor: isSelected ? '#95ec69' : 'transparent',
                            }}
                          >
                            {isSelected && (
                              <span className="text-white text-xs leading-none">✓</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {addError && (
                  <div className="text-red-500 text-sm mt-2">{addError}</div>
                )}
                <div className="flex gap-2 justify-between items-center" style={{ marginTop: '20px' }}>
                  <span className="text-xs text-gray-400">
                    {selectedLibraryBooks.length > 0 ? `已选 ${selectedLibraryBooks.length} 本` : ''}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
                      disabled={adding}
                    >
                      取消
                    </button>
                    <button
                      onClick={handleAddSelected}
                      disabled={adding || selectedLibraryBooks.length === 0}
                      style={{ padding: '4px 4px', fontSize: '14px', backgroundColor: '#95ec69', color: '#374151', borderRadius: '8px', fontWeight: 500 }}
                      className="hover:bg-[#7ddc4f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {adding ? '添加中...' : `添加${selectedLibraryBooks.length > 0 ? ` (${selectedLibraryBooks.length})` : ''}`}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* 手动输入 Tab */}
            {modalTab === 'manual' && (
              <>
                <label className="block text-sm text-gray-600 mb-1.5">书名 *</label>
                <input
                  className="w-full rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 mb-3"
                  style={{ padding: '8px 12px' }}
                  placeholder="例如：沉思录"
                  value={bookName}
                  onChange={(e) => setBookName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  disabled={adding}
                />

                <label className="block text-sm text-gray-600 mb-1.5">作者（选填）</label>
                <input
                  className="w-full rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 mb-4"
                  style={{ padding: '8px 12px' }}
                  placeholder="例如：马可·奥勒留"
                  value={bookAuthor}
                  onChange={(e) => setBookAuthor(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={adding}
                />

                {addError && (
                  <div className="text-red-500 text-sm mb-3">{addError}</div>
                )}

                <div className="text-xs text-gray-400 mb-4 leading-relaxed">
                  系统会请大模型为这本书生成 AI 人格。如果大模型不认识这本书，书友将显示为灰色，无法参与讨论。
                </div>

                <div className="flex gap-2 justify-end" style={{ marginTop: '8px' }}>
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
                    disabled={adding}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleAddManual}
                    disabled={adding || !bookName.trim()}
                    style={{ padding: '4px 4px', fontSize: '14px', backgroundColor: '#95ec69', color: '#374151', borderRadius: '8px', fontWeight: 500 }}
                    className="hover:bg-[#7ddc4f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {adding ? '识别中...' : '添加'}
                  </button>
                </div>
              </>
            )}

            {/* 蒸馏原书 Tab */}
            {modalTab === 'distill' && (
              <>
                <label className="block text-sm text-gray-600 mb-1.5">上传 Markdown 文件 *</label>
                <input
                  ref={distillInputRef}
                  type="file"
                  accept=".md,.txt,.markdown"
                  className="w-full rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 mb-3"
                  style={{ padding: '8px 12px' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setDistillFile(file || null);
                    if (file && !distillName) {
                      const name = file.name.replace(/\.(md|txt|markdown)$/i, '');
                      setDistillName(name);
                    }
                  }}
                  disabled={distilling}
                />

                <label className="block text-sm text-gray-600 mb-1.5">书名 *</label>
                <input
                  className="w-full rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 mb-3"
                  style={{ padding: '8px 12px' }}
                  placeholder="例如：我的编辑生涯"
                  value={distillName}
                  onChange={(e) => setDistillName(e.target.value)}
                  disabled={distilling}
                />

                <label className="block text-sm text-gray-600 mb-1.5">作者（选填）</label>
                <input
                  className="w-full rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 mb-4"
                  style={{ padding: '8px 12px' }}
                  placeholder="例如：鲁迅"
                  value={distillAuthor}
                  onChange={(e) => setDistillAuthor(e.target.value)}
                  disabled={distilling}
                />

                {addError && (
                  <div className="text-red-500 text-sm mb-3">{addError}</div>
                )}

                {distilling ? (
                  <>
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{distillStage || '准备中...'}</span>
                        <span>{distillProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${distillProgress}%`, backgroundColor: '#95ec69' }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <span className="text-xs text-gray-400 leading-8">正在分析文档，请稍候...</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-gray-400 mb-4 leading-relaxed">
                      上传你的 .md 或 .txt 文档，系统将分析文本内容，蒸馏出这本书的核心主题、行文风格和价值观，生成为一个 AI 书友。
                    </div>
                    <div className="flex gap-2 justify-end" style={{ marginTop: '8px' }}>
                      <button
                        onClick={() => setShowModal(false)}
                        className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
                        disabled={distilling}
                      >
                        取消
                      </button>
                      <button
                        onClick={handleDistill}
                        disabled={distilling || !distillFile || !distillName.trim()}
                        style={{ padding: '4px 4px', fontSize: '14px', backgroundColor: '#95ec69', color: '#374151', borderRadius: '8px', fontWeight: 500 }}
                        className="hover:bg-[#7ddc4f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        开始蒸馏
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {/* 成员详情弹窗 */}
      {selectedBook && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setSelectedBook(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-80 mx-4" style={{ padding: '32px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0 shadow-sm"
                style={{ backgroundColor: selectedBook.color }}
              >
                {selectedBook.emoji}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-800 truncate">{selectedBook.name}</h3>
                <p className="text-sm text-gray-400 truncate">{selectedBook.author}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-between" style={{ marginTop: '10px' }}>
              <button
                onClick={async () => {
                  setLoadingSoul(true);
                  try {
                    const data = await fetchBookSoul(selectedBook.id);
                    setSoulBook(data);
                  } catch {
                    // ignore
                  } finally {
                    setLoadingSoul(false);
                  }
                }}
                disabled={loadingSoul}
                className="text-blue-500 hover:text-blue-700 rounded-lg transition-colors disabled:opacity-40"
                style={{ padding: '4px 4px', fontSize: '14px' }}
              >
                {loadingSoul ? '加载中...' : 'Soul'}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => { handleRemove(selectedBook.id, selectedBook.name); setSelectedBook(null); }}
                  className="bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
                  style={{ padding: '4px 4px', fontSize: '14px' }}
                >
                  删除
                </button>
                <button
                  onClick={() => setSelectedBook(null)}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 查看书友灵魂弹窗 */}
      {soulBook && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setSoulBook(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl mx-4 flex flex-col"
            style={{ width: '520px', maxHeight: '80vh', padding: '32px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0 shadow-sm"
                style={{ backgroundColor: soulBook.color }}
              >
                {soulBook.emoji}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-800 truncate">{soulBook.name}</h3>
                <p className="text-sm text-gray-400 truncate">{soulBook.author}</p>
              </div>
              {!soulBook.verified && (
                <span className="text-xs text-yellow-500 bg-yellow-50 px-2 py-0.5 rounded shrink-0">未验证</span>
              )}
            </div>

            <div className="overflow-y-auto flex-1" style={{ maxHeight: '420px' }}>
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-1.5">触发关键词</h4>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg" style={{ padding: '8px 12px' }}>
                  {soulBook.match_trigger || '（无）'}
                </p>
              </div>

              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-1.5">知识摘要</h4>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg leading-relaxed" style={{ padding: '8px 12px' }}>
                  {soulBook.knowledge_summary || '（无）'}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-1.5">System Prompt</h4>
                <pre className="text-sm text-gray-600 bg-gray-50 rounded-lg leading-relaxed whitespace-pre-wrap font-sans" style={{ padding: '8px 12px' }}>
                  {soulBook.system_prompt || '（无）'}
                </pre>
              </div>
            </div>

            <div className="flex justify-between items-center" style={{ marginTop: '20px' }}>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={async () => {
                    setRedistilling(true);
                    try {
                      const data = await resoulBook(soulBook.id);
                      setSoulBook(data);
                      onBooksChanged();
                    } catch (err) {
                      alert(err.message);
                    } finally {
                      setRedistilling(false);
                    }
                  }}
                  disabled={redistilling}
                  className="text-blue-500 hover:text-blue-700 rounded-lg transition-colors disabled:opacity-40"
                  style={{ padding: '4px 4px', fontSize: '14px' }}
                >
                  {redistilling ? '蒸馏中...' : '重新蒸馏'}
                </button>
                <div className="relative group">
                  <span className="text-gray-400 cursor-help text-sm">?</span>
                  <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block bg-gray-800 text-white text-xs rounded-lg px-3 py-2 w-64 leading-relaxed shadow-lg z-50">
                    用当前配置的 AI 大模型重新生成本书的灵魂，包括触发关键词、知识摘要和 System Prompt。
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSoulBook(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
