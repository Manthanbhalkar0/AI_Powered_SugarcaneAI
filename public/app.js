const { useState, useEffect, useRef } = React;

function App() {
  const [farmers, setFarmers] = useState([]);
  const [summary, setSummary] = useState({
    total_farmers: 0,
    total_tonnes: 0,
    total_payable: 0,
    total_paid: 0,
    total_pending: 0,
  });
  const [status, setStatus] = useState({
    database: { connected: false, source: 'Loading...' },
    openai: { configured: false, model: 'gpt-4.1-mini' },
  });

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [villageFilter, setVillageFilter] = useState('');
  const [pendingFilter, setPendingFilter] = useState('');

  // Conversational Chatbot State
  const defaultQuestion =
    'Which farmers have pending payments? Show their names, villages, pending amounts, and the total pending payment.';
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'assistant',
      text: 'Namaste! I am your AI Sugarcane Assistant. I can query real farmer records, payments, and village statistics from PostgreSQL / MySQL. How can I assist you today?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [floatingChatOpen, setFloatingChatOpen] = useState(false);
  const chatBottomRef = useRef(null);
  const floatingBottomRef = useRef(null);

  // Settings Modal State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsKey, setSettingsKey] = useState('');
  const [settingsModel, setSettingsModel] = useState('gpt-4.1-mini');
  const [settingsDbUrl, setSettingsDbUrl] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch initial data
  const fetchData = async () => {
    try {
      const [resStatus, resSummary, resFarmers] = await Promise.all([
        fetch('/api/status').then((r) => r.json()),
        fetch('/api/summary').then((r) => r.json()),
        fetch('/api/farmers').then((r) => r.json()),
      ]);

      setStatus(resStatus);
      if (resSummary.data) setSummary(resSummary.data);
      if (resFarmers.data) setFarmers(resFarmers.data);
      setSettingsModel(resStatus.openai?.model || 'gpt-4.1-mini');
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    if (floatingBottomRef.current) {
      floatingBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatLoading]);

  // Send message in Chatbot
  const handleSendMessage = async (textToSend) => {
    const q = (textToSend || inputMessage).trim();
    if (!q) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: q,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();

      const aiMsg = {
        id: Date.now() + 1,
        sender: 'assistant',
        text: data.answer || 'No response returned.',
        mode: data.mode,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'assistant',
          text: 'Error processing question: ' + err.message,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage('');

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openaiKey: settingsKey,
          model: settingsModel,
          dbUrl: settingsDbUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMessage('✓ Configuration updated! Testing connection...');
        await fetchData();
        setTimeout(() => {
          setSettingsOpen(false);
          setSaveMessage('');
        }, 1500);
      } else {
        setSaveMessage('Error: ' + data.error);
      }
    } catch (err) {
      setSaveMessage('Error saving settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Format currency in Indian Rupees
  const formatINR = (val) => {
    return '₹' + Number(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };

  // Filter farmers
  const filteredFarmers = farmers.filter((f) => {
    const matchesSearch =
      f.farmer_name.toLowerCase().includes(search.toLowerCase()) ||
      f.village.toLowerCase().includes(search.toLowerCase());
    const matchesVillage = villageFilter ? f.village.toLowerCase() === villageFilter.toLowerCase() : true;
    const matchesPending =
      pendingFilter === 'pending' ? f.amount_pending > 0 : pendingFilter === 'paid' ? f.amount_pending === 0 : true;
    return matchesSearch && matchesVillage && matchesPending;
  });

  const villages = [...new Set(farmers.map((f) => f.village))].filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">🌾</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">SugarcaneAI</h1>
              <p className="text-xs text-slate-500 font-medium">Farmer & Payment Management System</p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            {/* Database Status Badge */}
            <div className="flex items-center text-xs font-medium px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              <span
                className={`w-2 h-2 rounded-full mr-2 ${
                  status.database?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              ></span>
              <span>DB: {status.database?.connected ? 'MySQL Live' : 'Demo / In-Memory'}</span>
            </div>

            {/* OpenAI Status Badge */}
            <div className="flex items-center text-xs font-medium px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              <span
                className={`w-2 h-2 rounded-full mr-2 ${status.openai?.configured ? 'bg-emerald-500' : 'bg-slate-400'}`}
              ></span>
              <span>AI: {status.openai?.configured ? status.openai.model : 'Local Evaluator'}</span>
            </div>

            {/* Quick Open Chatbot Button */}
            <button
              onClick={() => setFloatingChatOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition"
            >
              <span>💬</span>
              <span>Open Chatbot</span>
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
            >
              ⚙️ Configure API & DB
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Farmers</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{summary.total_farmers}</div>
            <div className="mt-1 text-xs text-slate-400">Registered Suppliers</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sugarcane Tonnes</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {Number(summary.total_tonnes).toFixed(2)} <span className="text-sm font-normal text-slate-500">T</span>
            </div>
            <div className="mt-1 text-xs text-slate-400">Total Weight Received</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Payable</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{formatINR(summary.total_payable)}</div>
            <div className="mt-1 text-xs text-slate-400">@ ₹3,200 / Tonne</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Amount Paid</div>
            <div className="mt-2 text-2xl font-bold text-emerald-600">{formatINR(summary.total_paid)}</div>
            <div className="mt-1 text-xs text-emerald-700">Disbursed to Farmers</div>
          </div>

          <div className="bg-rose-50 p-5 rounded-xl border border-rose-200 shadow-xs hover:border-rose-300 transition">
            <div className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Total Pending Balance</div>
            <div className="mt-2 text-2xl font-bold text-rose-700">{formatINR(summary.total_pending)}</div>
            <div className="mt-1 text-xs text-rose-500 font-medium">Pending Dues</div>
          </div>
        </div>

        {/* AI Assistant Chatbot Panel */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          {/* Chatbot Header */}
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                🤖
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 leading-tight">Sugarcane AI Chatbot</h2>
                <p className="text-xs text-slate-500">Live PostgreSQL / MySQL queries via Model Context Protocol</p>
              </div>
            </div>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-1 rounded-full border border-emerald-200">
              ● Online & Ready
            </span>
          </div>

          {/* Quick Prompts Bar */}
          <div className="p-3 bg-white border-b border-slate-100 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="font-semibold text-slate-400 text-[11px] whitespace-nowrap">Suggested Prompts:</span>
            <button
              onClick={() => handleSendMessage(defaultQuestion)}
              className="whitespace-nowrap px-3 py-1 rounded-full bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 text-slate-700 transition"
            >
              🌾 Which farmers have pending payments?
            </button>
            <button
              onClick={() => handleSendMessage('Show total sugarcane tonnes and pending amount for Kopargaon village.')}
              className="whitespace-nowrap px-3 py-1 rounded-full bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 text-slate-700 transition"
            >
              📍 Summary for Kopargaon
            </button>
            <button
              onClick={() => handleSendMessage('List the top 3 farmers who supplied the highest sugarcane tonnage.')}
              className="whitespace-nowrap px-3 py-1 rounded-full bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 text-slate-700 transition"
            >
              🏆 Top 3 Suppliers
            </button>
          </div>

          {/* Chat Messages Stream */}
          <div className="p-5 overflow-y-auto max-h-[380px] min-h-[220px] space-y-4 bg-slate-50/40">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center text-xs shrink-0 mt-0.5">
                    🤖
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-none shadow-xs font-medium'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-xs'
                  }`}
                >
                  <div className="whitespace-pre-line font-normal">{m.text}</div>
                  <div className="flex items-center justify-between gap-3 mt-2 pt-1.5 border-t border-slate-100/60 text-[10px] text-slate-400">
                    <span>{m.time}</span>
                    {m.sender === 'assistant' && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(m.text);
                          alert('Copied response to clipboard!');
                        }}
                        className="hover:text-emerald-600 transition"
                      >
                        📋 Copy
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="flex gap-3 justify-start items-center">
                <div className="w-7 h-7 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center text-xs shrink-0">
                  🤖
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-600 shadow-xs flex items-center gap-2">
                  <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full"></span>
                  <span>Querying database via MCP tools...</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input Box */}
          <div className="p-3.5 bg-white border-t border-slate-200 flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask a question about farmers, tonnage, payments, or pending dues..."
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={chatLoading}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5 shadow-xs"
            >
              <span>Send</span>
              <span>→</span>
            </button>
          </div>
        </section>

        {/* Farmers Data Table Section */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Farmer Procurement & Payment Records</h2>
              <p className="text-xs text-slate-500 mt-0.5">Showing live database entries with auto-calculated generated columns</p>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                placeholder="Search name or village..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />

              <select
                value={villageFilter}
                onChange={(e) => setVillageFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">All Villages</option>
                {villages.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>

              <select
                value={pendingFilter}
                onChange={(e) => setPendingFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">All Payments</option>
                <option value="pending">Pending Only</option>
                <option value="paid">Fully Settled</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5"># ID</th>
                  <th className="px-5 py-3.5">Farmer Name</th>
                  <th className="px-5 py-3.5">Village</th>
                  <th className="px-5 py-3.5 text-right">Sugarcane (Tonnes)</th>
                  <th className="px-5 py-3.5 text-right">Rate / Tonne</th>
                  <th className="px-5 py-3.5 text-right">Total Payable</th>
                  <th className="px-5 py-3.5 text-right">Amount Paid</th>
                  <th className="px-5 py-3.5 text-right">Pending Balance</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFarmers.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-5 py-8 text-center text-slate-400">
                      No records match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredFarmers.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-400">{f.id}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900">{f.farmer_name}</td>
                      <td className="px-5 py-3.5">
                        <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-0.5 rounded-full font-medium">
                          {f.village}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-800">
                        {Number(f.sugarcane_tonnes).toFixed(2)} T
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-500 font-mono text-xs">
                        ₹3,200
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                        {formatINR(f.total_amount)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-emerald-600">
                        {formatINR(f.amount_paid)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-rose-600">
                        {formatINR(f.amount_pending)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {f.amount_pending > 0 ? (
                          <span className="bg-rose-100 text-rose-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                            Pending
                          </span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                            Paid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Floating Chatbot Widget Button */}
      {!floatingChatOpen && (
        <button
          onClick={() => setFloatingChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full p-4 shadow-xl flex items-center gap-2.5 transition transform hover:scale-105 active:scale-95"
          title="Open AI Chatbot"
        >
          <span className="text-xl">🤖</span>
          <span className="text-xs font-bold pr-1">Ask Chatbot</span>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-ping"></span>
        </button>
      )}

      {/* Floating Chatbot Window */}
      {floatingChatOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] h-[520px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-fadeIn">
          {/* Floating Chat Header */}
          <div className="p-3.5 bg-emerald-700 text-white flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xl">🤖</span>
              <div>
                <h4 className="text-xs font-bold leading-tight">Sugarcane AI Assistant</h4>
                <p className="text-[10px] text-emerald-200">Online • MCP Database Powered</p>
              </div>
            </div>
            <button
              onClick={() => setFloatingChatOpen(false)}
              className="text-emerald-200 hover:text-white text-base leading-none px-1"
            >
              ✕
            </button>
          </div>

          {/* Floating Messages List */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-none'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-2xs'
                  }`}
                >
                  <div className="whitespace-pre-line font-normal">{m.text}</div>
                  <div className="text-[10px] text-slate-400 mt-1 text-right">{m.time}</div>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-white p-2.5 rounded-xl border border-slate-200 w-fit">
                <span className="animate-spin inline-block w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full"></span>
                <span>Thinking...</span>
              </div>
            )}
            <div ref={floatingBottomRef} />
          </div>

          {/* Floating Quick Action Chips */}
          <div className="px-3 py-1.5 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto text-[11px]">
            <button
              onClick={() => handleSendMessage(defaultQuestion)}
              className="whitespace-nowrap px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200"
            >
              Pending payments?
            </button>
            <button
              onClick={() => handleSendMessage('Total summary of payments and tonnage')}
              className="whitespace-nowrap px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200"
            >
              Payment summary
            </button>
          </div>

          {/* Floating Chat Input */}
          <div className="p-2.5 bg-white border-t border-slate-200 flex gap-1.5">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask anything..."
              className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={chatLoading}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Credentials & Settings</h3>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">OpenAI API Key:</label>
                <input
                  type="password"
                  placeholder="sk-proj-..."
                  value={settingsKey}
                  onChange={(e) => setSettingsKey(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">Found on platform.openai.com/api-keys</p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">OpenAI Model:</label>
                <select
                  value={settingsModel}
                  onChange={(e) => setSettingsModel(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="gpt-4.1-mini">gpt-4.1-mini (Default)</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">MySQL Database URL:</label>
                <input
                  type="text"
                  placeholder="mysql://root:YOUR_PASSWORD@localhost:3306/sugarcane_db"
                  value={settingsDbUrl}
                  onChange={(e) => setSettingsDbUrl(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">Replace YOUR_PASSWORD with your MySQL root password.</p>
              </div>

              {saveMessage && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px]">
                  {saveMessage}
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
                >
                  {saving ? 'Saving...' : 'Save & Reconnect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        AI-Powered Sugarcane Farmer Management System • Model Context Protocol (MCP) + OpenAI Responses API
      </footer>
    </div>
  );
}

// Render React 18 Application
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
