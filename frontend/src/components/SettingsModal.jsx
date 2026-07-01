import { useState, useEffect } from 'react';

const TABS = [
  {
    key: 'llm',
    label: '大模型',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-...' },
      { key: 'base_url', label: 'Base URL', type: 'text', placeholder: 'https://api.openai.com/v1' },
      { key: 'matcher_model', label: '匹配模型', type: 'text', placeholder: 'gpt-4o-mini' },
      { key: 'responder_model', label: '回复模型', type: 'text', placeholder: 'gpt-4o' },
    ],
  },
  {
    key: 'general',
    label: '通用',
    fields: [
      { key: 'max_responders', label: '每次回复书友数量', type: 'number', placeholder: '5' },
    ],
  },
];

export default function SettingsModal({ onClose, onSaved }) {
  const [config, setConfig] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('llm');
  const [providers, setProviders] = useState({});

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        setConfig(data);
        setProviders(data.available_providers || {});
        setLoaded(true);
      })
      .catch(() => {});
  }, []);

  const selectProvider = (key) => {
    const p = providers[key];
    if (!p) return;
    setConfig({
      ...config,
      provider: key,
      base_url: p.base_url || '',
      matcher_model: p.matcher_model || '',
      responder_model: p.responder_model || '',
    });
  };

  const currentProvider = config.provider || 'custom';

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '保存失败');
      onSaved(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError('');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.connected) {
        setTestResult('success');
      } else {
        setTestResult('fail');
        setTestError(data.connection_error || '');
      }
    } catch {
      setTestResult('fail');
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) return null;

  const activeTab = TABS.find((t) => t.key === tab);
  const isLLM = tab === 'llm';

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[420px] max-h-[90vh] overflow-y-auto mx-4" style={{ padding: '32px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-1">设置</h3>

        {/* Tab 切换 */}
        <div className="flex gap-0 mb-4 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 text-center text-sm font-medium transition-colors"
              style={{
                padding: '8px 0',
                color: tab === t.key ? '#333' : '#999',
                borderBottom: tab === t.key ? '2px solid #95ec69' : '2px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 提供商选择器 — 仅大模型 Tab */}
        {isLLM && Object.keys(providers).length > 0 && (
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-2">提供商</label>
            <div className="flex flex-wrap" style={{ gap: '6px' }}>
              {Object.entries(providers).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => selectProvider(key)}
                  className="text-xs rounded-md border transition-colors"
                  style={{
                    padding: '5px 12px',
                    backgroundColor: currentProvider === key ? '#95ec69' : '#fff',
                    borderColor: currentProvider === key ? '#7ddc4f' : '#e5e7eb',
                    color: currentProvider === key ? '#374151' : '#6b7280',
                    fontWeight: currentProvider === key ? 600 : 400,
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab.fields.map((f) => {
          const isMasked = typeof config[f.key] === 'string' && config[f.key].includes('****');
          return (
          <div key={f.key} className="mb-3">
            <label className="block text-sm text-gray-600 mb-1">{f.label}</label>
            <input
              type={f.type}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 font-mono"
              placeholder={f.placeholder}
              value={config[f.key] ?? ''}
              onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
              disabled={saving || testing}
            />
            {isMasked && (
              <p className="text-amber-500 text-xs mt-1">已保存但已隐藏，如需更换请重新输入完整 Key</p>
            )}
          </div>
        )})}

        {/* 连接状态 & 操作 — 仅大模型 Tab */}
        {isLLM && (
          <>
            {testResult === 'success' && (
              <div className="text-green-600 text-sm mb-1">连接成功</div>
            )}
            {testResult === 'fail' && (
              <div className="mb-3">
                <div className="text-red-500 text-sm">连接失败</div>
                {testError && (
                  <div className="text-red-400 text-xs mt-1 break-all leading-relaxed">{testError}</div>
                )}
              </div>
            )}
            {config.has_api_key && !testResult && (
              <div className="text-gray-400 text-sm mb-3">
                {config.connected ? '已连接' : '未连接 — 请测试或保存'}
              </div>
            )}

            <div className="flex gap-2 justify-end" style={{ marginTop: '10px' }}>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 rounded-lg transition-colors" style={{ padding: '2px 4px', fontSize: '14px' }}
                disabled={saving || testing}
              >
                关闭
              </button>
              <button
                onClick={handleTest}
                disabled={saving || testing || !config.api_key}
                className="border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" style={{ padding: '2px 4px', fontSize: '14px' }}
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || testing}
                className="bg-[#95ec69] text-gray-800 rounded-lg font-medium hover:bg-[#7ddc4f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors" style={{ padding: '2px 4px', fontSize: '14px' }}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </>
        )}

        {/* 通用 Tab 底部按钮 */}
        {!isLLM && (
          <div className="flex gap-2 justify-end" style={{ marginTop: '10px' }}>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 rounded-lg transition-colors" style={{ padding: '2px 4px', fontSize: '14px' }}
              disabled={saving}
            >
              关闭
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#95ec69] text-gray-800 rounded-lg font-medium hover:bg-[#7ddc4f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors" style={{ padding: '2px 4px', fontSize: '14px' }}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
