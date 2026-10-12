// Khảo sát sau khóa (chỉ admin). Mount tại /api/feedback.
const express = require('express');
const { summarize, GROUP_LABEL } = require('../services/feedback');
const { averageScore, npsScore } = require('../services/stats');

module.exports = (db) => {
  const router = express.Router(); // đã qua requireAuth + requireAdmin ở create-app.js

  router.get('/', async (_req, res) => {
    const rows = await db.all('select class_id, short_code, scores, more_courses, next_courses from course_feedback');
    const by = new Map();
    for (const r of rows) {
      const k = r.class_id ?? 'none';
      (by.get(k) ?? by.set(k, { class_id: r.class_id, short_code: r.short_code, rows: [] }).get(k)).rows.push(r);
    }
    const classes = [...by.values()].filter((g) => g.class_id != null).map((g) => ({
      class_id: g.class_id, short_code: g.short_code, n: g.rows.length,
      overall_avg: averageScore(g.rows.map((r) => r.scores?.overall)),
      nps: npsScore(g.rows.map((r) => r.scores?.recommend)),
    })).sort((a, b) => b.n - a.n || String(a.short_code).localeCompare(String(b.short_code)));
    res.json({ summary: summarize(rows), group_labels: GROUP_LABEL, classes, unmatched: by.get('none')?.rows.length ?? 0 });
  });

  return router;
};
