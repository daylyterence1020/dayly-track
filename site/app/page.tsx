"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Grid2X2, Plus, Star } from "lucide-react";
import { inProgressCount, sortTodoTasks, statusTone } from "../lib/task-view";

type Network = { id: string; name: string };
type Person = { id: string; name: string };
type Task = {
  id: string; networkId: string; title: string; dueAt: number | null;
  fromPersonId: string | null; toPersonId: string | null;
  status: "in_progress" | "completed"; placement: "todo" | "archive";
  createdAt: string; version: number;
};
type Snapshot = {
  networks: Network[]; people: Person[]; tasks: Task[];
  defaultNetworkId: string | null;
};

async function dataRequest(body?: Record<string, unknown>): Promise<Snapshot | Record<string, unknown>> {
  const response = await fetch("/api/data", body ? {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  const result = await response.json() as Snapshot | { error?: string };
  if (!response.ok) throw new Error("error" in result && result.error ? result.error : "讀取資料失敗");
  return result;
}

const dateFormatter = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", hourCycle: "h23",
});
const selectedNetworkKey = "dayly-selected-network";

function sessionNetwork() {
  try { return window.sessionStorage.getItem(selectedNetworkKey); }
  catch { return null; }
}

function rememberNetwork(id: string) {
  try { window.sessionStorage.setItem(selectedNetworkKey, id); }
  catch { /* The current page still keeps the selection. */ }
}

