<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Join</title>

  <!-- Use your original stylesheet(s) here -->
  <link rel="stylesheet" href="./join.css" />

  <style>
    /* Safe minimal guards (won’t affect your design if you have your own CSS) */
    html, body { height: 100%; }
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    #root { min-height: 100vh; }
    #boot-status { position: fixed; inset: auto 1rem 1rem auto; font-size: .9rem; opacity: .6; }
    .hidden { display: none !important; }
    noscript { background: #fee; color: #900; padding: 1rem; display: block; text-align: center; }
    #loader { display: grid; place-items: center; min-height: 40vh; }
  </style>
</head>
<body>
  <noscript>JavaScript is required for this page.</noscript>

  <!-- Your app mounts here. Put your original HTML inside #root if it was static. -->
  <div id="root">
    <!-- Optional: a lightweight loader while your JS mounts -->
    <div id="loader">Loading…</div>
  </div>

  <!-- Optional tiny status element (useful during setup, remove later) -->
  <div id="boot-status" class="hidden" aria-live="polite"></div>

  <!-- Your original JS entry (framework or plain). If it uses imports, keep type="module". -->
  <script type="module" src="./join.js"></script>

  <!-- Guard: if module fails to load, show something instead of a white page -->
  <script>
    (function () {
      const status = document.getElementById('boot-status');
      if (!status) return;
      status.classList.remove('hidden');
      status.textContent = 'Booting…';

      // After a tick, if nothing has hidden the loader, keep the page non-blank.
      setTimeout(() => {
        const loader = document.getElementById('loader');
        if (loader) loader.textContent = 'Still loading… (check console/network if this persists)';
      }, 1000);

      // Let your app hide #loader and/or #boot-status when ready.
      // Example in your app: document.getElementById('loader')?.remove();
      //                      document.getElementById('boot-status')?.classList.add('hidden');
    })();
  </script>
</body>
</html>
