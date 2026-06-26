# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

_block_cipher = None

BASE_DIR = Path(SPECPATH)  # pyright: ignore
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

a = Analysis(
    [str(BACKEND_DIR / "launcher.py")],
    pathex=[],
    binaries=[],
    datas=[
        (str(BACKEND_DIR / "main.py"), "."),
        (str(BACKEND_DIR / "books.py"), "."),
        (str(BACKEND_DIR / "matcher.py"), "."),
        (str(BACKEND_DIR / "responder.py"), "."),
        (str(BACKEND_DIR / "config.py"), "."),
        (str(BACKEND_DIR / "models.py"), "."),
        (str(BACKEND_DIR / "book_library.py"), "."),
        (str(BACKEND_DIR / "distiller.py"), "."),
        (str(FRONTEND_DIST), "frontend/dist"),
    ],
    hiddenimports=[
        "openai", "fastapi", "uvicorn", "pydantic", "dotenv",
        "starlette", "anyio", "httpx", "httpcore", "certifi",
        "h11", "click", "tqdm", "jiter", "sniffio", "idna",
        "distro", "annotated_doc", "annotated_types",
        "typing_extensions", "typing_inspection",
        "webview", "pywebview",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "pandas", "PIL", "cv2", "scipy"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=_block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=_block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Bookloop",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=True,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="Bookloop",
)

app = BUNDLE(
    coll,
    name="Bookloop.app",
    icon="/Users/admin/Desktop/Bookloop/dist/Bookloop.icns",
    bundle_identifier="com.bookloop.app",
    info_plist={
        "NSPrincipalClass": "NSApplication",
        "NSHighResolutionCapable": True,
        "CFBundleName": "Bookloop",
        "CFBundleDisplayName": "Bookloop",
        "CFBundleShortVersionString": "1.0.0",
        "CFBundleVersion": "1.0.0",
        "NSHumanReadableCopyright": "Bookloop",
        "LSUIElement": False,
    },
)
