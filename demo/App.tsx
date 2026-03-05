import React, { useState } from 'react';
import { WitnesscrumbsWidget } from '../src/view/WitnesscrumbsWidgets';

const MOCK_API = 'https://jsonplaceholder.typicode.com';

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', sans-serif;
    background: #0e0e0e;
    color: #ccc;
    min-height: 100vh;
  }
  .sandbox { max-width: 800px; margin: 0 auto; padding: 32px 24px 120px; }
  .sandbox h1 {
    font-size: 28px; font-weight: 700; color: #fff;
    margin-bottom: 8px;
  }
  .sandbox .subtitle {
    color: #666; font-size: 13px; margin-bottom: 40px;
    font-family: 'JetBrains Mono', monospace;
  }
  .section {
    margin-bottom: 32px; padding: 20px;
    background: #141414; border: 1px solid #1e1e1e; border-radius: 8px;
  }
  .section h2 {
    font-size: 14px; font-weight: 600; color: #888;
    text-transform: uppercase; letter-spacing: 0.08em;
    margin-bottom: 16px; font-family: 'JetBrains Mono', monospace;
  }
  .row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
  .row:last-child { margin-bottom: 0; }
  button, .btn {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px; font-weight: 600;
    padding: 8px 16px; border-radius: 6px;
    border: 1px solid #333; background: #1a1a1a; color: #ccc;
    cursor: pointer; transition: all 0.15s;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  button:hover { background: #222; border-color: #444; color: #fff; }
  button.red { border-color: #e74c3c44; color: #e74c3c; }
  button.red:hover { background: #e74c3c15; }
  button.green { border-color: #4caf5044; color: #4caf50; }
  button.green:hover { background: #4caf5015; }
  button.blue { border-color: #82aaff44; color: #82aaff; }
  button.blue:hover { background: #82aaff15; }
  button.orange { border-color: #ff980044; color: #ff9800; }
  button.orange:hover { background: #ff980015; }
  button.purple { border-color: #9b59b644; color: #9b59b6; }
  button.purple:hover { background: #9b59b615; }
  input, select, textarea {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px; padding: 8px 12px; border-radius: 6px;
    border: 1px solid #333; background: #111; color: #ccc;
    outline: none; transition: border-color 0.15s;
  }
  input:focus, select:focus, textarea:focus { border-color: #82aaff; }
  textarea { resize: vertical; min-height: 60px; width: 100%; }
  .hint { font-size: 11px; color: #555; margin-top: 6px; font-family: 'JetBrains Mono', monospace; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 10px; font-weight: 700; font-family: 'JetBrains Mono', monospace;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .output {
    margin-top: 10px; padding: 10px 14px;
    background: #0a0a0a; border: 1px solid #1e1e1e; border-radius: 6px;
    font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #666;
    min-height: 32px; word-break: break-all;
  }
`;

export function App() {
  const [searchVal, setSearchVal] = useState('');
  const [httpResult, setHttpResult] = useState<string>('');
  const [counter, setCounter] = useState(0);

  // --- HTTP demos ---
  const fetchSuccess = async () => {
    setHttpResult('Loading...');
    const res = await fetch(`${MOCK_API}/posts/1`);
    const data = await res.json();
    setHttpResult(`GET 200 - "${(data as { title: string }).title}"`);
  };

  const fetchList = async () => {
    setHttpResult('Loading...');
    const res = await fetch(`${MOCK_API}/posts?_limit=3`);
    const data = await res.json();
    setHttpResult(`GET 200 - ${(data as unknown[]).length} posts`);
  };

  const fetchPost = async () => {
    setHttpResult('Loading...');
    const res = await fetch(`${MOCK_API}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', body: 'Demo post', userId: 1 }),
    });
    const data = await res.json();
    setHttpResult(`POST 201 - id: ${(data as { id: number }).id}`);
  };

  const fetch404 = async () => {
    setHttpResult('Loading...');
    const res = await fetch(`${MOCK_API}/posts/99999`);
    setHttpResult(`GET ${res.status} - ${res.statusText || 'Not Found'}`);
  };

  const fetchNetworkError = async () => {
    setHttpResult('Loading...');
    try {
      await fetch('https://this-domain-does-not-exist-xyz.com/api');
      setHttpResult('Unexpected success');
    } catch (e) {
      setHttpResult(`Network error: ${(e as Error).message}`);
    }
  };

  // --- Error demos ---
  const throwError = () => {
    throw new Error('Demo uncaught error from sandbox');
  };

  const consoleError = () => {
    console.error('Demo console.error:', { code: 'DEMO_ERR', detail: 'Something went wrong' });
  };

  const promiseReject = () => {
    Promise.reject(new Error('Unhandled promise rejection demo'));
  };

  const consoleWarn = () => {
    console.warn('Demo warning: deprecated API usage detected');
  };

  // --- Storage.  demos ---
  const storageSet = () => {
    const key = `demo_${Date.now()}`;
    localStorage.setItem(key, JSON.stringify({ counter, ts: Date.now() }));
    setHttpResult(`localStorage.setItem("${key}")`);
  };

  const storageClear = () => {
    localStorage.clear();
    setHttpResult('localStorage.clear()');
  };

  // --- Navigation demos ---
  const pushState = () => {
    const path = `/demo/page-${Math.floor(Math.random() * 100)}`;
    history.pushState({}, '', path);
    setHttpResult(`pushState -> ${path}`);
  };

  const replaceState = () => {
    const path = `/demo/replaced-${Math.floor(Math.random() * 100)}`;
    history.replaceState({}, '', path);
    setHttpResult(`replaceState -> ${path}`);
  };

  const hashChange = () => {
    window.location.hash = `section-${Math.floor(Math.random() * 100)}`;
  };

  return (
    <>
      <style>{css}</style>
      <div className="sandbox">
        <h1>Witnesscrumbs Sandbox</h1>
        <p className="subtitle">
          Interactive playground &mdash; each action generates breadcrumbs. Open the widget (bottom-right) to see them.
        </p>

        {/* UI Clicks */}
        <div className="section">
          <h2>UI &middot; Clicks</h2>
          <div className="row">
            <button data-qa="add-to-cart" className="green" onClick={() => setCounter((c) => c + 1)}>
              Add to Cart ({counter})
            </button>
            <button data-qa="checkout-submit" className="blue" onClick={() => setCounter(0)}>
              Checkout
            </button>
            <button data-qa="delete-item" className="red" onClick={() => setCounter((c) => Math.max(0, c - 1))}>
              Remove Item
            </button>
            <button data-qa="settings-open" className="orange" onClick={() => alert('Settings modal')}>
              Open Settings
            </button>
          </div>
          <p className="hint">Buttons have data-qa attributes &mdash; crumbs show readable names instead of CSS selectors</p>
        </div>

        {/* UI Input */}
        <div className="section">
          <h2>UI &middot; Input &amp; Forms</h2>
          <div className="row">
            <input
              data-qa="search-field"
              type="text"
              placeholder="Search products..."
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <div className="row">
            <input data-qa="email-field" type="email" placeholder="Email" />
            <input data-qa="password-field" type="password" placeholder="Password (masked)" />
          </div>
          <form
            data-qa="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              setHttpResult('Form submitted!');
            }}
          >
            <div className="row" style={{ marginTop: 10 }}>
              <input data-qa="username-input" type="text" placeholder="Username" />
              <button data-qa="login-submit" className="blue" type="submit">
                Login
              </button>
            </div>
          </form>
          <p className="hint">Input values are debounced (500ms). Password fields are automatically masked.</p>
        </div>

        {/* HTTP Requests */}
        <div className="section">
          <h2>HTTP &middot; Fetch Interception</h2>
          <div className="row">
            <button data-qa="fetch-post" className="green" onClick={fetchSuccess}>
              GET /posts/1
            </button>
            <button data-qa="fetch-list" className="green" onClick={fetchList}>
              GET /posts?limit=3
            </button>
            <button data-qa="create-post" className="blue" onClick={fetchPost}>
              POST /posts
            </button>
            <button data-qa="fetch-404" className="orange" onClick={fetch404}>
              GET /posts/99999
            </button>
            <button data-qa="fetch-error" className="red" onClick={fetchNetworkError}>
              Network Error
            </button>
          </div>
          <div className="output">{httpResult || 'Response will appear here...'}</div>
          <p className="hint">All fetch/XHR calls are intercepted. Status, duration, and errors are captured.</p>
        </div>

        {/* Errors */}
        <div className="section">
          <h2>Errors &middot; Console</h2>
          <div className="row">
            <button data-qa="throw-error" className="red" onClick={throwError}>
              Throw Error
            </button>
            <button data-qa="console-error" className="red" onClick={consoleError}>
              console.error()
            </button>
            <button data-qa="promise-reject" className="red" onClick={promiseReject}>
              Promise.reject()
            </button>
            <button data-qa="console-warn" className="orange" onClick={consoleWarn}>
              console.warn()
            </button>
          </div>
          <p className="hint">window.onerror, unhandledrejection, and console.error are all captured</p>
        </div>

        {/* Navigation */}
        <div className="section">
          <h2>Navigation &middot; History API</h2>
          <div className="row">
            <button data-qa="push-state" className="green" onClick={pushState}>
              pushState
            </button>
            <button data-qa="replace-state" className="blue" onClick={replaceState}>
              replaceState
            </button>
            <button data-qa="hash-change" className="purple" onClick={hashChange}>
              hashChange
            </button>
            <button data-qa="go-back" className="orange" onClick={() => history.back()}>
              history.back()
            </button>
          </div>
          <div className="output">{window.location.pathname + window.location.hash}</div>
          <p className="hint">Navigation API (Chrome 102+) with History API fallback</p>
        </div>

        {/* Storage */}
        <div className="section">
          <h2>Storage &middot; localStorage</h2>
          <div className="row">
            <button data-qa="storage-set" className="blue" onClick={storageSet}>
              setItem
            </button>
            <button data-qa="storage-clear" className="red" onClick={storageClear}>
              clear()
            </button>
          </div>
          <p className="hint">localStorage.setItem / removeItem / clear are monkey-patched</p>
        </div>

        {/* Visibility */}
        <div className="section">
          <h2>Visibility &middot; Network</h2>
          <p style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
            Switch to another tab and come back &mdash; a <span className="badge" style={{ background: '#9b59b615', color: '#9b59b6' }}>HIDE</span> / <span className="badge" style={{ background: '#9b59b615', color: '#9b59b6' }}>SHOW</span> crumb will appear with the absence duration.
            <br />
            Toggle airplane mode or disconnect WiFi &mdash; <span className="badge" style={{ background: '#ff980015', color: '#ff9800' }}>NET</span> online/offline events are captured.
          </p>
        </div>

        {/* Hotkeys */}
        <div className="section">
          <h2>Hotkeys</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
            <div><kbd style={{ color: '#82aaff' }}>Alt+Shift+L</kbd> &mdash; toggle panel</div>
            <div><kbd style={{ color: '#82aaff' }}>Alt+Shift+V</kbd> &mdash; video recording</div>
            <div><kbd style={{ color: '#82aaff' }}>Alt+Shift+C</kbd> &mdash; copy JSON</div>
            <div><kbd style={{ color: '#82aaff' }}>Alt+Shift+X</kbd> &mdash; clear crumbs</div>
          </div>
        </div>
      </div>

      <WitnesscrumbsWidget
        attribute="data-qa"
        bufferSize={50}
        interceptHttp={true}
        httpFilter="all"
        captureErrors={true}
        captureConsole={true}
      />
    </>
  );
}
