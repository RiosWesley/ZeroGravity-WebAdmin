'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── SVG Icons (inline, no dependency) ──
const Icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="sidebar-nav-icon">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  logs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="sidebar-nav-icon">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="sidebar-nav-icon">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),
  externalLink: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
};

// ── Helpers ──
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').replace(/\x1B\[\??\d+[a-zA-Z]/g, '');
}

function formatLogLine(line) {
  if (line.includes(' INFO ')) return { cls: 'info', text: line };
  if (line.includes(' WARN ')) return { cls: 'warn', text: line };
  if (line.includes(' ERROR ')) return { cls: 'err', text: line };
  if (line.includes(' DEBUG ')) return { cls: 'debug', text: line };
  return { cls: '', text: line };
}

// ── Log Parser: extract structured data from raw ZeroGravity logs ──
function parseLogs(rawText) {
  const lines = stripAnsi(rawText).split('\n').filter(Boolean);
  const stats = { info: 0, warn: 0, error: 0, debug: 0, total: lines.length };
  const modelRequests = {};
  const recentWarnings = [];
  const recentErrors = [];
  const unparsed = [];
  const tlsHandshakes = new Set();
  let mitmInterceptions = 0;

  // Known log format: TIMESTAMP LEVEL module: message key=value ...
  // Also known: [stub-ext] ... lines and plain text
  const structuredLogPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+(INFO|WARN|ERROR|DEBUG)\s+/;
  const stubExtPattern = /^\[stub-ext\]/;
  const mitmModifyPattern = /MITM: request modified/;

  for (const line of lines) {
    const isStructured = structuredLogPattern.test(line);
    const isStubExt = stubExtPattern.test(line);

    if (!isStructured && !isStubExt) {
      // Check if it's a JSON fragment containing error info
      if (line.includes('"error":') || line.includes('"message":') || line.includes('"status": "UNAVAILABLE"') || line.includes('"status": "RESOURCE_EXHAUSTED"')) {
        stats.error++;
        const msgMatch = line.match(/"message":\s*"([^"]+)"/);
        if (msgMatch) {
          recentErrors.push({ time: new Date().toLocaleTimeString().split(' ')[0], msg: msgMatch[1], full: line });
          continue;
        }
        // If it's just the 'error:' line, we'll wait for the message on the next line or just count it
        if (line.includes('"error":')) {
           recentErrors.push({ time: new Date().toLocaleTimeString().split(' ')[0], msg: 'API Error (JSON)', full: line });
           continue;
        }
      }
      unparsed.push(line);
      continue;
    }

    if (isStubExt) continue; // known format, just skip counting

    // Count by level
    if (line.includes(' INFO ')) stats.info++;
    else if (line.includes(' WARN ')) {
      stats.warn++;
      const timeMatch = line.match(/^(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2}))/);
      const time = timeMatch ? timeMatch[2] : '??:??:??';
      const msgMatch = line.match(/:\s+(.+?)(?:\s+\w+=|$)/);
      const msg = msgMatch ? msgMatch[1] : line.slice(50);
      recentWarnings.push({ time, msg, full: line });
    }
    else if (line.includes(' ERROR ') || (line.includes('"error":') && line.includes('{'))) {
      stats.error++;
      const timeMatch = line.match(/^(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2}))/);
      const time = timeMatch ? timeMatch[2] : '??:??:??';

      let msg = 'Unknown error';
      if (line.includes('"message":')) {
        const msgMatch = line.match(/"message":\s*"([^"]+)"/);
        msg = msgMatch ? msgMatch[1] : 'API Error';
      } else {
        const msgMatch = line.match(/:\s+(.+?)(?:\s+\w+=|$)/);
        msg = msgMatch ? msgMatch[1] : line.slice(50);
      }

      recentErrors.push({ time, msg, full: line });
    }
    else if (line.includes(' DEBUG ')) stats.debug++;

    // Model requests: POST /v1/messages model=xxx
    const modelMatch = line.match(/POST \/v1\/messages\s+model=(\S+)/);
    if (modelMatch) {
      const model = modelMatch[1];
      modelRequests[model] = (modelRequests[model] || 0) + 1;
    }

    // TLS handshakes
    const tlsMatch = line.match(/TLS handshake successful.*?domain="([^"]+)"/);
    if (tlsMatch) {
      tlsHandshakes.add(tlsMatch[1]);
    }

    // MITM interceptions
    if (mitmModifyPattern.test(line)) {
      mitmInterceptions++;
    }
  }

  return {
    stats,
    modelRequests,
    recentWarnings: recentWarnings.slice(-15),
    recentErrors: recentErrors.slice(-15),
    unparsed,
    tlsDomains: [...tlsHandshakes],
    mitmInterceptions,
    formattedLines: lines.map(l => formatLogLine(l)),
  };
}


