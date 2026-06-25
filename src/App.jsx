import { useState, useEffect, useRef } from "react";
import { Plus, X, Search, Trash2, GripVertical, Ticket as TicketIcon, Users, FolderKanban } from "lucide-react";

const COLORS = {
  bg: "#EDF0F4",
  ink: "#1C2333",
  inkSoft: "#5B6478",
  card: "#FFFFFF",
  line: "#C7CFDA",
  amber: "#D98E2B",
  red: "#C1473D",
  green: "#3E8067",
  blue: "#3B6FA0",
  slate: "#7C8696",
};

const COLUMNS = [
  { id: "backlog", label: "BACKLOG" },
  { id: "progress", label: "IN PROGRESS" },
  { id: "review", label: "REVIEW" },
  { id: "done", label: "DONE" },
];

const PRIORITY = {
  low: { label: "LOW", color: COLORS.slate },
  medium: { label: "MEDIUM", color: COLORS.blue },
  high: { label: "HIGH", color: COLORS.amber },
  urgent: { label: "URGENT", color: COLORS.red },
};

const AVATAR_COLORS = [COLORS.blue, COLORS.green, COLORS.amber, COLORS.red, COLORS.slate];

function colorFor(name) {
  if (!name) return COLORS.slate;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}

function initials(name) {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

function keyFromName(name, existingKeys) {
  const base = name.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3) || "PRJ";
  let key = base;
  let n = 1;
  while (existingKeys.includes(key)) {
    key = base.slice(0, 2) + n;
    n++;
  }
  return key;
}

const SEED_PROJECTS = [
  { id: "p1", key: "MJ", name: "Mini Jira" },
  { id: "p2", key: "API", name: "API Platform" },
];

const SEED_RESOURCES = [
  { id: "r1", name: "Sam Rivera", role: "Engineer" },
  { id: "r2", name: "Priya Nair", role: "Designer" },
  { id: "r3", name: "Jo Tanaka", role: "PM" },
];

const SEED_TICKETS = [
  { id: "t1", projectId: "p1", num: 1, title: "Set up project skeleton", description: "Bootstrap repo, linting, CI.", status: "done", priority: "medium", resourceId: "r1" },
  { id: "t2", projectId: "p1", num: 2, title: "Design ticket board layout", description: "Kanban columns with stub-style cards.", status: "review", priority: "high", resourceId: "r2" },
  { id: "t3", projectId: "p1", num: 3, title: "Wire up drag and drop", description: "Move tickets between columns.", status: "progress", priority: "urgent", resourceId: "r1" },
  { id: "t4", projectId: "p1", num: 4, title: "Add search and filtering", description: "Filter board by title or assignee.", status: "backlog", priority: "low", resourceId: null },
  { id: "t5", projectId: "p2", num: 1, title: "Define auth endpoints", description: "Spec login, refresh, logout.", status: "backlog", priority: "high", resourceId: "r3" },
  { id: "t6", projectId: "p2", num: 2, title: "Rate limiting middleware", description: "Per-key throttling.", status: "progress", priority: "medium", resourceId: "r1" },
];

const KEYS = {
  projects: "mini-jira-projects",
  resources: "mini-jira-resources",
  tickets: "mini-jira-tickets",
};

// --- storage adapter: uses the browser's localStorage for this standalone app ---
async function getStore(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
async function setStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore persistence failure silently; board still works this session
  }
}

