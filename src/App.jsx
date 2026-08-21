import React, { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Search, ClipboardList, CheckCircle2, Circle, Clock, ChevronRight, X, FileDown, LayoutDashboard, Users, Calendar, Trash2, AlertCircle, UserCheck, Camera, Image as ImageIcon, Upload, LogIn, LogOut } from "lucide-react";
import { supabase } from "./supabaseClient";
import { exportMeetingToDocx } from "./lib/exportDocx";
import logo from "./logo.png";
import { HAKIM_ROSTER, PEGAWAI_ROSTER } from "./staffRoster";

const DOCS_BUCKET = "notea-dokumentasi";
const ROSTER_NAMES = new Set([...HAKIM_ROSTER, ...PEGAWAI_ROSTER].map((p) => p.name));

const emptyDraft = () => ({
  id: null,
  title: "",
  date: new Date().toISOString().slice(0, 10),
  leader: "",
  agenda: "",
  discussion: "",
  decisions: "",
  actionItems: [],
  attendees: [],
  documents: [],
});

const emptyActionItem = () => ({
  id: `new-${crypto.randomUUID()}`,
  task: "",
  owner: "",
  deadline: "",
  status: "belum",
});

const emptyAttendee = () => ({
  id: `new-${crypto.randomUUID()}`,
  name: "",
  position: "",
});

const statusConfig = {
  belum: { label: "Belum", color: "text-stone-500", bg: "bg-stone-100", icon: Circle },
  proses: { label: "Proses", color: "text-amber-700", bg: "bg-amber-100", icon: Clock },
  selesai: { label: "Selesai", color: "text-emerald-800", bg: "bg-emerald-100", icon: CheckCircle2 },
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

// Ubah baris dari Supabase (snake_case, relasi terpisah) menjadi bentuk state di UI
function mapMeetingFromDb(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    leader: row.leader || "",
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
    attendees: (row.attendees || [])
      .slice()
      .sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
      .map((a) => ({ id: a.id, name: a.name, position: a.position || "" })),
    documents: (row.meeting_documents || [])
      .slice()
      .sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
      .map((d) => ({
        id: d.id,
        filePath: d.file_path,
        fileName: d.file_name,
        url: supabase.storage.from(DOCS_BUCKET).getPublicUrl(d.file_path).data.publicUrl,
      })),
  };
}

