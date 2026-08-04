/**
 * Browser file I/O helpers. Reading uses the standard File API.
 */
(function (global) {
  'use strict';

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
      reader.readAsText(file);
    });
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  global.NovaDM = global.NovaDM || {};
  global.NovaDM.fileIO = { readFileAsText, downloadText };
})(typeof window !== 'undefined' ? window : globalThis);
