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
  accountGetSnapshot: () => ipcRenderer.invoke('account:getSnapshot'),
  accountAcceptPrivacy: () => ipcRenderer.invoke('account:acceptPrivacy'),
  accountBeginLogin: () => ipcRenderer.invoke('account:beginLogin'),
  accountSignOut: () => ipcRenderer.invoke('account:signOut'),
  onAccountSnapshot: (listener) => {
    const wrapped = (_event, snapshot) => { listener(snapshot) }
    ipcRenderer.on('account:snapshot-changed', wrapped)
    return () => { ipcRenderer.removeListener('account:snapshot-changed', wrapped) }
  },
  pairingGetSnapshot: () => ipcRenderer.invoke('pairing:getSnapshot'),
  pairingSetEnabled: (enabled) => ipcRenderer.invoke('pairing:setEnabled', enabled),
  pairingCreateChallenge: () => ipcRenderer.invoke('pairing:createChallenge'),
  pairingCancelChallenge: () => ipcRenderer.invoke('pairing:cancelChallenge'),
  pairingConfirm: (pendingPairingId) => ipcRenderer.invoke('pairing:confirm', pendingPairingId),
  pairingReject: (pendingPairingId) => ipcRenderer.invoke('pairing:reject', pendingPairingId),
  pairingRevoke: (pairingId) => ipcRenderer.invoke('pairing:revoke', pairingId),
  onPairingSnapshot: (listener) => {
    const wrapped = (_event, snapshot) => { listener(snapshot) }
    ipcRenderer.on('pairing:snapshot-changed', wrapped)
    return () => { ipcRenderer.removeListener('pairing:snapshot-changed', wrapped) }
  },
})
