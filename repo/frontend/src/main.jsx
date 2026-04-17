import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.jsx';
import { AuthProvider } from './store/auth.jsx';
import { OfflineQueueProvider } from './store/offlineQueue.jsx';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <OfflineQueueProvider>
        <App />
      </OfflineQueueProvider>
    </AuthProvider>
  </BrowserRouter>
);
