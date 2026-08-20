import React, { useState, useEffect, useMemo } from "react";
import { Plus, Search, ClipboardList, CheckCircle2, Circle, Clock, ChevronRight, X, FileDown, LayoutDashboard, Users, Calendar, Trash2, AlertCircle } from "lucide-react";
import { supabase } from "./supabaseClient";
import { exportMeetingToDocx } from "./lib/exportDocx";
import logo from "./logo.png";

const emptyDraft = () => ({
  id: null,
  title: "",
  date: new Date().toISOString().slice(0, 10),
  leader: "",
  participants: "",
  agenda: "",
  discussion: "",
  decisions: "",
  actionItems: [],
});

const emptyActionItem = () => ({
  id: `new-${crypto.randomUUID()}`,
  task: "",
  owner: "",
  deadline: "",
  status: "belum",
});

const statusConfig = {
  belum: { label: "Belum", color: "text-stone-500", bg: "bg-stone-100", icon: Circle },
  proses: { label: "Proses", color: "text-amber-700", bg: "bg-amber-100", icon: Clock },
  selesai: { label: "Selesai", color: "text-blue-800", bg: "bg-blue-100", icon: CheckCircle2 },
};

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function isOverdue(item) {
  if (!item.deadline || item.status === "selesai") return false;
  return new Date(item.deadline) < new Date(new Date().toDateString());
}

// Ubah baris dari Supabase (snake_case, action_items terpisah) menjadi bentuk state di UI
function mapMeetingFromDb(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    leader: row.leader || "",
    participants: row.participants || "",
    agenda: row.agenda || "",
    discussion: row.discussion || "",
    decisions: row.decisions || "",
    actionItems: (row.action_items || [])
      .slice()
      .sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
      .map((a) => ({
        id: a.id,
        task: a.task,
        owner: a.owner || "",
        deadline: a.deadline || "",
        status: a.status,
      })),
  };
}

