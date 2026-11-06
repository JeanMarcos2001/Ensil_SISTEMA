/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AccessGate } from './components/auth/AccessGate';
import { AuthGate } from './components/auth/AuthGate';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AccessGate>
          {(access, accountId) => (
            <DataProvider access={access} accountId={accountId}>
              <BrowserRouter>
                <AppShell />
              </BrowserRouter>
            </DataProvider>
          )}
        </AccessGate>
      </AuthGate>
    </AuthProvider>
  );
}
