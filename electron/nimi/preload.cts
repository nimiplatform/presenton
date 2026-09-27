import { contextBridge, ipcRenderer } from 'electron';
import { installNimiElectronRuntimeBridge } from '@nimiplatform/kit/shell/electron/preload-cjs';
installNimiElectronRuntimeBridge({ contextBridge, ipcRenderer });
// Product detection only; no raw IPC or arbitrary file access.
contextBridge.exposeInMainWorld('presentonHost', { platform: process.platform });