export default function MiniJira() {
  const [projects, setProjects] = useState(null);
  const [resources, setResources] = useState(null);
  const [tickets, setTickets] = useState(null);

  const [activeProjectId, setActiveProjectId] = useState("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [quickAddCol, setQuickAddCol] = useState(null);
  const [quickAddText, setQuickAddText] = useState("");
  const quickAddRef = useRef(null);

  const [showTeamPanel, setShowTeamPanel] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newResourceName, setNewResourceName] = useState("");
  const [newResourceRole, setNewResourceRole] = useState("");

  useEffect(() => {
    (async () => {
      const [p, r, t] = await Promise.all([
        getStore(KEYS.projects),
        getStore(KEYS.resources),
        getStore(KEYS.tickets),
      ]);
      setProjects(p || SEED_PROJECTS);
      setResources(r || SEED_RESOURCES);
      setTickets(t || SEED_TICKETS);
    })();
  }, []);

  useEffect(() => {
    if (projects !== null) setStore(KEYS.projects, projects);
  }, [projects]);
  useEffect(() => {
    if (resources !== null) setStore(KEYS.resources, resources);
  }, [resources]);
  useEffect(() => {
    if (tickets !== null) setStore(KEYS.tickets, tickets);
  }, [tickets]);

  useEffect(() => {
    if (quickAddCol && quickAddRef.current) quickAddRef.current.focus();
  }, [quickAddCol]);

  if (tickets === null || projects === null || resources === null) {
    return (
      <div style={{ background: COLORS.bg, color: COLORS.inkSoft }} className="min-h-screen flex items-center justify-center font-mono text-sm">
        loading board…
      </div>
    );
  }

  const projectById = (id) => projects.find((p) => p.id === id);
  const resourceById = (id) => resources.find((r) => r.id === id);
  const ticketKey = (t) => {
    const p = projectById(t.projectId);
    return (p ? p.key : "??") + "-" + t.num;
  };

  function nextNum(projectId) {
    return (tickets.filter((t) => t.projectId === projectId).reduce((m, t) => Math.max(m, t.num), 0) || 0) + 1;
  }

  function addTicket(status, title) {
    if (!title.trim()) return;
    const projectId = activeProjectId === "all" ? projects[0]?.id : activeProjectId;
    if (!projectId) return;
    const t = {
      id: "t" + Date.now(),
      projectId,
      num: nextNum(projectId),
      title: title.trim(),
      description: "",
      status,
      priority: "medium",
      resourceId: null,
    };
    setTickets((prev) => [...prev, t]);
    setQuickAddText("");
    setQuickAddCol(null);
  }

  function updateTicket(id, patch) {
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function reassignProject(id, newProjectId) {
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, projectId: newProjectId, num: nextNum(newProjectId) } : t))
    );
  }

  function deleteTicket(id) {
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setActiveId(null);
  }

  function moveTicket(id, status) {
    updateTicket(id, { status });
  }

  function addProject(name) {
    if (!name.trim()) return;
    const key = keyFromName(name, projects.map((p) => p.key));
    const p = { id: "p" + Date.now(), key, name: name.trim() };
    setProjects((prev) => [...prev, p]);
    setActiveProjectId(p.id);
    setNewProjectName("");
    setShowProjectForm(false);
  }

  function removeProject(id) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setTickets((prev) => prev.filter((t) => t.projectId !== id));
    if (activeProjectId === id) setActiveProjectId("all");
  }

  function addResource(name, role) {
    if (!name.trim()) return;
    const r = { id: "r" + Date.now(), name: name.trim(), role: role.trim() || "Team member" };
    setResources((prev) => [...prev, r]);
    setNewResourceName("");
    setNewResourceRole("");
  }

  function removeResource(id) {
    setResources((prev) => prev.filter((r) => r.id !== id));
    setTickets((prev) => prev.map((t) => (t.resourceId === id ? { ...t, resourceId: null } : t)));
  }

  const filtered = tickets.filter((t) => {
    if (activeProjectId !== "all" && t.projectId !== activeProjectId) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const res = resourceById(t.resourceId);
    return (
      t.title.toLowerCase().includes(q) ||
      ticketKey(t).toLowerCase().includes(q) ||
      (res?.name || "").toLowerCase().includes(q)
    );
  });

  const active = tickets.find((t) => t.id === activeId) || null;

  return (
    <div style={{ background: COLORS.bg, color: COLORS.ink }} className="min-h-screen font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Inter:wght@400;500;600;700&display=swap');
        .mj-mono { font-family: 'IBM Plex Mono', monospace; }
        .mj-sans { font-family: 'Inter', sans-serif; }
        .mj-stub { position: relative; }
        .mj-perf {
          position: relative;
          height: 0;
          border-top: 2px dashed ${COLORS.line};
          margin: 10px 0;
        }
        .mj-perf::before, .mj-perf::after {
          content: '';
          position: absolute;
          top: -7px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${COLORS.bg};
        }
        .mj-perf::before { left: -22px; }
        .mj-perf::after { right: -22px; }
        .mj-stamp {
          display: inline-block;
          border: 2px solid currentColor;
          border-radius: 4px;
          padding: 1px 6px;
          transform: rotate(-4deg);
          letter-spacing: 0.06em;
          font-size: 10px;
          font-weight: 600;
        }
        .mj-card { transition: box-shadow 0.15s ease, transform 0.15s ease; }
        .mj-card:hover { box-shadow: 0 4px 14px rgba(28,35,51,0.12); transform: translateY(-1px); }
        .mj-col-drop { background: #E2E8F1; }
        .mj-chip { transition: background 0.15s ease, color 0.15s ease; }
        @media (prefers-reduced-motion: reduce) {
          .mj-card { transition: none; }
        }
      `}</style>

      {/* Header */}
      <header className="border-b px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4" style={{ borderColor: COLORS.line }}>
        <div className="flex items-center gap-2">
          <TicketIcon size={20} style={{ color: COLORS.amber }} />
          <h1 className="mj-mono text-lg font-semibold tracking-tight">MINI-JIRA</h1>
        </div>
        <div className="flex-1" />
        <div className="relative w-full sm:w-56">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: COLORS.inkSoft }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tickets, key, person"
            className="mj-sans w-full text-sm pl-8 pr-3 py-2 rounded-md outline-none"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.line}`, color: COLORS.ink }}
          />
        </div>
        <button
          onClick={() => setShowTeamPanel(true)}
          className="mj-sans text-sm flex items-center gap-1.5 px-3 py-2 rounded-md"
          style={{ background: COLORS.card, border: `1px solid ${COLORS.line}`, color: COLORS.ink }}
        >
          <Users size={15} /> Team
        </button>
      </header>

      {/* Project tabs */}
      <div className="px-4 sm:px-6 pt-3 flex items-center gap-2 flex-wrap">
        <FolderKanban size={15} style={{ color: COLORS.inkSoft }} />
        <button
          onClick={() => setActiveProjectId("all")}
          className="mj-mono mj-chip text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{
            background: activeProjectId === "all" ? COLORS.ink : COLORS.card,
            color: activeProjectId === "all" ? "#fff" : COLORS.inkSoft,
            border: `1px solid ${COLORS.line}`,
          }}
        >
          ALL PROJECTS
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiveProjectId(p.id)}
            className="mj-mono mj-chip text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{
              background: activeProjectId === p.id ? COLORS.ink : COLORS.card,
              color: activeProjectId === p.id ? "#fff" : COLORS.inkSoft,
              border: `1px solid ${COLORS.line}`,
            }}
          >
            {p.key} · {p.name}
          </button>
        ))}
        {showProjectForm ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addProject(newProjectName);
                if (e.key === "Escape") setShowProjectForm(false);
              }}
              placeholder="Project name"
              className="mj-sans text-xs px-2 py-1.5 rounded-md outline-none"
              style={{ border: `1px solid ${COLORS.line}` }}
            />
            <button onClick={() => addProject(newProjectName)} className="mj-mono text-xs px-2 py-1.5 rounded-md text-white" style={{ background: COLORS.ink }}>
              Add
            </button>
            <button onClick={() => setShowProjectForm(false)} aria-label="Cancel">
              <X size={14} style={{ color: COLORS.inkSoft }} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowProjectForm(true)}
            className="mj-mono text-xs flex items-center gap-1 px-3 py-1.5 rounded-full"
            style={{ color: COLORS.inkSoft, border: `1px dashed ${COLORS.line}` }}
          >
            <Plus size={12} /> PROJECT
          </button>
        )}
      </div>

      {/* Board */}
      <main className="px-4 sm:px-6 py-5 overflow-x-auto">
        <div className="flex gap-4 min-w-max">
          {COLUMNS.map((col) => {
            const colTickets = filtered.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                className={`w-72 sm:w-80 rounded-lg p-3 ${dragOverCol === col.id ? "mj-col-drop" : ""}`}
                style={{ background: dragOverCol === col.id ? undefined : "#E6EAF0" }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col.id);
                }}
                onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) moveTicket(id, col.id);
                  setDragOverCol(null);
                }}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="mj-mono text-xs font-semibold tracking-wider" style={{ color: COLORS.inkSoft }}>
                    {col.label}
                  </span>
                  <span className="mj-mono text-xs" style={{ color: COLORS.inkSoft }}>{colTickets.length}</span>
                </div>

                <div className="flex flex-col gap-3">
                  {colTickets.map((t) => {
                    const res = resourceById(t.resourceId);
                    const proj = projectById(t.projectId);
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                        onClick={() => setActiveId(t.id)}
                        className="mj-card mj-stub rounded-lg p-3 cursor-pointer"
                        style={{ background: COLORS.card, border: `1px solid ${COLORS.line}` }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="mj-mono text-xs font-semibold" style={{ color: COLORS.inkSoft }}>{ticketKey(t)}</span>
                          <GripVertical size={14} style={{ color: COLORS.line }} />
                        </div>
                        {activeProjectId === "all" && (
                          <span className="mj-mono text-[10px]" style={{ color: COLORS.inkSoft }}>{proj?.name}</span>
                        )}
                        <div className="mj-perf" />
                        <p className="mj-sans text-sm font-medium leading-snug mb-2">{t.title}</p>
                        <div className="flex items-center justify-between">
                          <span className="mj-mono mj-stamp" style={{ color: PRIORITY[t.priority].color }}>
                            {PRIORITY[t.priority].label}
                          </span>
                          {res ? (
                            <span
                              title={res.name}
                              className="mj-mono text-[10px] font-semibold w-6 h-6 rounded-full flex items-center justify-center text-white"
                              style={{ background: colorFor(res.name) }}
                            >
                              {initials(res.name)}
                            </span>
                          ) : (
                            <span className="text-[10px]" style={{ color: COLORS.line }}>unassigned</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {quickAddCol === col.id ? (
                    <div className="rounded-lg p-2" style={{ background: COLORS.card, border: `1px solid ${COLORS.line}` }}>
                      <input
                        ref={quickAddRef}
                        value={quickAddText}
                        onChange={(e) => setQuickAddText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addTicket(col.id, quickAddText);
                          if (e.key === "Escape") {
                            setQuickAddCol(null);
                            setQuickAddText("");
                          }
                        }}
                        placeholder="Ticket title, then Enter"
                        className="mj-sans w-full text-sm outline-none mb-2"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => addTicket(col.id, quickAddText)}
                          className="mj-sans text-xs px-2 py-1 rounded text-white"
                          style={{ background: COLORS.ink }}
                        >
                          Add ticket
                        </button>
                        <button
                          onClick={() => {
                            setQuickAddCol(null);
                            setQuickAddText("");
                          }}
                          className="mj-sans text-xs px-2 py-1 rounded"
                          style={{ color: COLORS.inkSoft }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setQuickAddCol(col.id)}
                      className="mj-sans text-xs flex items-center gap-1 px-2 py-2 rounded-lg hover:bg-white/60"
                      style={{ color: COLORS.inkSoft }}
                    >
                      <Plus size={14} /> New ticket
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Ticket detail panel */}
      {active && (
        <div className="fixed inset-0 z-20 flex justify-end" onClick={() => setActiveId(null)}>
          <div className="flex-1" style={{ background: "rgba(28,35,51,0.25)" }} />
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-96 h-full overflow-y-auto p-5"
            style={{ background: COLORS.card, borderLeft: `1px solid ${COLORS.line}` }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="mj-mono text-xs font-semibold" style={{ color: COLORS.inkSoft }}>{ticketKey(active)}</span>
              <button onClick={() => setActiveId(null)} aria-label="Close">
                <X size={18} style={{ color: COLORS.inkSoft }} />
              </button>
            </div>

            <input
              value={active.title}
              onChange={(e) => updateTicket(active.id, { title: e.target.value })}
              className="mj-sans w-full text-base font-semibold mb-4 outline-none"
              style={{ color: COLORS.ink }}
            />

            <label className="mj-mono text-[11px] font-semibold tracking-wide" style={{ color: COLORS.inkSoft }}>DESCRIPTION</label>
            <textarea
              value={active.description}
              onChange={(e) => updateTicket(active.id, { description: e.target.value })}
              placeholder="Add a description…"
              rows={4}
              className="mj-sans w-full text-sm mt-1 mb-4 p-2 rounded-md outline-none resize-none"
              style={{ background: COLORS.bg, border: `1px solid ${COLORS.line}` }}
            />

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="mj-mono text-[11px] font-semibold tracking-wide" style={{ color: COLORS.inkSoft }}>STATUS</label>
                <select
                  value={active.status}
                  onChange={(e) => updateTicket(active.id, { status: e.target.value })}
                  className="mj-sans w-full text-sm mt-1 p-2 rounded-md outline-none"
                  style={{ background: COLORS.bg, border: `1px solid ${COLORS.line}` }}
                >
                  {COLUMNS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mj-mono text-[11px] font-semibold tracking-wide" style={{ color: COLORS.inkSoft }}>PRIORITY</label>
                <select
                  value={active.priority}
                  onChange={(e) => updateTicket(active.id, { priority: e.target.value })}
                  className="mj-sans w-full text-sm mt-1 p-2 rounded-md outline-none"
                  style={{ background: COLORS.bg, border: `1px solid ${COLORS.line}` }}
                >
                  {Object.entries(PRIORITY).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div>
                <label className="mj-mono text-[11px] font-semibold tracking-wide" style={{ color: COLORS.inkSoft }}>PROJECT</label>
                <select
                  value={active.projectId}
                  onChange={(e) => reassignProject(active.id, e.target.value)}
                  className="mj-sans w-full text-sm mt-1 p-2 rounded-md outline-none"
                  style={{ background: COLORS.bg, border: `1px solid ${COLORS.line}` }}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.key} · {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mj-mono text-[11px] font-semibold tracking-wide" style={{ color: COLORS.inkSoft }}>ASSIGNEE</label>
                <select
                  value={active.resourceId || ""}
                  onChange={(e) => updateTicket(active.id, { resourceId: e.target.value || null })}
                  className="mj-sans w-full text-sm mt-1 p-2 rounded-md outline-none"
                  style={{ background: COLORS.bg, border: `1px solid ${COLORS.line}` }}
                >
                  <option value="">Unassigned</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => deleteTicket(active.id)}
              className="mj-sans flex items-center gap-2 text-sm px-3 py-2 rounded-md"
              style={{ color: COLORS.red, border: `1px solid ${COLORS.red}` }}
            >
              <Trash2 size={14} /> Delete ticket
            </button>
          </div>
        </div>
      )}

      {/* Team / resources panel */}
      {showTeamPanel && (
        <div className="fixed inset-0 z-20 flex justify-end" onClick={() => setShowTeamPanel(false)}>
          <div className="flex-1" style={{ background: "rgba(28,35,51,0.25)" }} />
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-96 h-full overflow-y-auto p-5"
            style={{ background: COLORS.card, borderLeft: `1px solid ${COLORS.line}` }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="mj-mono text-sm font-semibold tracking-wide">TEAM &amp; WORKLOAD</h2>
              <button onClick={() => setShowTeamPanel(false)} aria-label="Close">
                <X size={18} style={{ color: COLORS.inkSoft }} />
              </button>
            </div>

            <div className="flex flex-col gap-2 mb-5">
              {resources.map((r) => {
                const count = tickets.filter((t) => t.resourceId === r.id && t.status !== "done").length;
                return (
                  <div key={r.id} className="flex items-center gap-3 p-2 rounded-md" style={{ border: `1px solid ${COLORS.line}` }}>
                    <span
                      className="mj-mono text-[11px] font-semibold w-8 h-8 rounded-full flex items-center justify-center text-white"
                      style={{ background: colorFor(r.name) }}
                    >
                      {initials(r.name)}
                    </span>
                    <div className="flex-1">
                      <p className="mj-sans text-sm font-medium leading-tight">{r.name}</p>
                      <p className="mj-sans text-xs" style={{ color: COLORS.inkSoft }}>{r.role}</p>
                    </div>
                    <span className="mj-mono text-xs px-2 py-0.5 rounded-full" style={{ background: COLORS.bg, color: COLORS.inkSoft }}>
                      {count} open
                    </span>
                    <button onClick={() => removeResource(r.id)} aria-label={`Remove ${r.name}`}>
                      <Trash2 size={14} style={{ color: COLORS.inkSoft }} />
                    </button>
                  </div>
                );
              })}
              {resources.length === 0 && (
                <p className="mj-sans text-sm" style={{ color: COLORS.inkSoft }}>No team members yet.</p>
              )}
            </div>

            <label className="mj-mono text-[11px] font-semibold tracking-wide" style={{ color: COLORS.inkSoft }}>ADD TEAM MEMBER</label>
            <div className="flex flex-col gap-2 mt-1 mb-2">
              <input
                value={newResourceName}
                onChange={(e) => setNewResourceName(e.target.value)}
                placeholder="Name"
                className="mj-sans text-sm p-2 rounded-md outline-none"
                style={{ background: COLORS.bg, border: `1px solid ${COLORS.line}` }}
              />
              <input
                value={newResourceRole}
                onChange={(e) => setNewResourceRole(e.target.value)}
                placeholder="Role (optional)"
                className="mj-sans text-sm p-2 rounded-md outline-none"
                style={{ background: COLORS.bg, border: `1px solid ${COLORS.line}` }}
              />
              <button
                onClick={() => addResource(newResourceName, newResourceRole)}
                className="mj-sans text-sm px-3 py-2 rounded-md text-white"
                style={{ background: COLORS.ink }}
              >
                Add to team
              </button>
            </div>

            <div className="mj-perf my-5" />

            <h3 className="mj-mono text-xs font-semibold tracking-wide mb-2" style={{ color: COLORS.inkSoft }}>PROJECTS</h3>
            <div className="flex flex-col gap-2">
              {projects.map((p) => {
                const count = tickets.filter((t) => t.projectId === p.id).length;
                return (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-md" style={{ border: `1px solid ${COLORS.line}` }}>
                    <span className="mj-mono text-xs font-semibold px-2 py-1 rounded" style={{ background: COLORS.bg, color: COLORS.inkSoft }}>{p.key}</span>
                    <span className="mj-sans text-sm flex-1">{p.name}</span>
                    <span className="mj-mono text-xs" style={{ color: COLORS.inkSoft }}>{count} tickets</span>
                    <button onClick={() => removeProject(p.id)} aria-label={`Remove ${p.name}`}>
                      <Trash2 size={14} style={{ color: COLORS.inkSoft }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
