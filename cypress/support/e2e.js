// ***********************************************************
// This example support/e2e.js is processed and loaded automatically before your test files.
// ***********************************************************

import './commands';

// Prevent uncaught cross-origin or third-party exceptions from failing tests
Cypress.on('uncaught:exception', (err, runnable) => {
  return false;
});
