import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { Bug, Trophy, Users, Zap, Clock3, Code2, ArrowRight, Copy, Check, Wifi, WifiOff, RotateCcw, Terminal, Sparkles, LogOut } from "lucide-react";
import "./styles.css";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const socket = io(SERVER_URL, { autoConnect: true, reconnection: true, reconnectionAttempts: 8 });
const SOLO_QUESTIONS = [
  { title:"List index", code:"numbers = [1, 2, 3]\nprint(numbers[3])", options:["Use numbers[2]","Use numbers(3)","Use numbers[4]","Use numbers[-4]"], answer:0, explanation:"Python lists use zero-based indexes. The last item in a three-item list is at index 2, so numbers[3] raises IndexError." },
  { title:"Indentation", code:"for n in range(3):\nprint(n)", options:["Indent print(n) inside the loop","Add a semicolon after range(3)","Change range to loop","Wrap print in quotes"], answer:0, explanation:"The loop body must be indented. Indent print(n) by four spaces so Python knows it belongs to the loop." },
  { title:"Equality check", code:"age = 18\nif age = 18:\n    print('Adult')", options:["Use == in the condition","Use === in the condition","Remove age","Use := instead"], answer:0, explanation:"A single = assigns a value. Use == to compare two values in an if condition." },
  { title:"String quotes", code:"name = 'Aslam\nprint(name)", options:["Close the string with a quote","Remove print","Use a comma after name","Change name to a list"], answer:0, explanation:"A string opened with a quote must be closed. For example: name = 'Aslam'." },
  { title:"Loop range", code:"for i in range(1, 4)\n    print(i)", options:["Add a colon after range(1, 4)","Add a comma after for","Use range[1, 4]","Remove indentation"], answer:0, explanation:"Python compound statements such as for loops end their header with a colon." },
  { title:"Function return", code:"def double(n):\n    n * 2\n\nprint(double(4))", options:["Return n * 2 from the function","Rename def to function","Put n outside parentheses","Use print before def"], answer:0, explanation:"An expression alone does not become the function result. `return n * 2` sends the computed value back to the caller." },
  { title:"Boolean logic", code:"is_ready = True\nif is_ready = True:\n    print('Go!')", options:["Use `if is_ready:` or `==`","Change True to 'true'","Use `if True = is_ready:`","Remove the colon"], answer:0, explanation:"Use a comparison with ==, or simply test the Boolean variable directly with `if is_ready:`." },
  { title:"String method", code:"city = 'pune'\nprint(city.upper)", options:["Call the method with upper()","Use city.UPPER()","Use upper[city]","Add a colon after city"], answer:0, explanation:"Methods need parentheses to be called. `city.upper` refers to the method; `city.upper()` returns the uppercase string." },
  { title:"List append", code:"items = ['pen']\nitems.append['book']\nprint(items)", options:["Use items.append('book')","Use items.add('book')","Use append(items, 'book') only","Use items.push('book')"], answer:0, explanation:"append is a list method, so call it with parentheses: `items.append('book')`." },
  { title:"Integer conversion", code:"number = '12'\nprint(number + 3)", options:["Convert number with int(number)","Convert 3 to a string and expect numeric addition","Use number[3]","Use number = 12 + '3'"], answer:0, explanation:"A string and an integer cannot be added directly. Convert the string to an integer with `int(number)` before adding 3." }
];

