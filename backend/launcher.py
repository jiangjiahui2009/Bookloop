"""
Bookloop 原生 macOS 启动器
内嵌 WKWebView，不需要浏览器
"""

import sys
import threading

import uvicorn
import webview


def start_server():
    """后台启动 FastAPI"""
    from main import app
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")


def main():
    t = threading.Thread(target=start_server, daemon=True)
    t.start()

    webview.create_window(
        title="Bookloop",
        url="http://localhost:8000",
        width=820,
        height=700,
        min_size=(640, 480),
        text_select=True,
    )

    webview.start()
    sys.exit(0)


if __name__ == "__main__":
    main()
