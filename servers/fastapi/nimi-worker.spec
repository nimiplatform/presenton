from PyInstaller.utils.hooks import collect_data_files, collect_submodules
# The business service keeps llmai message types; it has no provider clients.
a = Analysis(['nimi_worker.py'], pathex=['.'],
    datas=collect_data_files('llmai') + collect_data_files('pptx') + collect_data_files('alembic'),
    hiddenimports=collect_submodules('api') + ['aiosqlite', 'greenlet', 'sqlalchemy.dialects.sqlite.aiosqlite'],
    excludes=['onnxruntime', 'fastembed', 'fastembed_vectorstore', 'mem0', 'spacy', 'torch'],
    noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='presenton-worker', console=True)
coll = COLLECT(exe, a.binaries, a.datas, name='presenton-worker')
