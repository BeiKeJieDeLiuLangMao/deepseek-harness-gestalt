'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  platform: process.platform,
  getStatus: () => ipcRenderer.invoke('updater:getStatus'),
  checkNow: () => { ipcRenderer.send('updater:checkNow') },
  downloadNow: () => { ipcRenderer.send('updater:downloadNow') },
  quitAndInstall: () => { ipcRenderer.send('updater:quitAndInstall') },
  onStatus: (listener) => {
    const wrapped = (_event, status) => { listener(status) }
    ipcRenderer.on('updater:status-changed', wrapped)
    return () => { ipcRenderer.removeListener('updater:status-changed', wrapped) }
  },
  windowMinimize: () => { ipcRenderer.send('window:minimize') },
  windowMaximize: () => { ipcRenderer.send('window:maximize') },
  windowClose: () => { ipcRenderer.send('window:close') },
})
