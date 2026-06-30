import { useState, useEffect } from 'react';
import { startBatch, checkBatch } from '../api';

export default function BatchModal({ onClose }) {
  const [folderPath, setFolderPath] = useState('');
  const [processing, setProcessing] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  const handleStart = async () => {
    const path = folderPath.trim();
    if (!path) return;
    setError('');
    setProcessing(true);
    try {
      const { task_id } = await startBatch(path);
      setTaskId(task_id);
    } catch (err) {
      setError(err.message);
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (!taskId || !processing) return;
    const timer = setInterval(async () => {
      try {
        const data = await checkBatch(taskId);
        setProgress(data.progress);
        setStage(data.stage);
        setCurrent(data.current);
        setTotal(data.total);
        if (data.status === 'done') {
          clearInterval(timer);
          setProcessing(false);
          setTaskId(null);
        } else if (data.status === 'error') {
          setError(data.error || '处理失败');
          clearInterval(timer);
          setProcessing(false);
          setTaskId(null);
        }
      } catch {
        // 静默处理轮询异常
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [taskId, processing]);

  const done = !processing && (progress === 100 || (total > 0 && current >= total));

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={() => { if (!processing) onClose(); }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl mx-4 flex flex-col"
        style={{ width: '460px', padding: '32px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-4">批量投喂</h3>

        <label className="block text-sm text-gray-600 mb-1.5">文件夹路径</label>
        <input
          className="w-full rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 mb-3"
          style={{ padding: '8px 12px' }}
          placeholder="例如：/Users/xxx/Documents/articles"
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          disabled={processing}
          autoFocus
        />

        {error && (
          <div className="text-red-500 text-sm mb-3">{error}</div>
        )}

        {processing ? (
          <>
            <div className="mb-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{stage || '准备中...'}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, backgroundColor: '#95ec69' }}
                />
              </div>
            </div>
            <div className="text-xs text-gray-400 mb-4">
              {current > 0 && total > 0 ? `${current}/${total} 篇` : '扫描中...'}
            </div>
            <div className="flex justify-end">
              <span className="text-xs text-gray-400 leading-8">处理中，请稍候...</span>
            </div>
          </>
        ) : (
          <>
            <div className="text-xs text-gray-400 mb-4 leading-relaxed">
              选择包含 .md / .txt 文件的文件夹，系统会逐篇匹配群里的书友并生成回复，输出到该文件夹下的 output/ 子目录。
            </div>

            {done && (
              <div className="text-green-600 text-sm mb-3">处理完成，已输出到 {folderPath}/output/</div>
            )}

            <div className="flex gap-2 justify-end" style={{ marginTop: '8px' }}>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
              >
                {done ? '关闭' : '取消'}
              </button>
              {!done && (
                <button
                  onClick={handleStart}
                  disabled={!folderPath.trim()}
                  style={{ padding: '4px 4px', fontSize: '14px', backgroundColor: '#95ec69', color: '#374151', borderRadius: '8px', fontWeight: 500 }}
                  className="hover:bg-[#7ddc4f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  开始处理
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