export default function ENotulen() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("dashboard"); // dashboard | list | form | detail
  const [draft, setDraft] = useState(emptyDraft());
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState("");

  async function loadMeetings() {
    setLoading(true);
    const { data, error } = await supabase
      .from("meetings")
      .select("*, action_items(*)")
      .order("date", { ascending: false });
    if (error) {
      setLoadError(true);
    } else {
      setLoadError(false);
      setMeetings((data || []).map(mapMeetingFromDb));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadMeetings();
  }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  function startNew() {
    setDraft(emptyDraft());
    setEditingId(null);
    setView("form");
  }

  function startEdit(meeting) {
    setDraft({ ...meeting, actionItems: meeting.actionItems.map((a) => ({ ...a })) });
    setEditingId(meeting.id);
    setView("form");
  }

  async function saveDraft() {
    if (!draft.title.trim()) {
      showToast("Judul rapat wajib diisi");
      return;
    }
    setSaving(true);
    const meetingPayload = {
      title: draft.title,
      date: draft.date,
      leader: draft.leader,
      participants: draft.participants,
      agenda: draft.agenda,
      discussion: draft.discussion,
      decisions: draft.decisions,
    };
    const cleanItems = draft.actionItems.filter((a) => a.task.trim());

    let meetingId = editingId;
    let err = null;

    if (editingId) {
      const { error } = await supabase.from("meetings").update(meetingPayload).eq("id", editingId);
      err = error;
      // ganti seluruh action item lama dengan yang baru (sederhana & konsisten)
      if (!err) {
        await supabase.from("action_items").delete().eq("meeting_id", editingId);
      }
    } else {
      const { data, error } = await supabase.from("meetings").insert(meetingPayload).select().single();
      err = error;
      if (!err) meetingId = data.id;
    }

    if (!err && cleanItems.length > 0) {
      const itemsPayload = cleanItems.map((a) => ({
        meeting_id: meetingId,
        task: a.task,
        owner: a.owner,
        deadline: a.deadline || null,
        status: a.status,
      }));
      const { error: itemsErr } = await supabase.from("action_items").insert(itemsPayload);
      err = itemsErr;
    }

    setSaving(false);

    if (err) {
      showToast("Gagal menyimpan: periksa koneksi Supabase");
      return;
    }

    await loadMeetings();
    showToast(editingId ? "Notulen diperbarui" : "Notulen tersimpan");
    setSelectedId(meetingId);
    setView("detail");
  }

  async function deleteMeeting(id) {
    const { error } = await supabase.from("meetings").delete().eq("id", id);
    if (error) {
      showToast("Gagal menghapus notulen");
      return;
    }
    await loadMeetings();
    setView("list");
    showToast("Notulen dihapus");
  }

  async function updateActionStatus(meetingId, itemId, status) {
    // update optimis di UI
    setMeetings((prev) =>
      prev.map((m) =>
        m.id !== meetingId
          ? m
          : { ...m, actionItems: m.actionItems.map((a) => (a.id === itemId ? { ...a, status } : a)) }
      )
    );
    const { error } = await supabase.from("action_items").update({ status }).eq("id", itemId);
    if (error) {
      showToast("Gagal memperbarui status");
      loadMeetings();
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return meetings;
    return meetings.filter((m) =>
      [m.title, m.leader, m.agenda, m.discussion, m.decisions, m.participants]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [meetings, search]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = meetings.filter((m) => {
      const d = new Date(m.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const allItems = meetings.flatMap((m) => m.actionItems.map((a) => ({ ...a, meetingTitle: m.title, meetingId: m.id })));
    const pending = allItems.filter((a) => a.status !== "selesai");
    const overdue = allItems.filter(isOverdue);
    const byOwner = {};
    pending.forEach((a) => {
      const key = a.owner.trim() || "(belum ditentukan)";
      byOwner[key] = (byOwner[key] || 0) + 1;
    });
    const topOwners = Object.entries(byOwner).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { thisMonthCount: thisMonth.length, pending, overdue, topOwners };
  }, [meetings]);

  const selectedMeeting = meetings.find((m) => m.id === selectedId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-stone-400 text-sm tracking-wide">Memuat data…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <div className="bg-blue-900 text-stone-50">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo NOTEA" className="w-11 h-11 rounded-full shrink-0 shadow-sm" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300 font-semibold">Pengadilan Agama Purwokerto</div>
              <h1 className="text-lg font-bold leading-tight" style={{ fontFamily: "Merriweather, Georgia, serif" }}>NOTEA</h1>
              <div className="text-[11px] text-blue-200 leading-tight">Notulen Elektronik Terpadu</div>
            </div>
          </div>
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-blue-950 font-semibold text-sm px-3.5 py-2 rounded-md transition-colors"
          >
            <Plus size={16} /> Rapat Baru
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-6 flex gap-1 border-t border-blue-800">
          {[
            { key: "dashboard", label: "Dasbor", icon: LayoutDashboard },
            { key: "list", label: "Arsip Notulen", icon: ClipboardList },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`flex items-center gap-1.5 text-sm px-3 py-2.5 border-b-2 transition-colors ${
                view === t.key || (t.key === "list" && (view === "detail" || view === "form"))
                  ? "border-amber-400 text-amber-300"
                  : "border-transparent text-blue-200 hover:text-amber-200"
              }`}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="max-w-5xl mx-auto px-6 pt-3">
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-md">
            <AlertCircle size={14} /> Tidak dapat terhubung ke Supabase. Periksa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY di file .env.
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 py-6">
        {view === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Rapat Bulan Ini" value={stats.thisMonthCount} icon={Calendar} />
              <StatCard label="Action Item Tertunda" value={stats.pending.length} icon={Clock} accent="amber" />
              <StatCard label="Terlambat" value={stats.overdue.length} icon={AlertCircle} accent="red" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <h3 className="text-sm font-semibold text-stone-700 mb-3 flex items-center gap-1.5">
                  <Users size={14} /> Beban Action Item per PIC
                </h3>
                {stats.topOwners.length === 0 ? (
                  <p className="text-sm text-stone-400">Belum ada action item.</p>
                ) : (
                  <div className="space-y-2">
                    {stats.topOwners.map(([owner, count]) => (
                      <div key={owner} className="flex items-center gap-2">
                        <div className="w-28 text-xs text-stone-600 truncate">{owner}</div>
                        <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-blue-800 h-2 rounded-full" style={{ width: `${Math.min(100, count * 20)}%` }} />
                        </div>
                        <div className="text-xs font-medium text-stone-500 w-4 text-right">{count}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">Rapat Terbaru</h3>
                {meetings.slice(0, 5).length === 0 ? (
                  <p className="text-sm text-stone-400">Belum ada notulen tersimpan.</p>
                ) : (
                  <div className="divide-y divide-stone-100">
                    {meetings.slice(0, 5).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedId(m.id);
                          setView("detail");
                        }}
                        className="w-full flex items-center justify-between py-2 text-left hover:text-blue-800 group"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{m.title || "(tanpa judul)"}</div>
                          <div className="text-xs text-stone-400">{formatDate(m.date)}</div>
                        </div>
                        <ChevronRight size={14} className="text-stone-300 group-hover:text-blue-800 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {stats.overdue.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                  <AlertCircle size={14} /> Action Item Terlambat
                </h3>
                <ul className="space-y-1.5">
                  {stats.overdue.map((a) => (
                    <li key={a.id} className="text-sm text-stone-700 flex items-center justify-between">
                      <span>
                        {a.task} <span className="text-stone-400">— {a.owner || "belum ditentukan"}</span>
                      </span>
                      <button
                        onClick={() => {
                          setSelectedId(a.meetingId);
                          setView("detail");
                        }}
                        className="text-xs text-blue-800 hover:underline shrink-0 ml-3"
                      >
                        Lihat rapat
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {view === "list" && (
          <div className="space-y-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari judul, topik, atau peserta..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800/40 focus:border-blue-800"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-stone-400 text-sm">
                {meetings.length === 0 ? 'Belum ada notulen. Klik "Rapat Baru" untuk memulai.' : "Tidak ada hasil yang cocok."}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((m) => {
                  const pendingCount = m.actionItems.filter((a) => a.status !== "selesai").length;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedId(m.id);
                        setView("detail");
                      }}
                      className="w-full text-left bg-white border border-stone-200 rounded-lg p-4 hover:border-blue-800/40 hover:shadow-sm transition-all flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-stone-800 truncate">{m.title || "(tanpa judul)"}</div>
                        <div className="text-xs text-stone-400 mt-0.5">
                          {formatDate(m.date)} {m.leader && `· Dipimpin oleh ${m.leader}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        {pendingCount > 0 && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{pendingCount} PR</span>
                        )}
                        <ChevronRight size={16} className="text-stone-300" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === "form" && (
          <div className="bg-white border border-stone-200 rounded-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-stone-800" style={{ fontFamily: "Merriweather, Georgia, serif" }}>
                {editingId ? "Edit Notulen" : "Notulen Rapat Baru"}
              </h2>
              <button onClick={() => setView(editingId ? "detail" : "list")} className="text-stone-400 hover:text-stone-600">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Judul Rapat">
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Contoh: Rapat Koordinasi Kesekretariatan"
                  className="input"
                />
              </Field>
              <Field label="Tanggal">
                <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="input" />
              </Field>
              <Field label="Pemimpin Rapat">
                <input value={draft.leader} onChange={(e) => setDraft({ ...draft, leader: e.target.value })} className="input" />
              </Field>
              <Field label="Peserta (pisahkan dengan koma)">
                <input
                  value={draft.participants}
                  onChange={(e) => setDraft({ ...draft, participants: e.target.value })}
                  placeholder="Nama 1, Nama 2, ..."
                  className="input"
                />
              </Field>
            </div>

            <Field label="Agenda">
              <textarea value={draft.agenda} onChange={(e) => setDraft({ ...draft, agenda: e.target.value })} rows={2} className="input resize-none" />
            </Field>
            <Field label="Pembahasan">
              <textarea value={draft.discussion} onChange={(e) => setDraft({ ...draft, discussion: e.target.value })} rows={4} className="input resize-none" />
            </Field>
            <Field label="Keputusan">
              <textarea value={draft.decisions} onChange={(e) => setDraft({ ...draft, decisions: e.target.value })} rows={3} className="input resize-none" />
            </Field>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Action Item</label>
                <button
                  onClick={() => setDraft({ ...draft, actionItems: [...draft.actionItems, emptyActionItem()] })}
                  className="text-xs text-blue-800 hover:underline flex items-center gap-1"
                >
                  <Plus size={12} /> Tambah
                </button>
              </div>
              {draft.actionItems.length === 0 && <p className="text-sm text-stone-400">Belum ada action item.</p>}
              <div className="space-y-2">
                {draft.actionItems.map((item, idx) => (
                  <div key={item.id} className="flex gap-2 items-start bg-stone-50 border border-stone-200 rounded-md p-2.5">
                    <input
                      value={item.task}
                      onChange={(e) => {
                        const items = [...draft.actionItems];
                        items[idx] = { ...item, task: e.target.value };
                        setDraft({ ...draft, actionItems: items });
                      }}
                      placeholder="Tugas / tindak lanjut"
                      className="flex-1 text-sm px-2 py-1.5 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-800"
                    />
                    <input
                      value={item.owner}
                      onChange={(e) => {
                        const items = [...draft.actionItems];
                        items[idx] = { ...item, owner: e.target.value };
                        setDraft({ ...draft, actionItems: items });
                      }}
                      placeholder="PIC"
                      className="w-28 text-sm px-2 py-1.5 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-800"
                    />
                    <input
                      type="date"
                      value={item.deadline}
                      onChange={(e) => {
                        const items = [...draft.actionItems];
                        items[idx] = { ...item, deadline: e.target.value };
                        setDraft({ ...draft, actionItems: items });
                      }}
                      className="w-36 text-sm px-2 py-1.5 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-800"
                    />
                    <button
                      onClick={() => setDraft({ ...draft, actionItems: draft.actionItems.filter((a) => a.id !== item.id) })}
                      className="text-stone-400 hover:text-red-500 p-1.5"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <button onClick={() => setView(editingId ? "detail" : "list")} className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-md">
                Batal
              </button>
              <button
                onClick={saveDraft}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white rounded-md font-medium"
              >
                {saving ? "Menyimpan..." : "Simpan Notulen"}
              </button>
            </div>
          </div>
        )}

        {view === "detail" && selectedMeeting && (
          <div className="bg-white border border-stone-200 rounded-lg p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-stone-800" style={{ fontFamily: "Merriweather, Georgia, serif" }}>
                  {selectedMeeting.title}
                </h2>
                <p className="text-sm text-stone-400 mt-0.5">
                  {formatDate(selectedMeeting.date)} {selectedMeeting.leader && `· Dipimpin oleh ${selectedMeeting.leader}`}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => exportMeetingToDocx(selectedMeeting)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-stone-300 rounded-md hover:bg-stone-50 text-stone-600"
                >
                  <FileDown size={13} /> Ekspor ke Word
                </button>
                <button onClick={() => startEdit(selectedMeeting)} className="text-xs px-2.5 py-1.5 border border-stone-300 rounded-md hover:bg-stone-50 text-stone-600">
                  Edit
                </button>
                <button onClick={() => deleteMeeting(selectedMeeting.id)} className="text-xs px-2.5 py-1.5 border border-red-200 text-red-600 rounded-md hover:bg-red-50">
                  Hapus
                </button>
              </div>
            </div>

            {selectedMeeting.participants && (
              <div className="text-sm">
                <span className="text-stone-400">Peserta: </span>
                {selectedMeeting.participants}
              </div>
            )}

            <DetailBlock label="Agenda" text={selectedMeeting.agenda} />
            <DetailBlock label="Pembahasan" text={selectedMeeting.discussion} />
            <DetailBlock label="Keputusan" text={selectedMeeting.decisions} />

            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2 block">Action Item</label>
              {selectedMeeting.actionItems.length === 0 ? (
                <p className="text-sm text-stone-400">Tidak ada action item pada rapat ini.</p>
              ) : (
                <div className="space-y-2">
                  {selectedMeeting.actionItems.map((a) => {
                    const cfg = statusConfig[a.status];
                    const overdue = isOverdue(a);
                    return (
                      <div key={a.id} className={`flex items-center justify-between gap-3 p-2.5 rounded-md border ${overdue ? "border-red-200 bg-red-50" : "border-stone-200 bg-stone-50"}`}>
                        <div className="min-w-0">
                          <div className="text-sm text-stone-800">{a.task}</div>
                          <div className="text-xs text-stone-400">
                            {a.owner || "belum ditentukan"} {a.deadline && `· deadline ${formatDate(a.deadline)}`}
                            {overdue && <span className="text-red-500 font-medium"> · terlambat</span>}
                          </div>
                        </div>
                        <select
                          value={a.status}
                          onChange={(e) => updateActionStatus(selectedMeeting.id, a.id, e.target.value)}
                          className={`text-xs font-medium px-2 py-1 rounded-full border-0 shrink-0 ${cfg.bg} ${cfg.color}`}
                        >
                          <option value="belum">Belum</option>
                          <option value="proses">Proses</option>
                          <option value="selesai">Selesai</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button onClick={() => setView("list")} className="text-sm text-blue-800 hover:underline">
              ← Kembali ke arsip
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-blue-900 text-white text-sm px-4 py-2 rounded-md shadow-lg">{toast}</div>
      )}

      <style>{`
        .input {
          width: 100%;
          font-size: 0.875rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d6d3d1;
          border-radius: 0.375rem;
          outline: none;
        }
        .input:focus {
          border-color: #065f46;
          box-shadow: 0 0 0 2px rgba(6,95,70,0.15);
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }) {
  const accentMap = {
    default: "text-blue-800 bg-blue-50",
    amber: "text-amber-700 bg-amber-50",
    red: "text-red-600 bg-red-50",
  };
  const cls = accentMap[accent] || accentMap.default;
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${cls}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-xl font-bold text-stone-800">{value}</div>
        <div className="text-xs text-stone-400">{label}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function DetailBlock({ label, text }) {
  return (
    <div>
      <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1 block">{label}</label>
      <p className="text-sm text-stone-700 whitespace-pre-wrap">{text || "-"}</p>
    </div>
  );
}
