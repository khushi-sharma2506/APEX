const BASE = (typeof window !== "undefined" && window.location.origin.startsWith("http")) ? "" : "http://127.0.0.1:8000";

async function req(method, path, params = null, body = null) {
  let url = BASE + path;
  if (params) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== "") q.set(k, v);
    });
    if ([...q].length) url += "?" + q.toString();
  }
  const opts = { method, headers: {}, credentials: 'include' };
  if (body) {
    opts.body = JSON.stringify(body);
    opts.headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const e = await res.json();
      msg = e.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  login: (username, password) => req("POST", "/login", null, { username, password }),
  logout: () => req("POST", "/logout"),
  me: () => req("GET", "/me"),

  subjects: () => req("GET", "/subjects"),
  topics: (sid) => req("GET", "/topics", sid ? { subject_id: sid } : null),

  questions: (p) => req("GET", "/questions", p),
  questionById: (id) => req("GET", `/questions/${id}`),
  deleteQuestion: (id) => req("DELETE", `/questions/${id}`),

  uploadCsv: (file, dryRun = false) => {
    const fd = new FormData();
    fd.append("file", file);
    const url = `${BASE}/upload_csv?dry_run=${dryRun}`;
    return fetch(url, { method: "POST", body: fd }).then(async r => {
      if (!r.ok) {
        let err = `HTTP ${r.status}`;
        try { const j = await r.json(); err = j.detail || err; } catch {}
        throw new Error(err);
      }
      return r.json();
    });
  },
  uploadCsvDryRun: (file) => api.uploadCsv(file, true),

  createBlueprint: (data) => req("POST", "/blueprints", null, data),
  listBlueprints: () => req("GET", "/blueprints"),
  getBlueprint: (id) => req("GET", `/blueprints/${id}`),
  validateBlueprint: (id) => req("POST", `/blueprints/${id}/validate`),
  generateFromBlueprint: (id) => req("POST", `/blueprints/${id}/generate`),
  getPaper: (id) => req("GET", `/papers/${id}`),
  subjectTopicsByUnit: (sid) => req("GET", "/topics", { subject_id: sid, grouped_by_unit: true }),
  poolCheck: (params) => req("GET", "/pool-check", params),

  listExams: () => req("GET", "/exams"),
  createExam: (data) => req("POST", "/exams", null, data),
  releaseResults: (id, released, review_level) => req("PATCH", `/exams/${id}/release`, null, { released, review_level }),
  deleteExam: (id) => req("DELETE", `/exams/${id}`),

  startSession: (examId, studentId) =>
    req("POST", "/start_session", null, { exam_id: examId, student_id: studentId }),
  getSession: (id) => req("GET", `/session/${id}`),
  nextQuestion: (id) => req("POST", `/session/${id}/next`),
  submitAnswer: (id, qId, chosenOpt) =>
    req("POST", `/session/${id}/answer`, null, { q_id: qId, chosen_opt: chosenOpt }),
  forceSubmit: (id) => req("POST", `/session/${id}/submit`),

  results: (id, studentId) => req("GET", `/results/${id}`, { student_id: studentId }),

  cacheStats: () => req("GET", "/cache/stats"),
  cacheReset: () => req("POST", "/cache/reset"),
};
