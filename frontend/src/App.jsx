import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Code2, Plus, KeyRound, UploadCloud, Download, 
  Copy, Check, Users, MessageSquare, FileCode, 
  Lock, Send, LogOut, FileCode2
} from 'lucide-react';

const API_BASE = 'http://localhost:8080/api';
const WS_BASE = 'ws://localhost:8080/ws';

// List of fun developer usernames
const DEVELOPER_NAMES = [
  'CodeNinja', 'PixelWizard', 'SyntaxError', 'NullPointer', 
  'BinaryBeast', 'GitMaster', 'StackOverflower', 'BugHunter',
  'JavaGuru', 'ReactRanger', 'Hackerman', 'DataDynamo'
];

function App() {
  // Navigation & Page State
  const [roomHash, setRoomHash] = useState(window.location.hash);
  const [view, setView] = useState('home'); // 'home', 'password', 'workspace'
  const [roomId, setRoomId] = useState('');
  
  // Room Creation / Joining
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [roomInfo, setRoomInfo] = useState(null);
  
  // App Logic
  const [username] = useState(() => {
    const randomName = DEVELOPER_NAMES[Math.floor(Math.random() * DEVELOPER_NAMES.length)];
    const randomNumber = Math.floor(100 + Math.random() * 900);
    return `${randomName}#${randomNumber}`;
  });
  
  const [code, setCode] = useState('// Write or paste your live code here...\n');
  const [language, setLanguage] = useState('javascript');
  const [wsStatus, setWsStatus] = useState('disconnected'); // 'connected', 'disconnected', 'connecting'
  const [sharedFiles, setSharedFiles] = useState([]);
  const [sidebarTab, setSidebarTab] = useState('files'); // 'files', 'chat'
  const [mobileView, setMobileView] = useState('editor'); // 'editor', 'files', 'chat'
  
  // Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  
  // UI States
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  
  const wsRef = useRef(null);
  const editorRef = useRef(null);
  const chatBottomRef = useRef(null);

  // Monitor URL Hash changes
  useEffect(() => {
    const handleHashChange = () => {
      setRoomHash(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Parse Room ID from hash
  useEffect(() => {
    if (roomHash && roomHash.startsWith('#room/')) {
      const id = roomHash.replace('#room/', '');
      setRoomId(id);
      loadRoom(id);
    } else {
      setView('home');
      setRoomId('');
      setRoomInfo(null);
      if (wsRef.current) {
        wsRef.current.close();
      }
    }
  }, [roomHash]);

  // Load Room Metadata
  const loadRoom = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/rooms/${id}`);
      if (res.ok) {
        const data = await res.json();
        setRoomInfo(data);
        setLanguage(data.language || 'javascript');
        
        if (data.passwordProtected) {
          // Check if password verified in session
          const savedVerified = sessionStorage.getItem(`verified_room_${id}`);
          if (savedVerified === 'true') {
            setView('workspace');
            initializeRoomData(id);
          } else {
            setView('password');
          }
        } else {
          setView('workspace');
          initializeRoomData(id);
        }
      } else {
        showToast('error', 'Room not found.');
        window.location.hash = '';
      }
    } catch (e) {
      showToast('error', 'Failed to connect to backend server.');
    }
  };

  // Initialize data (files list) on joining room
  const initializeRoomData = (id) => {
    fetchFiles(id);
  };

  // Toast helper
  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch Files
  const fetchFiles = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/files/room/${id}`);
      if (res.ok) {
        const files = await res.json();
        setSharedFiles(files);
      }
    } catch (e) {
      console.error('Error fetching files', e);
    }
  };

  // Create Room
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!roomName.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName, password: roomPassword })
      });
      if (res.ok) {
        const data = await res.json();
        if (roomPassword) {
          sessionStorage.setItem(`verified_room_${data.id}`, 'true');
        }
        window.location.hash = `room/${data.id}`;
      } else {
        showToast('error', 'Failed to create room.');
      }
    } catch (e) {
      showToast('error', 'Server error. Make sure backend is running.');
    }
  };

  // Verify Password
  const handleVerifyPassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: joinPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem(`verified_room_${roomId}`, 'true');
        setView('workspace');
        initializeRoomData(roomId);
      } else {
        setPasswordError(data.error || 'Incorrect password');
      }
    } catch (e) {
      setPasswordError('Error verifying password.');
    }
  };

  // WebSocket Sync Connection
  useEffect(() => {
    if (view !== 'workspace' || !roomId) return;

    setWsStatus('connecting');
    const ws = new WebSocket(`${WS_BASE}/code`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      // Send Join event
      ws.send(JSON.stringify({
        type: 'JOIN',
        roomId: roomId,
        sender: username
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.roomId !== roomId) return;

        switch (message.type) {
          case 'SYNC':
            if (message.data.code !== undefined) setCode(message.data.code);
            if (message.data.language !== undefined) setLanguage(message.data.language);
            break;
          case 'CODE_CHANGE':
            if (message.sender !== ws.id) {
              setCode(message.data);
            }
            break;
          case 'LANGUAGE_CHANGE':
            setLanguage(message.data);
            break;
          case 'CHAT':
            setChatMessages(prev => [...prev, {
              sender: message.sender,
              text: message.data,
              self: false
            }]);
            break;
          case 'FILE_UPLOADED':
            fetchFiles(roomId);
            break;
          default:
            break;
        }
      } catch (e) {
        console.error('Error parsing WS message', e);
      }
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
    };

    return () => {
      ws.close();
    };
  }, [view, roomId]);

  // Handle local code edits and send via WebSocket
  const handleCodeChange = (newValue) => {
    setCode(newValue);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'CODE_CHANGE',
        roomId: roomId,
        sender: username,
        data: newValue
      }));
    }
  };

  // Handle local language change
  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'LANGUAGE_CHANGE',
        roomId: roomId,
        sender: username,
        data: newLang
      }));
    }
  };

  // Copy Room Link
  const handleCopyLink = () => {
    const url = `${window.location.origin}/${window.location.hash}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    showToast('success', 'Room link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Send Chat message
  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'CHAT',
        roomId: roomId,
        sender: username,
        data: chatInput
      }));
      setChatMessages(prev => [...prev, {
        sender: username,
        text: chatInput,
        self: true
      }]);
      setChatInput('');
    }
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, sidebarTab]);

  // File Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', roomId);

    setIsUploading(true);
    try {
      const res = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        showToast('success', 'File uploaded successfully!');
        fetchFiles(roomId);
        // Notify other users in the room via WebSocket
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'FILE_UPLOADED',
            roomId: roomId,
            sender: username
          }));
        }
      } else {
        showToast('error', 'File upload failed.');
      }
    } catch (err) {
      showToast('error', 'Error uploading file.');
    } finally {
      setIsUploading(false);
    }
  };

  // File download helper
  const triggerDownload = (fileId, fileName) => {
    window.open(`${API_BASE}/files/${fileId}/download`, '_blank');
  };

  // Format file size
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Leave room
  const handleLeaveRoom = () => {
    window.location.hash = '';
  };

  return (
    <div className={`app-container ${view === 'workspace' ? 'in-workspace' : ''}`}>
      {/* Header */}
      <header className="navbar">
        <div className="logo" onClick={handleLeaveRoom} style={{cursor: 'pointer'}}>
          <Code2 size={24} />
          <span>SyncShare</span>
        </div>
        {view === 'workspace' && roomInfo && (
          <div className="nav-actions">
            <span className="status-badge username-badge" style={{marginRight: '1rem'}}>
              👤 <span className="badge-text">{username}</span>
            </span>
            <div className={`status-badge ${wsStatus === 'connected' ? 'status-connected' : wsStatus === 'connecting' ? 'status-connecting' : 'status-disconnected'}`}>
              <span className="status-dot"></span>
              <span className="badge-text">{wsStatus === 'connected' ? 'Live Sync' : wsStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleCopyLink} title="Share Link">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span className="btn-text">Share Link</span>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleLeaveRoom} style={{color: '#e74c3c'}} title="Leave Room">
              <LogOut size={16} />
              <span className="btn-text">Leave Room</span>
            </button>
          </div>
        )}
      </header>

      {/* Main View Router */}
      {view === 'home' && (
        <div className="dashboard-container">
          <div className="welcome-card glass-panel">
            <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(108, 92, 231, 0.1)', borderRadius: '16px', marginBottom: '1.5rem', color: '#6c5ce7' }}>
              <Code2 size={40} />
            </div>
            <h1>Secure Code & File Sharing</h1>
            <p>Create a secure room protected by an optional password. Share code live, chat with your team, and drop files instantly.</p>
            
            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label>Room Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Antigravity Pair Programming" 
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Room Password (Optional)</label>
                <input 
                  type="password" 
                  placeholder="Leave empty for public access" 
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                <Plus size={18} />
                Create Secure Room
              </button>
            </form>
          </div>
        </div>
      )}

      {view === 'password' && (
        <div className="password-container">
          <div className="password-card glass-panel">
            <div className="icon-holder">
              <KeyRound size={28} />
            </div>
            <h2>Password Required</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              This code sharing room is secure and password-protected.
            </p>
            <form onSubmit={handleVerifyPassword}>
              <div className="form-group">
                <input 
                  type="password" 
                  placeholder="Enter room password" 
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              {passwordError && (
                <p style={{ color: '#e74c3c', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'left' }}>
                  ⚠️ {passwordError}
                </p>
              )}
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={handleLeaveRoom} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Unlock & Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {view === 'workspace' && roomInfo && (
        <div className="workspace">
          {/* Sidebar */}
          <aside className={`sidebar ${mobileView === 'editor' ? 'mobile-hidden' : ''}`}>
            <div className="sidebar-tabs">
              <button 
                className={`sidebar-tab ${sidebarTab === 'files' ? 'active' : ''}`}
                onClick={() => {
                  setSidebarTab('files');
                  setMobileView('files');
                }}
              >
                <FileCode size={16} />
                Files ({sharedFiles.length})
              </button>
              <button 
                className={`sidebar-tab ${sidebarTab === 'chat' ? 'active' : ''}`}
                onClick={() => {
                  setSidebarTab('chat');
                  setMobileView('chat');
                }}
              >
                <MessageSquare size={16} />
                Chat
              </button>
            </div>

            <div className="sidebar-content">
              {sidebarTab === 'files' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
                  <label className="upload-zone">
                    <UploadCloud size={28} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {isUploading ? 'Uploading...' : 'Drop or select file'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Share code files or references
                    </span>
                    <input 
                      type="file" 
                      style={{ display: 'none' }} 
                      onChange={handleFileUpload} 
                      disabled={isUploading}
                    />
                  </label>

                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>Shared Files</h3>
                    {sharedFiles.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No files shared yet.</p>
                    ) : (
                      <div className="file-list">
                        {sharedFiles.map(file => (
                          <div className="file-item" key={file.id}>
                            <div className="file-info">
                              <FileCode2 size={18} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                              <div style={{ minWidth: 0 }}>
                                <div className="file-name" title={file.name}>{file.name}</div>
                                <div className="file-size">{formatBytes(file.size)}</div>
                              </div>
                            </div>
                            <button 
                              className="file-download-btn" 
                              onClick={() => triggerDownload(file.id, file.name)}
                              title="Download File"
                            >
                              <Download size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="chat-container">
                  <div className="chat-messages">
                    {chatMessages.length === 0 && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '1rem' }}>
                        No messages yet. Send a greeting!
                      </p>
                    )}
                    {chatMessages.map((msg, idx) => (
                      <div className={`chat-message ${msg.self ? 'message-sent' : 'message-received'}`} key={idx}>
                        {!msg.self && <div className="chat-sender">{msg.sender}</div>}
                        <div>{msg.text}</div>
                      </div>
                    ))}
                    <div ref={chatBottomRef} />
                  </div>

                  <form className="chat-input-area" onSubmit={handleSendChat}>
                    <input 
                      type="text" 
                      placeholder="Type a message..." 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 0.8rem' }}>
                      <Send size={16} />
                    </button>
                  </form>
                </div>
              )}
            </div>
          </aside>

          {/* Editor Workspace */}
          <main className={`editor-area ${mobileView !== 'editor' ? 'mobile-hidden' : ''}`}>
            <div className="editor-control-bar">
              <div className="editor-title">
                <h2>{roomInfo.name}</h2>
                {roomInfo.passwordProtected && <Lock size={14} style={{ color: 'var(--accent-primary)' }} />}
              </div>
              <div className="editor-actions">
                <select 
                  className="select-control" 
                  value={language} 
                  onChange={handleLanguageChange}
                >
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                  <option value="html">HTML</option>
                  <option value="css">CSS</option>
                  <option value="sql">SQL</option>
                  <option value="json">JSON</option>
                  <option value="markdown">Markdown</option>
                </select>
              </div>
            </div>

            <div className="editor-container-inner">
              <Editor
                height="100%"
                language={language}
                theme="vs-dark"
                value={code}
                onChange={handleCodeChange}
                options={{
                  fontFamily: 'Fira Code, Courier New, monospace',
                  fontSize: 14,
                  lineHeight: 22,
                  minimap: { enabled: true },
                  scrollbar: {
                    vertical: 'visible',
                    horizontal: 'visible'
                  },
                  automaticLayout: true,
                  padding: { top: 16 }
                }}
              />
            </div>
          </main>

          {/* Mobile Bottom Tab Bar */}
          <div className="mobile-tab-bar">
            <button 
              className={`mobile-tab-btn ${mobileView === 'editor' ? 'active' : ''}`}
              onClick={() => setMobileView('editor')}
            >
              <Code2 size={20} />
              <span>Editor</span>
            </button>
            <button 
              className={`mobile-tab-btn ${mobileView === 'files' ? 'active' : ''}`}
              onClick={() => {
                setMobileView('files');
                setSidebarTab('files');
              }}
            >
              <FileCode size={20} />
              <span>Files</span>
            </button>
            <button 
              className={`mobile-tab-btn ${mobileView === 'chat' ? 'active' : ''}`}
              onClick={() => {
                setMobileView('chat');
                setSidebarTab('chat');
              }}
            >
              <MessageSquare size={20} />
              <span>Chat</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating toast notification */}
      {toast && (
        <div className="toast glass-panel" style={{ 
          borderLeft: toast.type === 'success' ? '4px solid #2ecc71' : '4px solid #e74c3c',
          background: 'rgba(8, 7, 24, 0.95)'
        }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            {toast.type === 'success' ? '✅' : '❌'} {toast.text}
          </span>
        </div>
      )}
    </div>
  );
}

export default App;