export default function Dashboard() {
  const [containerState, setContainerState] = useState(null);
  const [zgHealth, setZgHealth] = useState(null);
  const [logs, setLogs] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [activeAccount, setActiveAccount] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [models, setModels] = useState([]);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logsSubTab, setLogsSubTab] = useState('summary');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [quotas, setQuotas] = useState(null);
  const logBoxRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setContainerState(data.state);
        setZgHealth(data.zgHealth);
        if (data.models && Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
        }
      } else {
        setContainerState('error');
      }
    } catch {
      setContainerState('error');
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs?tail=200');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || '');
      }
    } catch { /* silent */ }
  };

  const fetchQuotas = async () => {
    try {
      const res = await fetch('/api/quota');
      if (res.ok) {
        const data = await res.json();
        setQuotas(data);
      }
    } catch { /* silent */ }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.accounts)) {
          setAccounts(data.accounts);
          setActiveAccount(data.active || '');
        } else {
          setAccounts([]);
        }
      }
    } catch { /* silent */ }
  };

  const fetchData = async () => {
    await Promise.all([fetchStatus(), fetchLogs(), fetchAccounts(), fetchQuotas()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
      fetchQuotas();
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logs, logsSubTab]);

  const handleAction = async (action) => {
    const verb = action.charAt(0).toUpperCase() + action.slice(1);
    if (!confirm(`${verb} the ZeroGravity container?`)) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        showToast(`Container ${action}ed successfully.`);
        setTimeout(() => { fetchStatus(); fetchLogs(); }, 2500);
      } else {
        const d = await res.json();
        showToast(`Failed: ${d.error}`, 'error');
      }
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtractAccount = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extract' }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.duplicate) {
          showToast(data.warning, 'warning');
        } else {
          showToast('Account added safely!', 'success');
          setWizardStep(4);
        }
        await fetchAccounts();
      } else {
        showToast('Error: ' + data.error, 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccountAction = async (action, email) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload: { email } }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Done!');
        await fetchAccounts();
      } else {
        showToast('Error: ' + data.error, 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = useCallback((text, idx) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 1500);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontFamily: 'var(--font-heading)', fontWeight: 700, background: 'linear-gradient(135deg, var(--zg-primary), var(--zg-accent-teal))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ZeroGravity
          </div>
          <div style={{ color: 'var(--zg-text-muted)', marginTop: '0.4rem', fontSize: '0.85rem' }}>Loading control panel...</div>
        </div>
      </div>
    );
  }

  const isUp = containerState === 'running';
  const stateBadgeColor = isUp ? 'var(--zg-success)' : 'var(--zg-error)';
  const parsed = parseLogs(logs);

  return (
    <>

      {/* ── Wizard Modal ── */}
      {showWizard && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in">
            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Add New Account
              <button onClick={() => { setShowWizard(false); setWizardStep(1); }} style={{ color: 'var(--zg-text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
            </h3>
            
            <div className="wizard-steps-indicator">
              <div className={`wizard-dot ${wizardStep >= 1 ? 'active' : ''}`}></div>
              <div className="wizard-line"></div>
              <div className={`wizard-dot ${wizardStep >= 2 ? 'active' : ''}`}></div>
              <div className="wizard-line"></div>
              <div className={`wizard-dot ${wizardStep >= 3 ? 'active' : ''}`}></div>
            </div>

            <div className="wizard-body">
              {wizardStep === 1 && (
                <div>
                  <h4 style={{ color: 'var(--zg-text-primary)' }}>Step 1: Open Antigravity</h4>
                  <p style={{ color: 'var(--zg-text-muted)', fontSize: '0.85rem', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
                    Open the official Antigravity desktop application on your computer.
                  </p>
                  <button className="btn-primary w-full" onClick={() => setWizardStep(2)}>Next</button>
                </div>
              )}
              {wizardStep === 2 && (
                <div>
                  <h4 style={{ color: 'var(--zg-text-primary)' }}>Step 2: Sign In</h4>
                  <p style={{ color: 'var(--zg-text-muted)', fontSize: '0.85rem', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
                    Sign out of any existing account if necessary, and log in with the new Google account you wish to add. Wait until the chat interface fully loads.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-secondary" onClick={() => setWizardStep(1)}>Back</button>
                    <button className="btn-primary" style={{ flex: 1 }} onClick={() => setWizardStep(3)}>Next</button>
                  </div>
                </div>
              )}
              {wizardStep === 3 && (
                <div>
                  <h4 style={{ color: 'var(--zg-text-primary)' }}>Step 3: Extract Token</h4>
                  <p style={{ color: 'var(--zg-text-muted)', fontSize: '0.85rem', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
                    Once you&apos;re completely logged in on the desktop app, click the button below. ZeroGravity will safely extract the new refresh token.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-secondary" disabled={actionLoading} onClick={() => setWizardStep(2)}>Back</button>
                    <button className="btn-primary" style={{ flex: 1, position: 'relative', overflow: 'hidden' }} disabled={actionLoading} onClick={handleExtractAccount}>
                      {actionLoading && <span className="btn-loading-bg"></span>}
                      {actionLoading ? 'Extracting...' : 'Extract Token'}
                    </button>
                  </div>
                </div>
              )}
              {wizardStep === 4 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: 'var(--zg-success-glow)', color: 'var(--zg-success)', marginBottom: '1rem' }}>
                    ✔
                  </div>
                  <h4 style={{ color: 'var(--zg-text-primary)' }}>Success!</h4>
                  <p style={{ color: 'var(--zg-text-muted)', fontSize: '0.85rem', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
                    Your new account has been successfully added to ZeroGravity.
                  </p>
                  <button className="btn-primary w-full" onClick={() => { setShowWizard(false); setWizardStep(1); }}>Done</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.msg}
        </div>
      )}

      <div className="app-shell">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <h1>ZeroGravity</h1>
            <p>LLM Proxy Admin</p>
          </div>

          <nav className="sidebar-nav">
            <div
              className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              {Icons.dashboard}
              Dashboard
            </div>
            <div
              className={`sidebar-nav-item ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              {Icons.logs}
              Logs
              {parsed.stats.error > 0 && (
                <span className="sidebar-badge error">{parsed.stats.error}</span>
              )}
            </div>
            <div
              className={`sidebar-nav-item ${activeTab === 'unparsed' ? 'active' : ''}`}
              onClick={() => setActiveTab('unparsed')}
              style={parsed.unparsed.length > 0 ? { color: 'var(--zg-warning)' } : {}}
            >
              {Icons.alert}
              Unparsed
              {parsed.unparsed.length > 0 && (
                <span className="sidebar-badge warn">{parsed.unparsed.length}</span>
              )}
            </div>
          </nav>

          <div className="sidebar-status">
            <div className="sidebar-status-row">
              <span className="status-dot" style={{ backgroundColor: stateBadgeColor, boxShadow: `0 0 8px ${stateBadgeColor}`, flexShrink: 0 }} />
              Container: <strong style={{ color: stateBadgeColor }}>{containerState || 'unknown'}</strong>
            </div>
            <div className="sidebar-status-row">
              <span className="status-dot" style={{ backgroundColor: zgHealth === 'healthy' ? 'var(--zg-success)' : 'var(--zg-warning)', boxShadow: `0 0 8px ${zgHealth === 'healthy' ? 'var(--zg-success)' : 'var(--zg-warning)'}`, flexShrink: 0 }} />
              Proxy: <strong>{zgHealth || '?'}</strong>
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="main-content">

          {/* ═══════════ DASHBOARD TAB ═══════════ */}
          {activeTab === 'dashboard' && (
            <div className="animate-fade-in">
              <div className="page-header">
                <h2>Dashboard</h2>
                <p>Manage your ZeroGravity proxy and accounts</p>
              </div>

              <div className="grid grid-cols-2" style={{ marginBottom: '1.25rem' }}>
                {/* Container Controls */}
                <div className="glass-panel animate-fade-in stagger-1" style={{ opacity: 0 }}>
                  <div className="panel-title">Container Control</div>
                  <div style={{ display: 'flex', gap: '0.65rem' }}>
                    <button className="btn-secondary" disabled={actionLoading} onClick={() => handleAction(isUp ? 'stop' : 'start')}>
                      {isUp ? 'Stop' : 'Start'}
                    </button>
                    <button className="btn-primary" disabled={actionLoading || !isUp} onClick={() => handleAction('restart')}>
                      Restart
                    </button>
                  </div>
                  {actionLoading && <p style={{ marginTop: '0.6rem', color: 'var(--zg-text-muted)', fontSize: '0.8rem' }}>Processing...</p>}
                </div>

                {/* Quick Stats */}
                <div className="glass-panel animate-fade-in stagger-2" style={{ opacity: 0 }}>
                  <div className="panel-title">Quick Stats</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--zg-info)' }}>{parsed.stats.info}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--zg-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Info</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--zg-warning)' }}>{parsed.stats.warn}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--zg-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Warn</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--zg-error)' }}>{parsed.stats.error}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--zg-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Error</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Accounts */}
              <div className="glass-panel animate-fade-in stagger-3" style={{ marginBottom: '1.25rem', opacity: 0 }}>
                                <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Accounts <span style={{ marginLeft: '0.4rem', fontWeight: 400, fontSize: '0.72rem', color: 'var(--zg-text-muted)' }}>({accounts.length} found)</span></span>
                  <button className="btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem' }} onClick={() => setShowWizard(true)}>+ Add Account</button>
                </div>

                {accounts.length === 0 ? (
                  <p style={{ color: 'var(--zg-text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>No accounts found in accounts.json.</p>
                ) : (
                  <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    {accounts.map(acc => (
                      <div key={acc.email} className={`account-item ${acc.email === activeAccount ? 'active' : ''}`}>
                        <div style={{ overflow: 'hidden', minWidth: 0 }}>
                          <div className="account-email">
                            {acc.email === activeAccount && <span style={{ color: 'var(--zg-primary)', marginRight: '0.35rem' }}>*</span>}
                            {acc.email}
                          </div>
                          {acc.extracted_at && (
                            <div className="account-meta">Token: {new Date(acc.extracted_at).toLocaleDateString()}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                          {acc.email !== activeAccount && (
                            <button className="btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} disabled={actionLoading} onClick={() => handleAccountAction('set', acc.email)}>
                              Set Active
                            </button>
                          )}
                          <button className="btn-danger" disabled={actionLoading} onClick={() => handleAccountAction('remove', acc.email)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                
              </div>

              {/* Models & Quotas */}
              <div className="glass-panel animate-fade-in stagger-4" style={{ opacity: 0 }}>
                <div className="panel-title">Available Models & Quotas</div>
                {models.length === 0 ? (
                  <p style={{ color: 'var(--zg-text-muted)', fontSize: '0.85rem' }}>Waiting for ZeroGravity proxy API...</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {models.map(m => (
                        <span key={m.id} className="model-tag" title={m.meta?.label}>
                          {m.id}
                        </span>
                      ))}
                    </div>
                    {quotas && quotas.models && quotas.models.length > 0 && (
                      <div className="quota-header-info animate-fade-in" style={{ padding: '0.75rem 0', borderTop: '1px solid var(--zg-glass-border)', display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        {quotas.plan && (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--zg-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--zg-primary-hover)' }}>{quotas.plan.plan_name}</span>
                          </div>
                        )}
                        {quotas.last_updated && (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--zg-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last updated</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--zg-text-secondary)', fontFamily: 'var(--font-mono)' }}>{new Date(quotas.last_updated).toLocaleTimeString()}</span>
                          </div>
                        )}
                        {(quotas.account_banned || quotas.account_restricted) && (
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--zg-error-glow)', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
                            <span style={{ color: 'var(--zg-error)', fontSize: '1rem' }}>⚠</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--zg-error)', fontWeight: 600 }}>ACCOUNT {quotas.account_banned ? 'BANNED' : 'RESTRICTED'}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {quotas && quotas.models && quotas.models.length > 0 && (
                      <div className="quota-grid">
                        {quotas.models.map((q, idx) => {
                          const percent = q.remaining_pct ?? 0;
                          let barColor = 'var(--zg-success)';
                          if (percent < 25) barColor = 'var(--zg-error)';
                          else if (percent < 50) barColor = 'var(--zg-warning)';

                          return (
                            <div key={idx} className="quota-card">
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--zg-text-primary)' }}>{q.label || q.model_id}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--zg-text-muted)', fontFamily: 'var(--font-mono)' }}>{percent}%</span>
                              </div>
                              <div className="progress-bg" style={{ marginBottom: '0.5rem' }}>
                                <div className="progress-fill" style={{ width: `${percent}%`, background: barColor }} />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--zg-text-muted)' }}>
                                <span>{q.remaining_fraction ? (q.remaining_fraction * 100).toFixed(0) + '% rem.' : ''}</span>
                                <span>Reset in {q.reset_in_human || 'N/A'}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════ LOGS TAB ═══════════ */}
          {activeTab === 'logs' && (
            <div className="animate-fade-in">
              <div className="page-header">
                <h2>Logs</h2>
                <p>Real-time monitoring and log analysis</p>
              </div>

              {/* Sub-tabs */}
              <div className="subtab-bar">
                <div className={`subtab-item ${logsSubTab === 'summary' ? 'active' : ''}`} onClick={() => setLogsSubTab('summary')}>
                  Summary
                </div>
                <div className={`subtab-item ${logsSubTab === 'raw' ? 'active' : ''}`} onClick={() => setLogsSubTab('raw')}>
                  Raw Terminal
                </div>
              </div>

              {logsSubTab === 'summary' && (
                <div className="animate-fade-in">
                  {/* Stats Row */}
                  <div className="grid grid-cols-4" style={{ marginBottom: '1.25rem' }}>
                    <div className="stat-card info animate-fade-in stagger-1" style={{ opacity: 0 }}>
                      <div className="stat-card-label">Info</div>
                      <div className="stat-card-value">{parsed.stats.info}</div>
                    </div>
                    <div className="stat-card warn animate-fade-in stagger-2" style={{ opacity: 0 }}>
                      <div className="stat-card-label">Warning</div>
                      <div className="stat-card-value">{parsed.stats.warn}</div>
                    </div>
                    <div className="stat-card error animate-fade-in stagger-3" style={{ opacity: 0 }}>
                      <div className="stat-card-label">Error</div>
                      <div className="stat-card-value">{parsed.stats.error}</div>
                    </div>
                    <div className="stat-card success animate-fade-in stagger-4" style={{ opacity: 0 }}>
                      <div className="stat-card-label">MITM Mods</div>
                      <div className="stat-card-value">{parsed.mitmInterceptions}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2">
                    {/* Model Requests */}
                    <div className="glass-panel animate-fade-in stagger-5" style={{ opacity: 0 }}>
                      <div className="panel-title">Requests by Model</div>
                      {Object.keys(parsed.modelRequests).length === 0 ? (
                        <p style={{ color: 'var(--zg-text-muted)', fontSize: '0.82rem' }}>No model requests in current logs.</p>
                      ) : (
                        <div>
                          {Object.entries(parsed.modelRequests).sort((a, b) => b[1] - a[1]).map(([model, count]) => (
                            <div key={model} className="request-stat-row">
                              <span className="request-stat-model">{model}</span>
                              <span className="request-stat-count">{count}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {parsed.tlsDomains.length > 0 && (
                        <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--zg-glass-border)' }}>
                          <div className="panel-title" style={{ marginBottom: '0.5rem' }}>TLS Domains</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {parsed.tlsDomains.map(d => (
                              <span key={d} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)', background: 'var(--zg-accent-teal-glow)', color: 'var(--zg-accent-teal)', border: '1px solid rgba(45, 212, 191, 0.15)' }}>
                                {d}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Recent Warnings & Errors */}
                    <div className="glass-panel animate-fade-in stagger-6" style={{ opacity: 0 }}>
                      <div className="panel-title">Recent Warnings & Errors</div>
                      {parsed.recentWarnings.length === 0 && parsed.recentErrors.length === 0 ? (
                        <p style={{ color: 'var(--zg-text-muted)', fontSize: '0.82rem' }}>All clear — no warnings or errors.</p>
                      ) : (
                        <ul className="log-event-list">
                          {[...parsed.recentErrors, ...parsed.recentWarnings].slice(-12).reverse().map((ev, i) => (
                            <li key={i} className="log-event-item">
                              <span className="log-event-time">{ev.time}</span>
                              <span className={`log-event-level ${parsed.recentErrors.includes(ev) ? 'error' : 'warn'}`}>
                                {parsed.recentErrors.includes(ev) ? 'ERR' : 'WARN'}
                              </span>
                              <span className="log-event-msg" title={ev.msg}>{ev.msg}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {logsSubTab === 'raw' && (
                <div className="animate-fade-in">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div className="live-indicator">
                      <span className="live-dot" />
                      Auto-updating every 5s
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--zg-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {parsed.stats.total} lines
                    </span>
                  </div>
                  <div ref={logBoxRef} className="log-terminal">
                    {parsed.formattedLines.length === 0 ? (
                      <span style={{ color: 'var(--zg-text-muted)' }}>No logs available.</span>
                    ) : parsed.formattedLines.map((line, i) => (
                      <div key={i} className={`log-line ${line.cls}`}>
                        {line.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════ UNPARSED TAB ═══════════ */}
          {activeTab === 'unparsed' && (
            <div className="animate-fade-in">
              <div className="page-header">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: 'var(--zg-warning)' }}>{Icons.alert}</span>
                  Unparsed Logs
                </h2>
                <p>Log lines that could not be parsed by the dashboard. Please report these so we can improve parsing.</p>
              </div>

              {parsed.unparsed.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.3 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48" style={{ margin: '0 auto', display: 'block', color: 'var(--zg-success)' }}>
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p style={{ color: 'var(--zg-text-secondary)', fontSize: '0.92rem', fontWeight: 500 }}>All logs parsed successfully</p>
                  <p style={{ color: 'var(--zg-text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>No unknown log formats detected.</p>
                </div>
              ) : (
                <>
                  <div className="glass-panel" style={{ marginBottom: '1rem', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderColor: 'rgba(251, 191, 36, 0.2)', background: 'rgba(251, 191, 36, 0.04)' }}>
                    <span style={{ color: 'var(--zg-warning)', flexShrink: 0 }}>{Icons.alert}</span>
                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--zg-text-primary)' }}>
                        {parsed.unparsed.length} log line{parsed.unparsed.length !== 1 ? 's' : ''} could not be parsed
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--zg-text-muted)', marginTop: '0.15rem' }}>
                        Copy the log lines below and report them at the project repository so we can improve the parser.
                      </p>
                    </div>
                    <button
                      className="btn-secondary"
                      style={{ marginLeft: 'auto', flexShrink: 0, fontSize: '0.78rem', padding: '0.4rem 0.8rem', gap: '0.3rem' }}
                      onClick={() => copyToClipboard(parsed.unparsed.join('\n'), 'all')}
                    >
                      {Icons.copy}
                      {copiedIndex === 'all' ? 'Copied!' : 'Copy All'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {parsed.unparsed.map((line, i) => (
                      <div
                        key={i}
                        className="glass-panel"
                        style={{
                          padding: '0.65rem 0.85rem',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.7rem',
                          borderColor: 'rgba(251, 191, 36, 0.1)',
                          cursor: 'pointer',
                          transition: 'all 120ms ease',
                        }}
                        onClick={() => copyToClipboard(line, i)}
                        title="Click to copy"
                      >
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--zg-text-muted)', flexShrink: 0, paddingTop: '2px', minWidth: '1.5rem', textAlign: 'right' }}>
                          {i + 1}
                        </span>
                        <code style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.76rem',
                          color: 'var(--zg-warning)',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          flex: 1,
                          userSelect: 'all',
                        }}>
                          {line}
                        </code>
                        <span style={{ flexShrink: 0, color: copiedIndex === i ? 'var(--zg-success)' : 'var(--zg-text-muted)', transition: 'color 150ms ease' }}>
                          {copiedIndex === i ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : Icons.copy}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                    <a
                      href="https://github.com/zerograviity/web-admin/issues/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary"
                      style={{ textDecoration: 'none', gap: '0.4rem' }}
                    >
                      Report on GitHub {Icons.externalLink}
                    </a>
                  </div>
                </>
              )}
            </div>
          )}

        </main>
      </div>
    </>
  );
}
