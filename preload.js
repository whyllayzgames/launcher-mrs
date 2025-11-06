const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
  // Navigation dans le launcher
  showSite: () => ipcRenderer.invoke('show-site'),
  showMap: () => ipcRenderer.invoke('show-map'),
  showSupport: () => ipcRenderer.invoke('show-support'),

  // Tickets : joueur
  submitTicket: (ticket) => ipcRenderer.invoke('submit-ticket', ticket),
  getUserTickets: (pseudo) => ipcRenderer.invoke('get-user-tickets', { pseudo }),

  // Tickets : staff
  getAllTickets: () => ipcRenderer.invoke('get-all-tickets'),
  getTicket: (ticketId) => ipcRenderer.invoke('get-ticket', { ticketId }),
  addTicketResponse: (ticketId, from, author, message) =>
    ipcRenderer.invoke('add-ticket-response', { ticketId, from, author, message }),
  updateTicketStatus: (ticketId, status) =>
    ipcRenderer.invoke('update-ticket-status', { ticketId, status }),
  takeTicket: (ticketId, staffName) =>
    ipcRenderer.invoke('take-ticket', { ticketId, staffName })
});
