import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SpectatorView from '../game/SpectatorView';

// Browser spectators (outside Discord): log in with a spectator username and password, pick a
// live room and watch every hand. Spectators are invisible to the players; they can move cards
// between any two players for testing, with no rules.
const TOKEN_KEY = 'set-club-spectator';
const loadAuth = () => { try { const a = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); return a?.token ? a : null; } catch { return null; } };
const saveAuth = (a) => { try { a ? sessionStorage.setItem(TOKEN_KEY, JSON.stringify(a)) : sessionStorage.removeItem(TOKEN_KEY); } catch {} };
const wsUrl = (path) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`;

export default function SpectatePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [auth, setAuth] = useState(loadAuth);
  const logout = (why) => { saveAuth(null); setAuth(null); if (why) setNotice(why); navigate('/spectate'); };
  const [notice, setNotice] = useState(null);

  if (!auth) return <Login notice={notice} onDone={(a) => { saveAuth(a); setAuth(a); setNotice(null); }} />;
  return roomId
    ? <Watch key={roomId} roomId={roomId} auth={auth} onLeave={(why) => { if (why) setNotice(why); navigate('/spectate'); }} onAuthFail={logout} />
    : <Rooms auth={auth} notice={notice} onPick={(id) => { setNotice(null); navigate(`/spectate/${encodeURIComponent(id)}`); }} onLogout={() => logout()} onAuthFail={logout} />;
}

function Shell({ children, right }) {
  return <main className="spectate-page">
    <header className="spectate-bar">
      <span className="club-eyebrow">SET CLUB · SPECTATOR</span>
      {right}
    </header>
    {children}
  </main>;
}

function Login({ onDone, notice }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(notice);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/v1/spectate/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || 'Login failed');
      onDone({ token: data.token, user: data.user });
    } catch (err) { setError(err.message); setPassword(''); }
    finally { setBusy(false); }
  };
  return <Shell>
    <form className="spectate-card spectate-login" onSubmit={submit}>
      <h1>Spectator login</h1>
      <p>Watch any table from your browser. Players won't see you.</p>
      <label>Username<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error && <div className="spectate-error" role="alert">{error}</div>}
      <button type="submit" className="club-primary" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
    </form>
  </Shell>;
}

function Rooms({ auth, notice, onPick, onLogout, onAuthFail }) {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/v1/spectate/rooms', { headers: { Authorization: `Bearer ${auth.token}` } });
        if (r.status === 401) return onAuthFail('Your login expired. Please log in again.');
        if (!r.ok) throw new Error('Could not load the rooms');
        const data = await r.json();
        if (alive) { setRooms(data.rooms); setError(null); }
      } catch (e) { if (alive) setError(e.message); }
    };
    load();
    const id = setInterval(load, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [auth.token]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Shell right={<span className="spectate-user">{auth.user} · <button type="button" onClick={onLogout}>Log out</button></span>}>
    <section className="spectate-card">
      <h1>Live rooms</h1>
      {notice && <div className="spectate-error" role="status">{notice}</div>}
      {error && <div className="spectate-error" role="alert">{error}</div>}
      {!rooms ? <p>Loading…</p> : !rooms.length ? <p>No rooms are open right now. This list refreshes by itself.</p> : (
        <ul className="spectate-rooms">
          {rooms.map((r) => <li key={r.room_id}>
            <button type="button" onClick={() => onPick(r.room_id)}>
              <span className={`spectate-phase spectate-phase--${r.phase}`}>{r.phase === 'playing' ? 'In play' : r.phase === 'lobby' ? 'Lobby' : 'Between rounds'}</span>
              <strong>{r.players.length ? r.players.map((p) => p.name).join(', ') : 'Nobody seated yet'}</strong>
              <small>{r.game_mode === 'turns' ? 'Turn Play' : 'Voice Play'} · Team A {r.scores?.A ?? 0} – {r.scores?.B ?? 0} Team B · {r.room_id}</small>
            </button>
          </li>)}
        </ul>
      )}
    </section>
  </Shell>;
}

function Watch({ roomId, auth, onLeave, onAuthFail }) {
  const [state, setState] = useState(null);
  const [ws, setWs] = useState(null);
  const [flash, setFlash] = useState(null);
  const closedOn = useRef(false);
  useEffect(() => {
    let retry = null, sock = null, stopped = false;
    const open = () => {
      sock = new WebSocket(wsUrl(`/api/v1/spectate/ws/${encodeURIComponent(roomId)}?token=${encodeURIComponent(auth.token)}`));
      sock.onopen = () => setWs(sock);
      sock.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === 'state') setState(m.payload);
        else if (m.payload?.state) setState(m.payload.state);
        if (m.type === 'room_closed') { closedOn.current = true; onLeave('That room has closed.'); }
        if (m.type === 'spectator_pass_cards_result') setFlash(m.payload.success
          ? `${m.payload.from_name} → ${m.payload.to_name}: ${m.payload.cards.length} card${m.payload.cards.length === 1 ? '' : 's'}`
          : m.payload.error || 'Could not move those cards');
      };
      sock.onclose = (ev) => {
        setWs(null);
        if (stopped || closedOn.current) return;
        if (ev.code === 4401) return onAuthFail('Your login expired. Please log in again.');
        if (ev.code === 4404) return onLeave('That room has closed.');
        retry = setTimeout(open, 3000);
      };
    };
    open();
    return () => { stopped = true; clearTimeout(retry); sock?.close(1000); };
  }, [roomId, auth.token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 3500); return () => clearTimeout(t); }, [flash]);
  return <Shell right={<span className="spectate-user">{ws ? '● Live' : 'Connecting…'} · <button type="button" onClick={() => onLeave()}>All rooms</button></span>}>
    {flash && <div className="spectate-flash" role="status">{flash}</div>}
    {!state ? <p className="spectate-card">Joining the table…</p>
      : <SpectatorView players={state.players || {}} gamePhase={state.phase} ws={ws} tools />}
  </Shell>;
}