function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [, setClockTick] = useState(Date.now());
  const [username, setUsername] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [mode, setMode] = useState("home");
  const [room, setRoom] = useState(null);
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [soloIndex, setSoloIndex] = useState(0);
  const [soloAnswers, setSoloAnswers] = useState({});
  const [soloStarted, setSoloStarted] = useState(false);
  const [soloDeadline, setSoloDeadline] = useState(null);
  const [soloNow, setSoloNow] = useState(Date.now());
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const clock = setInterval(() => setClockTick(Date.now()), 250);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onJoined = ({ code, playerId: id }) => { setPlayerId(id); setRoomInput(code); setMode("lobby"); setError(""); };
    const onState = state => { setRoom(state); if (state.status === "playing") setSelected(null); };
    const onError = data => setError(data?.message || "Something went wrong.");
    socket.on("connect", onConnect); socket.on("disconnect", onDisconnect);
    socket.on("room:joined", onJoined); socket.on("room:state", onState); socket.on("game:error", onError);
    return () => { socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); socket.off("room:joined", onJoined); socket.off("room:state", onState); socket.off("game:error", onError); };
  }, []);

  useEffect(() => {
    if (mode !== "solo" || !soloStarted || soloDeadline == null || soloAnswers[soloIndex]) return;
    const interval = setInterval(() => setSoloNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [mode, soloStarted, soloDeadline, soloIndex, soloAnswers]);

  useEffect(() => {
    if (mode === "solo" && soloStarted && soloDeadline && soloNow >= soloDeadline && !soloAnswers[soloIndex]) {
      setSoloAnswers(prev => ({ ...prev, [soloIndex]: { choice: null, points: 0 } }));
    }
  }, [soloNow, mode, soloStarted, soloDeadline, soloIndex, soloAnswers]);

  const isSoloReveal = Boolean(soloAnswers[soloIndex]);
  const soloRemaining = soloDeadline ? Math.max(0, Math.ceil((soloDeadline - soloNow) / 1000)) : 20;
  const player = room?.players?.find(p => p.id === playerId);
  const sortedPlayers = useMemo(() => [...(room?.players || [])].sort((a,b) => b.score-a.score || a.username.localeCompare(b.username)), [room?.players]);

  function createRoom() {
    setError("");
    if (!username.trim()) return setError("Enter a username first.");
    if (!connected) return setError("The game server is offline. Start the server and try again.");
    socket.emit("room:create", { username });
  }
  function joinRoom() {
    setError("");
    if (!username.trim()) return setError("Enter a username first.");
    if (!roomInput.trim()) return setError("Enter a room code.");
    if (!connected) return setError("The game server is offline. Start the server and try again.");
    socket.emit("room:join", { code: roomInput, username });
  }
  function startSolo() {
    setSoloIndex(0); setSoloAnswers({}); setSoloStarted(true); setSoloNow(Date.now()); setSoloDeadline(Date.now()+20000); setSelected(null); setMode("solo"); setError("");
  }
  function answerSolo(choice) {
    if (isSoloReveal) return;
    const correct = choice === SOLO_QUESTIONS[soloIndex].answer;
    const remaining = Math.max(0, soloDeadline-Date.now());
    setSoloAnswers(prev => ({ ...prev, [soloIndex]: { choice, points: correct ? 100 + Math.round(50*remaining/20000) : 0 } }));
  }
  function nextSolo() {
    if (soloIndex === 9) { setMode("solo-finished"); return; }
    const next = soloIndex + 1;
    setSoloIndex(next); setSelected(null); setSoloNow(Date.now()); setSoloDeadline(Date.now()+20000);
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(room?.code || roomInput); setCopied(true); setTimeout(() => setCopied(false), 1400); }
    catch { setError("Copy was blocked by the browser. Select and copy the room code manually."); }
  }
  function backHome() { setMode("home"); setRoom(null); setPlayerId(""); setError(""); setSoloStarted(false); }
  const soloScore = Object.values(soloAnswers).reduce((sum, a) => sum + a.points, 0);

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={backHome}><span className="brand-mark"><Bug size={23}/></span><span>BUG HUNT <b>ARENA</b></span></button>
      <div className={`connection ${connected ? "online" : "offline"}`}><span className="pulse-dot"/>{connected ? "SERVER CONNECTED" : "SERVER OFFLINE"}</div>
    </header>
    <main>
      {mode === "home" && <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line"/> PYTHON DEBUGGING BATTLE</div>
          <h1>Find the bug.<br/><span>Claim the crown.</span></h1>
          <p className="hero-description">Race the clock, fix real Python mistakes, and climb the leaderboard. Think fast. Debug faster.</p>
          <div className="hero-stats">
            <div><strong>10</strong><span>CHALLENGES</span></div><div><strong>20<span className="stat-unit">s</span></strong><span>PER ROUND</span></div><div><strong>150</strong><span>MAX POINTS / ROUND</span></div>
          </div>
        </div>
        <div className="terminal-card">
          <div className="terminal-head"><div className="window-dots"><i/><i/><i/></div><span><Terminal size={13}/> bug_hunt.py</span><span className="terminal-live">● LIVE</span></div>
          <div className="terminal-body"><div className="line-number">01<br/>02<br/>03<br/>04</div><pre><span className="code-purple">def</span> <span className="code-green">find_bug</span>(items):{"\n"}    <span className="code-purple">for</span> item <span className="code-purple">in</span> items{"\n"}    <span className="code-yellow">print</span>(item){"\n"}find_bug([<span className="code-orange">1, 2, 3</span>])</pre></div>
          <div className="terminal-foot"><span className="bug-tag"><Bug size={13}/> SYNTAX ERROR DETECTED</span><span className="blinking-cursor">▌</span></div>
          <div className="float-score"><Zap size={17}/><span><b>+150 XP</b><small>BUG SQUASHED!</small></span></div>
        </div>
        <section className="join-panel">
          <div className="panel-heading"><div><span className="section-kicker">READY PLAYER ONE?</span><h2>Enter the arena</h2></div><div className="players-icon"><Users size={21}/></div></div>
          <label className="field-label" htmlFor="username">YOUR CODENAME</label>
          <input id="username" maxLength={18} value={username} onChange={e=>setUsername(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createRoom()} placeholder="e.g. CodeNinja" autoComplete="nickname"/>
          <div className="join-actions"><button className="primary-button" onClick={createRoom}><Users size={17}/> Create room <ArrowRight size={17}/></button><div className="or-divider"><span/> OR <span/></div><div className="join-room-row"><input aria-label="Room code" maxLength={6} value={roomInput} onChange={e=>setRoomInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&joinRoom()} placeholder="ROOM CODE"/><button className="secondary-button" onClick={joinRoom}>Join room <ArrowRight size={16}/></button></div><button className="solo-button" onClick={startSolo}><Code2 size={17}/> Practice solo <span>NO ROOM NEEDED</span></button></div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="panel-foot"><span><Wifi size={14}/> REAL-TIME MULTIPLAYER</span><span><Sparkles size={14}/> FREE TO PLAY</span></div>
        </section>
        <div className="hero-bottom"><span>BUILT FOR CURIOUS MINDS</span><span>01 / DEBUG YOUR LIMITS</span></div>
      </section>}

      {mode === "lobby" && <section className="game-layout lobby-layout">
        <div className="game-main">
          <div className="eyebrow"><span className="eyebrow-line"/> ARENA LOBBY</div><h1 className="page-title">Your squad is <span>assembling.</span></h1><p className="muted">Share your room code with your friends. The host starts when everyone is ready.</p>
          <div className="room-code-card"><div><span className="section-kicker">YOUR ROOM CODE</span><div className="room-code">{room?.code || roomInput}</div></div><button className="icon-button" onClick={copyCode} aria-label="Copy room code">{copied?<Check/>:<Copy/>}</button></div>
          <div className="players-card"><div className="card-heading"><h3><Users size={18}/> Players in lobby</h3><span className="count-pill">{room?.players?.length || 0} JOINED</span></div>{sortedPlayers.map((p,i)=><div className="player-row" key={p.id}><div className="player-avatar">{p.username.slice(0,1).toUpperCase()}</div><div className="player-name">{p.username}{p.id===room?.hostId&&<span className="host-pill">HOST</span>}{p.id===playerId&&<span className="you-pill">YOU</span>}</div><span className={`status-text ${p.connected?"ready":"disconnected"}`}>{p.connected?"READY":"RECONNECTING…"}</span><span className="player-score">{p.score}</span></div>)}</div>
          {room?.hostId===playerId?<button className="primary-button wide-button" onClick={()=>socket.emit("game:start")} disabled={!room?.players?.length}>Start 10-round battle <ArrowRight size={18}/></button>:<div className="waiting-note"><span className="pulse-dot"/> Waiting for the host to start…</div>}
          <button className="text-button" onClick={backHome}><LogOut size={15}/> Leave lobby</button>{error&&<p className="error-message" role="alert">{error}</p>}
        </div>
        <aside className="side-card how-card"><div className="side-icon"><Trophy size={23}/></div><h3>How to win</h3><div className="rule"><b>01</b><span>Spot the bug in the Python snippet.</span></div><div className="rule"><b>02</b><span>Pick the right fix before time runs out.</span></div><div className="rule"><b>03</b><span>Correct answers score 100 points, plus up to 50 speed points.</span></div><div className="rule"><b>04</b><span>Highest score after 10 rounds takes the crown.</span></div><div className="tip-box"><Zap size={16}/><span><b>PRO TIP</b><br/>Accuracy first. Speed makes you legendary.</span></div></aside>
      </section>}

      {mode === "solo" && <section className="game-layout solo-layout">
        <div className="game-main">
          <div className="game-topline"><div className="eyebrow"><span className="eyebrow-line"/> SOLO PRACTICE</div><button className="text-button" onClick={backHome}><LogOut size={15}/> Exit practice</button></div>
          {soloIndex < 10 && <><div className="round-row"><div><span className="section-kicker">CHALLENGE {String(soloIndex+1).padStart(2,"0")} / 10</span><h1 className="page-title">{SOLO_QUESTIONS[soloIndex].title}</h1></div><div className={`timer ${soloRemaining<=5?"urgent":""}`}><Clock3 size={18}/><strong>00:{String(soloRemaining).padStart(2,"0")}</strong></div></div><div className="progress-track"><span style={{width:`${(soloIndex+1)*10}%`}}/></div><div className="question-card"><div className="question-label"><Code2 size={16}/> FIND THE BUG <span>PYTHON 3</span></div><pre className="code-block">{SOLO_QUESTIONS[soloIndex].code}</pre><p className="question-prompt">Which change fixes the bug?</p><div className="answers-grid">{SOLO_QUESTIONS[soloIndex].options.map((option,i)=><button key={option} disabled={isSoloReveal} onClick={()=>answerSolo(i)} className={`answer-option ${isSoloReveal&&i===SOLO_QUESTIONS[soloIndex].answer?"correct":isSoloReveal&&soloAnswers[soloIndex]?.choice===i?"incorrect":""}`}><span className="option-letter">{String.fromCharCode(65+i)}</span><span>{option}</span>{isSoloReveal&&i===SOLO_QUESTIONS[soloIndex].answer&&<Check size={17}/>}</button>)}</div>{isSoloReveal&&<div className={`explanation ${soloAnswers[soloIndex].choice===SOLO_QUESTIONS[soloIndex].answer?"success-explanation":""}`}><div className="explanation-title"><Sparkles size={17}/>{soloAnswers[soloIndex].choice===SOLO_QUESTIONS[soloIndex].answer?"BUG SQUASHED!":"LEARN FROM THE BUG"}<span>+{soloAnswers[soloIndex].points} PTS</span></div><p>{SOLO_QUESTIONS[soloIndex].explanation}</p><button className="primary-button" onClick={nextSolo}>{soloIndex===9?"See final score":"Next challenge"} <ArrowRight size={17}/></button></div>}</div></>}
        </div>
        <aside className="side-card solo-score-card"><div className="side-icon"><Trophy size={23}/></div><span className="section-kicker">YOUR SCORE</span><div className="big-score">{soloScore.toLocaleString()}<small> PTS</small></div><div className="mini-progress"><span style={{width:`${Object.keys(soloAnswers).length*10}%`}}/></div><div className="score-meta"><span>Completed</span><b>{Object.keys(soloAnswers).length} / 10</b></div><div className="score-meta"><span>Correct</span><b>{Object.entries(soloAnswers).filter(([i,a])=>a.choice===SOLO_QUESTIONS[Number(i)].answer).length}</b></div><div className="tip-box"><Zap size={16}/><span>Faster correct answers earn bonus points.</span></div></aside>
      </section>}

      {mode === "solo-finished" && <section className="finish-screen"><div className="winner-orb"><Trophy size={43}/></div><div className="eyebrow"><span className="eyebrow-line"/> PRACTICE COMPLETE</div><h1 className="page-title">Bug hunter <span>levelled up.</span></h1><p className="muted">You made it through all ten Python challenges.</p><div className="final-score-card"><span className="section-kicker">FINAL SCORE</span><strong>{soloScore.toLocaleString()}</strong><span>POINTS EARNED</span><div className="finish-stats"><div><b>{Object.entries(soloAnswers).filter(([i,a])=>a.choice===SOLO_QUESTIONS[Number(i)].answer).length}/10</b><small>CORRECT</small></div><div><b>{Object.keys(soloAnswers).length}</b><small>ATTEMPTED</small></div></div></div><button className="primary-button" onClick={startSolo}><RotateCcw size={17}/> Play again</button><button className="text-button" onClick={backHome}>Back to arena</button></section>}

      {room && ["playing","reveal","finished"].includes(room.status) && <section className="game-layout live-layout">
        {room.status !== "finished" ? <div className="game-main">
          <div className="game-topline"><div className="eyebrow"><span className="eyebrow-line"/> LIVE BATTLE <span className="live-pill">● LIVE</span></div><div className="round-badge">ROUND {room.roundIndex+1} <span>/ 10</span></div></div>
          <div className="round-row"><div><span className="section-kicker">CHALLENGE {String(room.roundIndex+1).padStart(2,"0")} / 10</span><h1 className="page-title">{room.question?.title}</h1></div><div className={`timer ${room.status==="playing"&&room.deadline-Date.now()<6000?"urgent":""}`}><Clock3 size={18}/><strong>{room.status==="playing"?`00:${String(Math.max(0,Math.ceil((room.deadline-Date.now())/1000))).padStart(2,"0")}`:"REVEAL"}</strong></div></div>
          <div className="progress-track"><span style={{width:`${(room.roundIndex+1)*10}%`}}/></div>
          <div className="question-card"><div className="question-label"><Code2 size={16}/> FIND THE BUG <span>PYTHON 3</span></div><pre className="code-block">{room.question?.code}</pre><p className="question-prompt">Which change fixes the bug?</p><div className="answers-grid">{room.question?.options.map((option,i)=><button key={option} disabled={room.status!=="playing"||Boolean(player?.answered)} onClick={()=>{setSelected(i);socket.emit("answer:submit",{choice:i});}} className={`answer-option ${room.status==="reveal"&&room.results?.correctIndex===i?"correct":room.status==="reveal"&&selected===i?"incorrect":""}`}><span className="option-letter">{String.fromCharCode(65+i)}</span><span>{option}</span>{room.status==="reveal"&&room.results?.correctIndex===i&&<Check size={17}/>}</button>)}</div>
          {room.status==="playing"&&<div className="answer-status">{player?.answered?<><Check size={15}/> Answer locked in. Waiting for the squad…</>:<><Zap size={15}/> Choose carefully — you only get one attempt.</>}</div>}
          {room.status==="reveal"&&<div className="explanation success-explanation"><div className="explanation-title"><Sparkles size={17}/> ANSWER REVEALED<span>ROUND COMPLETE</span></div><p>{room.results?.explanation}</p><div className="round-result-list">{room.results?.answers?.map(a=><div key={a.id}><span>{a.username}</span><b className={a.correct?"result-correct":"result-wrong"}>{a.correct?`+${a.points} pts`:a.choice===null?"No answer":"0 pts"}</b></div>)}</div><p className="muted small">Next round begins automatically in a few seconds.</p></div>}</div>
        </div> : <div className="game-main finish-main"><div className="winner-orb"><Trophy size={43}/></div><div className="eyebrow"><span className="eyebrow-line"/> BATTLE COMPLETE</div><h1 className="page-title">Arena <span>champions.</span></h1><p className="muted">Ten rounds. One leaderboard. Here are your final results.</p><div className="final-leaderboard">{sortedPlayers.map((p,i)=><div className={`final-player ${i===0?"first-place":""}`} key={p.id}><span className="rank">#{i+1}</span><div className="player-avatar">{p.username.slice(0,1).toUpperCase()}</div><b>{p.username}{p.id===playerId?" (you)":""}</b><strong>{p.score.toLocaleString()} <small>PTS</small></strong>{i===0&&<Trophy size={19}/>}</div>)}</div><button className="primary-button" onClick={backHome}><RotateCcw size={17}/> Return to arena</button></div>}
        <aside className="side-card leaderboard-card"><div className="card-heading"><h3><Trophy size={18}/> Leaderboard</h3><span className="count-pill">{room.players?.length || 0} PLAYERS</span></div><p className="muted small">Scores update live after every answer.</p>{sortedPlayers.map((p,i)=><div className={`leader-row ${i===0&&p.score>0?"leader-first":""}`} key={p.id}><span className="leader-rank">{i===0?"♛":String(i+1).padStart(2,"0")}</span><div className="player-avatar">{p.username.slice(0,1).toUpperCase()}</div><div className="leader-name">{p.username}{p.id===playerId&&<small>YOU</small>}</div><strong>{p.score}</strong></div>)}<div className="leader-footer"><span><span className="pulse-dot"/> ROOM {room.code}</span><button onClick={copyCode} className="mini-copy">{copied?<Check size={13}/>:<Copy size={13}/>} {copied?"COPIED":"COPY CODE"}</button></div></aside>
      </section>}
    </main>
    <footer className="footer"><span><Bug size={14}/> PYTHON BUG HUNT ARENA</span><span>STAY CURIOUS. KEEP DEBUGGING.</span></footer>
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
