const BASE = '/api';

export async function fetchBooks(signal) {
  const res = await fetch(`${BASE}/books`, { signal });
  if (!res.ok) throw new Error('Failed to fetch books');
  return res.json();
}

export async function fetchLibrary(q = '', signal) {
  const params = q ? `?q=${encodeURIComponent(q)}` : '';
  const res = await fetch(`${BASE}/library${params}`, { signal });
  if (!res.ok) throw new Error('Failed to fetch library');
  return res.json();
}

export async function addBook(name, author, fromLibrary = false) {
  const res = await fetch(`${BASE}/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, author, from_library: fromLibrary }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || '添加失败');
  }
  return res.json();
}

export async function fetchBookSoul(bookId) {
  const res = await fetch(`${BASE}/books/${bookId}/soul`);
  if (!res.ok) throw new Error('Failed to fetch book soul');
  return res.json();
}

export async function resoulBook(bookId) {
  const res = await fetch(`${BASE}/books/${bookId}/resoul`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || '重新蒸馏失败');
  }
  return res.json();
}

export async function removeBook(bookId) {
  const res = await fetch(`${BASE}/books/${bookId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || '删除失败');
  }
  return res.json();
}

export async function sendMessage(message) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || '发送失败');
  }
  return res.json();
}

export async function startDistill(file, name, author) {
  const form = new FormData();
  form.append('file', file);
  form.append('name', name);
  form.append('author', author);
  const res = await fetch(`${BASE}/distill`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || '蒸馏失败');
  }
  return res.json();
}

export async function checkDistill(taskId) {
  const res = await fetch(`${BASE}/distill/${taskId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || '查询失败');
  }
  return res.json();
}

export async function startBatch(folderPath) {
  const res = await fetch(`${BASE}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_path: folderPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || '启动失败');
  }
  return res.json();
}

export async function checkBatch(taskId) {
  const res = await fetch(`${BASE}/batch/${taskId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || '查询失败');
  }
  return res.json();
}
