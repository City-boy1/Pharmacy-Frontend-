// Barcode scanner integration.
//
// Nearly all USB and Bluetooth barcode scanners work as "HID keyboard emulators":
// plug one in, point it at a search box, scan a barcode, and the scanner types
// the code into whatever input is focused, then sends an Enter keystroke. No
// special driver or browser API is needed — we just need to (a) keep the
// search box focused, and (b) detect "this looks like a scan, not typing" so we
// can jump straight to an exact match instead of a fuzzy search-as-you-type.
//
// Detection heuristic: scanners type extremely fast (each character arrives
// within ~30ms of the last). A human typing rarely goes that fast. We track
// keystroke timing and treat "fast typing that ends in Enter" as a scan.

function attachBarcodeScanner(inputEl, onScanned) {
  let lastKeyTime = 0;
  let buffer = '';
  const FAST_KEY_THRESHOLD_MS = 40;

  inputEl.addEventListener('keydown', (e) => {
    const now = Date.now();
    const gap = now - lastKeyTime;
    lastKeyTime = now;

    if (e.key === 'Enter') {
      const looksLikeScan = buffer.length >= 4; // scanners rarely produce <4 chars
      if (looksLikeScan) {
        e.preventDefault();
        onScanned(buffer.trim());
      }
      buffer = '';
      return;
    }

    // Reset the buffer if there's a human-speed pause (i.e. this is manual typing).
    if (gap > FAST_KEY_THRESHOLD_MS) buffer = '';
    if (e.key.length === 1) buffer += e.key;
  });

  // Keep focus on the search box by default so a scan always lands there,
  // unless the cashier has deliberately clicked into another field.
  document.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') {
      inputEl.focus();
    }
  });
}