export default function ENotulen() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("list"); // list | dashboard | form | detail
  const [draft, setDraft] = useState(emptyDraft());
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState("");
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const fileInputRef = useRef(null);

  const [session, setSession] = useState(undefined); // undefined = belum dicek, null = tidak login
  const [showLogin, setShowLogin] = useState(false);
  const isAdmin = !!session;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Kalau bukan admin (misal baru logout) dan sedang di tampilan khusus admin, pindah ke arsip
  useEffect(() => {
    if (!isAdmin && (view === "dashboard" || view === "form")) {
      setView("list");
    }
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogout() {
    await supabase.auth.signOut();
    showToast("Berhasil keluar");
  }

  async function loadMeetings() {
    setLoading(true);
    const { data, error } = await supabase
      .from("meetings")
      .select("*, action_items(*), attendees(*), meeting_documents(*)")
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
    setDraft({
      ...meeting,
      actionItems: meeting.actionItems.map((a) => ({ ...a })),
      attendees: meeting.attendees.map((a) => ({ ...a })),
      documents: meeting.documents.map((d) => ({ ...d })),
    });
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
      agenda: draft.agenda,
      discussion: draft.discussion,
      decisions: draft.decisions,
    };
    const cleanItems = draft.actionItems.filter((a) => a.task.trim());
    const cleanAttendees = draft.attendees.filter((a) => a.name.trim());

    let meetingId = editingId;
    let err = null;

    if (editingId) {
      const { error } = await supabase.from("meetings").update(meetingPayload).eq("id", editingId);
      err = error;
      if (!err) {
        await supabase.from("action_items").delete().eq("meeting_id", editingId);
        await supabase.from("attendees").delete().eq("meeting_id", editingId);
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

    if (!err && cleanAttendees.length > 0) {
      const attendeesPayload = cleanAttendees.map((a) => ({
        meeting_id: meetingId,
        name: a.name,
        position: a.position,
      }));
      const { error: attErr } = await supabase.from("attendees").insert(attendeesPayload);
      err = attErr;
    }

    // Hapus dokumentasi yang dihapus pengguna dari draft (dibandingkan data asli)
    if (!err && editingId) {
      const original = meetings.find((m) => m.id === editingId);
      const removed = (original?.documents || []).filter(
        (od) => !draft.documents.some((dd) => dd.id === od.id)
      );
      if (removed.length > 0) {
        await supabase.storage.from(DOCS_BUCKET).remove(removed.map((r) => r.filePath));
        await supabase.from("meeting_documents").delete().in("id", removed.map((r) => r.id));
      }
    }

    // Unggah dokumentasi baru yang ditambahkan (punya properti .file)
    const newDocs = draft.documents.filter((d) => d.file);
    if (!err && newDocs.length > 0) {
      setUploadingDocs(true);
      for (const d of newDocs) {
        const ext = d.file.name.split(".").pop();
        const path = `${meetingId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(DOCS_BUCKET).upload(path, d.file);
        if (upErr) {
          err = upErr;
          break;
        }
        const { error: insErr } = await supabase
          .from("meeting_documents")
          .insert({ meeting_id: meetingId, file_path: path, file_name: d.file.name });
        if (insErr) {
          err = insErr;
          break;
        }
      }
      setUploadingDocs(false);
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
    const meeting = meetings.find((m) => m.id === id);
    if (meeting?.documents?.length) {
      await supabase.storage.from(DOCS_BUCKET).remove(meeting.documents.map((d) => d.filePath));
    }
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
      [m.title, m.leader, m.agenda, m.discussion, m.decisions, m.attendees.map((a) => a.name).join(" ")]
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

  const manualAttendees = draft.attendees.filter((a) => !ROSTER_NAMES.has(a.name));

  function toggleRosterPerson(person) {
    const exists = draft.attendees.some((a) => a.name === person.name);
    if (exists) {
      setDraft({ ...draft, attendees: draft.attendees.filter((a) => a.name !== person.name) });
    } else {
      setDraft({
        ...draft,
        attendees: [...draft.attendees, { id: `new-${crypto.randomUUID()}`, name: person.name, position: person.position }],
      });
    }
  }

  function toggleRosterGroup(roster, selectAll) {
    if (selectAll) {
      const toAdd = roster
        .filter((p) => !draft.attendees.some((a) => a.name === p.name))
        .map((p) => ({ id: `new-${crypto.randomUUID()}`, name: p.name, position: p.position }));
      setDraft({ ...draft, attendees: [...draft.attendees, ...toAdd] });
    } else {
      const rosterNames = new Set(roster.map((p) => p.name));
      setDraft({ ...draft, attendees: draft.attendees.filter((a) => !rosterNames.has(a.name)) });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-stone-400 text-sm tracking-wide">Memuat data…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <div className="bg-emerald-900 text-stone-50">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo RAPID" className="w-11 h-11 shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300 font-semibold">Pengadilan Agama Purwokerto</div>
              <h1 className="text-lg font-bold leading-tight" style={{ fontFamily: "Merriweather, Georgia, serif" }}>RAPID</h1>
              <div className="text-[11px] text-emerald-200 leading-tight">Rapat Digital Terintegrasi</div>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={startNew}
              className="flex items-center gap-1.5 bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-semibold text-sm px-3.5 py-2 rounded-md transition-colors"
            >
              <Plus size={16} /> Rapat Baru
            </button>
          )}
        </div>
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between border-t border-emerald-800">
          <div className="flex gap-1">
            {[
              ...(isAdmin ? [{ key: "dashboard", label: "Dasbor", icon: LayoutDashboard }] : []),
              { key: "list", label: "Arsip Notulen", icon: ClipboardList },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={`flex items-center gap-1.5 text-sm px-3 py-2.5 border-b-2 transition-colors ${
                  view === t.key || (t.key === "list" && (view === "detail" || view === "form"))
                    ? "border-emerald-400 text-emerald-300"
                    : "border-transparent text-emerald-200 hover:text-emerald-300"
                }`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
          <div className="py-1.5">
            {isAdmin ? (
              <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-emerald-200 hover:text-white px-2 py-1">
                <LogOut size={13} /> Keluar
              </button>
            ) : (
              <button onClick={() => setShowLogin(true)} className="flex items-center gap-1.5 text-xs text-emerald-200 hover:text-white px-2 py-1">
                <LogIn size={13} /> Masuk sebagai Admin
              </button>
            )}
          </div>
        </div>
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onSuccess={() => { setShowLogin(false); showToast("Berhasil masuk"); }} />}

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
                          <div className="bg-emerald-800 h-2 rounded-full" style={{ width: `${Math.min(100, count * 20)}%` }} />
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
                        className="w-full flex items-center justify-between py-2 text-left hover:text-emerald-800 group"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{m.title || "(tanpa judul)"}</div>
                          <div className="text-xs text-stone-400">{formatDate(m.date)}</div>
                        </div>
                        <ChevronRight size={14} className="text-stone-300 group-hover:text-emerald-800 shrink-0" />
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
                        className="text-xs text-emerald-800 hover:underline shrink-0 ml-3"
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
                className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-800/40 focus:border-emerald-800"
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
                      className="w-full text-left bg-white border border-stone-200 rounded-lg p-4 hover:border-emerald-800/40 hover:shadow-sm transition-all flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-stone-800 truncate">{m.title || "(tanpa judul)"}</div>
                        <div className="text-xs text-stone-400 mt-0.5">
                          {formatDate(m.date)} {m.leader && `· Dipimpin oleh ${m.leader}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        {m.attendees.length > 0 && (
                          <span className="text-xs text-stone-400 flex items-center gap-1">
                            <UserCheck size={12} /> {m.attendees.length}
                          </span>
                        )}
                        {m.documents.length > 0 && (
                          <span className="text-xs text-stone-400 flex items-center gap-1">
                            <ImageIcon size={12} /> {m.documents.length}
                          </span>
                        )}
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

            {/* Daftar Hadir */}
            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <UserCheck size={13} /> Daftar Hadir
                <span className="text-emerald-700 font-medium normal-case">({draft.attendees.filter((a) => a.name.trim()).length} dicentang)</span>
              </label>

              <RosterGroup
                title="Hakim"
                roster={HAKIM_ROSTER}
                checkedNames={new Set(draft.attendees.map((a) => a.name))}
                onToggle={toggleRosterPerson}
                onToggleAll={(selectAll) => toggleRosterGroup(HAKIM_ROSTER, selectAll)}
              />
              <RosterGroup
                title="Pegawai"
                roster={PEGAWAI_ROSTER}
                checkedNames={new Set(draft.attendees.map((a) => a.name))}
                onToggle={toggleRosterPerson}
                onToggleAll={(selectAll) => toggleRosterGroup(PEGAWAI_ROSTER, selectAll)}
              />

              {/* Tamu / peserta luar roster */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-stone-500">Tamu / Peserta Luar (opsional)</span>
                  <button
                    onClick={() => setDraft({ ...draft, attendees: [...draft.attendees, emptyAttendee()] })}
                    className="text-xs text-emerald-800 hover:underline flex items-center gap-1"
                  >
                    <Plus size={12} /> Tambah
                  </button>
                </div>
                <div className="space-y-2">
                  {manualAttendees.map((att) => {
                    const idx = draft.attendees.findIndex((a) => a.id === att.id);
                    return (
                      <div key={att.id} className="flex gap-2 items-start bg-stone-50 border border-stone-200 rounded-md p-2.5">
                        <input
                          value={att.name}
                          onChange={(e) => {
                            const items = [...draft.attendees];
                            items[idx] = { ...att, name: e.target.value };
                            setDraft({ ...draft, attendees: items });
                          }}
                          placeholder="Nama tamu"
                          className="flex-1 text-sm px-2 py-1.5 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-800"
                        />
                        <input
                          value={att.position}
                          onChange={(e) => {
                            const items = [...draft.attendees];
                            items[idx] = { ...att, position: e.target.value };
                            setDraft({ ...draft, attendees: items });
                          }}
                          placeholder="Instansi / keterangan"
                          className="w-48 text-sm px-2 py-1.5 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-800"
                        />
                        <button
                          onClick={() => setDraft({ ...draft, attendees: draft.attendees.filter((a) => a.id !== att.id) })}
                          className="text-stone-400 hover:text-red-500 p-1.5"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Action Item</label>
                <button
                  onClick={() => setDraft({ ...draft, actionItems: [...draft.actionItems, emptyActionItem()] })}
                  className="text-xs text-emerald-800 hover:underline flex items-center gap-1"
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
                      className="flex-1 text-sm px-2 py-1.5 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-800"
                    />
                    <input
                      value={item.owner}
                      onChange={(e) => {
                        const items = [...draft.actionItems];
                        items[idx] = { ...item, owner: e.target.value };
                        setDraft({ ...draft, actionItems: items });
                      }}
                      placeholder="PIC"
                      className="w-28 text-sm px-2 py-1.5 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-800"
                    />
                    <input
                      type="date"
                      value={item.deadline}
                      onChange={(e) => {
                        const items = [...draft.actionItems];
                        items[idx] = { ...item, deadline: e.target.value };
                        setDraft({ ...draft, actionItems: items });
                      }}
                      className="w-36 text-sm px-2 py-1.5 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-800"
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

            {/* Dokumentasi Rapat */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Camera size={13} /> Dokumentasi Rapat
                </label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-emerald-800 hover:underline flex items-center gap-1"
                >
                  <Upload size={12} /> Unggah Foto
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const entries = files.map((file) => ({
                      id: `new-${crypto.randomUUID()}`,
                      file,
                      fileName: file.name,
                      url: URL.createObjectURL(file),
                    }));
                    setDraft((d) => ({ ...d, documents: [...d.documents, ...entries] }));
                    e.target.value = "";
                  }}
                />
              </div>
              {draft.documents.length === 0 ? (
                <p className="text-sm text-stone-400">Belum ada foto dokumentasi.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {draft.documents.map((doc) => (
                    <div key={doc.id} className="relative group aspect-square rounded-md overflow-hidden border border-stone-200 bg-stone-100">
                      <img src={doc.url} alt={doc.fileName} className="w-full h-full object-cover" />
                      <button
                        onClick={() => setDraft({ ...draft, documents: draft.documents.filter((d) => d.id !== doc.id) })}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <button onClick={() => setView(editingId ? "detail" : "list")} className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-md">
                Batal
              </button>
              <button
                onClick={saveDraft}
                disabled={saving}
                className="px-4 py-2 text-sm bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white rounded-md font-medium"
              >
                {saving ? (uploadingDocs ? "Mengunggah foto..." : "Menyimpan...") : "Simpan Notulen"}
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
                {isAdmin && (
                  <>
                    <button onClick={() => startEdit(selectedMeeting)} className="text-xs px-2.5 py-1.5 border border-stone-300 rounded-md hover:bg-stone-50 text-stone-600">
                      Edit
                    </button>
                    <button onClick={() => deleteMeeting(selectedMeeting.id)} className="text-xs px-2.5 py-1.5 border border-red-200 text-red-600 rounded-md hover:bg-red-50">
                      Hapus
                    </button>
                  </>
                )}
              </div>
            </div>

            {selectedMeeting.attendees.length > 0 && (
              <div className="text-sm text-stone-500">
                <span className="font-medium text-stone-600">{selectedMeeting.attendees.length} peserta hadir</span>
              </div>
            )}

            <DetailBlock label="Agenda" text={selectedMeeting.agenda} />
            <DetailBlock label="Pembahasan" text={selectedMeeting.discussion} />
            <DetailBlock label="Keputusan" text={selectedMeeting.decisions} />

            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <UserCheck size={13} /> Daftar Hadir
              </label>
              {selectedMeeting.attendees.length === 0 ? (
                <p className="text-sm text-stone-400">Belum ada daftar hadir dicatat.</p>
              ) : (
                <div className="border border-stone-200 rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wide">
                        <th className="text-left px-3 py-1.5 w-10">No</th>
                        <th className="text-left px-3 py-1.5">Nama</th>
                        <th className="text-left px-3 py-1.5">Jabatan / Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMeeting.attendees.map((a, idx) => (
                        <tr key={a.id} className="border-t border-stone-100">
                          <td className="px-3 py-1.5 text-stone-400">{idx + 1}</td>
                          <td className="px-3 py-1.5 text-stone-800">{a.name}</td>
                          <td className="px-3 py-1.5 text-stone-500">{a.position || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

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
                        {isAdmin ? (
                          <select
                            value={a.status}
                            onChange={(e) => updateActionStatus(selectedMeeting.id, a.id, e.target.value)}
                            className={`text-xs font-medium px-2 py-1 rounded-full border-0 shrink-0 ${cfg.bg} ${cfg.color}`}
                          >
                            <option value="belum">Belum</option>
                            <option value="proses">Proses</option>
                            <option value="selesai">Selesai</option>
                          </select>
                        ) : (
                          <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <ImageIcon size={13} /> Dokumentasi Rapat
              </label>
              {selectedMeeting.documents.length === 0 ? (
                <p className="text-sm text-stone-400">Belum ada foto dokumentasi.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {selectedMeeting.documents.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setLightboxUrl(doc.url)}
                      className="aspect-square rounded-md overflow-hidden border border-stone-200 bg-stone-100 hover:opacity-90"
                    >
                      <img src={doc.url} alt={doc.fileName} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setView("list")} className="text-sm text-emerald-800 hover:underline">
              ← Kembali ke arsip
            </button>
          </div>
        )}
      </div>

      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6 cursor-zoom-out"
        >
          <img src={lightboxUrl} alt="Dokumentasi" className="max-w-full max-h-full rounded-md shadow-2xl" />
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-emerald-900 text-white text-sm px-4 py-2 rounded-md shadow-lg">{toast}</div>
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
    default: "text-emerald-800 bg-emerald-50",
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

function LoginModal({ onClose, onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError("Email atau password salah.");
      return;
    }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-stone-800" style={{ fontFamily: "Merriweather, Georgia, serif" }}>
            Masuk sebagai Admin
          </h2>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-stone-400 -mt-2">Hanya admin yang bisa menambah/mengubah notulen. Publik tetap bisa melihat arsip tanpa login.</p>
        <div>
          <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1 block">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1 block">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 text-sm bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white rounded-md font-medium"
        >
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
      </form>
    </div>
  );
}

function RosterGroup({ title, roster, checkedNames, onToggle, onToggleAll }) {
  const checkedCount = roster.filter((p) => checkedNames.has(p.name)).length;
  const allChecked = checkedCount === roster.length;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-stone-500">
          {title} <span className="text-stone-400">({checkedCount}/{roster.length})</span>
        </span>
        <button onClick={() => onToggleAll(!allChecked)} className="text-xs text-emerald-800 hover:underline">
          {allChecked ? "Kosongkan" : "Pilih Semua"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 bg-stone-50 border border-stone-200 rounded-md p-2.5">
        {roster.map((person) => {
          const checked = checkedNames.has(person.name);
          return (
            <label
              key={person.name}
              className={`flex items-start gap-2 text-sm px-2 py-1.5 rounded cursor-pointer ${checked ? "bg-emerald-50" : "hover:bg-stone-100"}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(person)}
                className="mt-0.5 accent-emerald-700"
              />
              <span className="min-w-0">
                <span className="block text-stone-800 leading-tight">{person.name}</span>
                <span className="block text-xs text-stone-400 leading-tight">{person.position}</span>
              </span>
            </label>
          );
        })}
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