function TaskCard({ task, people, now }: { task: Task; people: Person[]; now: number }) {
  const personName = (id: string | null) => people.find((person) => person.id === id)?.name ?? "";
  const from = personName(task.fromPersonId);
  const to = personName(task.toPersonId);
  const tone = statusTone(task, now);
  const toneLabel = tone === "overdue" ? "已到期，進行中" : tone === "completed" ? "已完成" : "進行中";
  return (
    <article className={`task-card ${task.status === "completed" && task.placement === "todo" ? "task-card-completed" : ""}`}>
      <div className="task-card-main">
        <span className={`status-dot status-${tone}`} role="img" aria-label={toneLabel} />
        <div className="task-card-title-wrap"><h3 className="task-card-title">{task.title}</h3><div className="task-meta">{task.dueAt === null ? "未設定目標時間" : `${dateFormatter.format(new Date(task.dueAt * 1000))}:00`}</div></div>
        <button className="edit-button" type="button" disabled aria-label={`編輯 ${task.title}`}>編輯</button>
      </div>
      <div className="task-people">
        <div className="person-slot"><span className="person-label">FROM</span><span className="person-value">{from || "\u00a0"}</span></div>
        <span className={`people-arrow ${from && to ? "people-arrow-visible" : ""}`} aria-hidden="true"><ArrowRight size={17} /></span>
        <div className="person-slot"><span className="person-label">TO</span><span className="person-value">{to || "\u00a0"}</span></div>
      </div>
    </article>
  );
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [networkName, setNetworkName] = useState("");
  const [taskName, setTaskName] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const refresh = useCallback(async () => {
    const next = await dataRequest() as Snapshot;
    setSnapshot(next);
    const remembered = sessionNetwork();
    setSelectedId((current) => {
      const preferred = current ?? remembered;
      return preferred && next.networks.some(({ id }) => id === preferred)
        ? preferred : next.defaultNetworkId ?? next.networks[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh)
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "讀取資料失敗"))
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const selected = snapshot?.networks.find(({ id }) => id === selectedId);
  const networkTasks = useMemo(() => snapshot?.tasks.filter(({ networkId }) => networkId === selectedId) ?? [], [snapshot, selectedId]);
  const todo = useMemo(() => sortTodoTasks(networkTasks, now), [networkTasks, now]);
  const archive = useMemo(() => networkTasks.filter(({ placement }) => placement === "archive")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [networkTasks]);

  async function perform(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const result = await dataRequest(body);
      await refresh();
      return result;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "儲存失敗，請重試");
      return null;
    } finally { setBusy(false); }
  }

  async function createNetwork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!networkName.trim()) return;
    const created = await perform({ action: "createNetwork", name: networkName.trim() });
    if (created && "id" in created && typeof created.id === "string") {
      setSelectedId(created.id); rememberNetwork(created.id);
      setNetworkName(""); setChooserOpen(false); setArchiveOpen(false);
    }
  }
  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !taskName.trim()) return;
    const created = await perform({ action: "createTask", networkId: selectedId, title: taskName.trim() });
    if (created) setTaskName("");
  }
  async function setDefault(id: string) { await perform({ action: "setDefaultNetwork", networkId: id }); }

  if (loading) return <main className="app-shell"><div className="center-message">正在載入 DaylyTrack…</div></main>;
  if (!snapshot) return <main className="app-shell"><div className="center-message"><h1>暫時無法讀取資料</h1><p>{error || "請稍後重新整理。"}</p><button className="primary-button" onClick={() => window.location.reload()}>重新整理</button></div></main>;

  return <main className="app-shell">
    <header className="site-header"><div className="header-inner">
      <div className="brand"><span className="brand-mark"><span /><span /><span /><span /></span><span>DaylyTrack</span></div>
      {selected && <button type="button" className="network-trigger" onClick={() => setChooserOpen(true)} aria-label="選擇關係網"><Grid2X2 size={17} /><span>關係網</span></button>}
    </div></header>

    {snapshot.networks.length === 0 ? <section className="onboarding page-width">
      <div className="eyebrow">開始使用</div><h1>先為你的第一個關係網命名。</h1>
      <p>可以是公司、家庭或任何你想整理的人際範圍。建立後便可在其中記錄事項。</p>
      <form className="onboarding-form" onSubmit={createNetwork}><label htmlFor="first-network">關係網名稱</label><div className="form-row"><input id="first-network" value={networkName} onChange={(event) => setNetworkName(event.target.value)} placeholder="例如：公司" maxLength={80} required /><button className="primary-button" disabled={busy} type="submit">建立關係網 <ArrowRight size={17} /></button></div></form>
      {error && <p className="error-message" role="alert">{error}</p>}
    </section> : <div className="page-width dashboard">
      <div className="page-heading"><div><div className="eyebrow">目前關係網</div><h1>{selected?.name}</h1><p>{selected ? inProgressCount(snapshot.tasks, selected.id) : 0} 件進行中</p></div><button type="button" className="network-select-button" onClick={() => setChooserOpen(true)}><Grid2X2 size={18} /> 切換關係網 <ChevronDown size={16} /></button></div>
      <section className="quick-add" aria-label="快速新增事項"><form onSubmit={createTask}><label htmlFor="new-task">新增事項</label><div className="form-row"><input id="new-task" value={taskName} onChange={(event) => setTaskName(event.target.value)} placeholder="要處理甚麼事項？" maxLength={200} required /><button className="primary-button" type="submit" disabled={busy || !selectedId}><Plus size={18} /> 新增</button></div></form></section>
      {error && <p className="error-message" role="alert">{error}</p>}
      <section className="list-section" aria-labelledby="todo-heading"><div className="section-heading"><div><div className="eyebrow">YOUR TASKS</div><h2 id="todo-heading">待辦事項 <span>{todo.length}</span></h2></div></div>
        {todo.length === 0 ? <div className="empty-state">這個關係網暫時沒有待辦事項。</div> : <div className="task-list">{todo.map((task) => <TaskCard key={task.id} task={task} people={snapshot.people} now={now} />)}</div>}
      </section>
      <section className="archive-section" aria-labelledby="archive-heading"><button className="archive-toggle" type="button" onClick={() => setArchiveOpen((open) => !open)} aria-expanded={archiveOpen}><span><span className="eyebrow">COMPLETED & STORED</span><strong id="archive-heading">封存區 <em>{archive.length}</em></strong></span>{archiveOpen ? <ChevronUp size={19} /> : <ChevronDown size={19} />}</button>
        {archiveOpen && (archive.length === 0 ? <div className="empty-state archive-empty">這個關係網暫時沒有封存事項。</div> : <div className="task-list archive-list">{archive.map((task) => <TaskCard key={task.id} task={task} people={snapshot.people} now={now} />)}</div>)}
      </section>
    </div>}

    {chooserOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setChooserOpen(false); }}><div className="network-panel" role="dialog" aria-modal="true" aria-labelledby="network-panel-heading">
      <div className="panel-header"><button type="button" className="back-button" onClick={() => setChooserOpen(false)} aria-label="返回"><ArrowLeft size={20} /></button><div><div className="eyebrow">YOUR NETWORKS</div><h2 id="network-panel-heading">關係網</h2></div></div>
      <div className="network-list">{snapshot.networks.map((network) => <div className={`network-row ${network.id === selectedId ? "network-row-active" : ""}`} key={network.id}><button type="button" className="network-row-select" onClick={() => { setSelectedId(network.id); rememberNetwork(network.id); setChooserOpen(false); setArchiveOpen(false); }}><span><strong>{network.name}</strong><small>{inProgressCount(snapshot.tasks, network.id)} 件進行中</small></span>{network.id === selectedId && <Check size={19} />}</button><button type="button" className={`default-button ${network.id === snapshot.defaultNetworkId ? "default-button-active" : ""}`} onClick={() => setDefault(network.id)} disabled={busy || network.id === snapshot.defaultNetworkId} aria-label={network.id === snapshot.defaultNetworkId ? `${network.name} 是最優先呈現關係網` : `將 ${network.name} 設為最優先呈現`} title={network.id === snapshot.defaultNetworkId ? "最優先呈現" : "設為最優先呈現"}><Star size={17} fill={network.id === snapshot.defaultNetworkId ? "currentColor" : "none"} /></button></div>)}</div>
      <form className="network-add-form" onSubmit={createNetwork}><label htmlFor="another-network">新增關係網</label><div className="form-row"><input id="another-network" value={networkName} onChange={(event) => setNetworkName(event.target.value)} placeholder="關係網名稱" maxLength={80} required /><button type="submit" className="small-add-button" disabled={busy} aria-label="建立關係網"><Plus size={20} /></button></div></form>
      {error && <p className="error-message" role="alert">{error}</p>}
    </div></div>}
  </main>;
}
