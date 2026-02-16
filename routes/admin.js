const express = require('express');
const router = express.Router();
const { getDb, dbAll, dbGet, dbRun, writeAuditLog, saveDatabases } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// GET /api/admin/elections
router.get('/elections', authenticateToken, requireRole('admin'), (req, res) => {
    const { rosterDb } = getDb();
    const elections = dbAll(rosterDb, 'SELECT * FROM elections ORDER BY created_at DESC');
    res.json(elections);
});

// POST /api/admin/elections
router.post('/elections', authenticateToken, requireRole('admin'), (req, res) => {
    const { title, description, type, start_datetime, end_datetime, candidates } = req.body;

    if (!title || !type || !start_datetime || !end_datetime) {
        return res.status(400).json({ error: '必須項目を入力してください。' });
    }

    if (new Date(start_datetime) >= new Date(end_datetime)) {
        return res.status(400).json({ error: '終了日時は開始日時よりも後に設定してください。' });
    }

    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
        return res.status(400).json({ error: '候補者/選択肢を1つ以上設定してください。' });
    }

    const { rosterDb } = getDb();
    const id = uuidv4();

    dbRun(rosterDb, `
    INSERT INTO elections (id, title, description, type, start_datetime, end_datetime, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, title, description || '', type, start_datetime, end_datetime, 'upcoming']);

    candidates.forEach((candidate, index) => {
        dbRun(rosterDb, `
      INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order)
      VALUES (?, ?, ?, ?)
    `, [id, candidate.name, candidate.description || '', index]);
    });

    // 白票（棄権）選択肢を自動追加
    dbRun(rosterDb, `
    INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order)
    VALUES (?, ?, ?, ?)
  `, [id, '白票（棄権）', '棄権する場合はこちらを選択してください', candidates.length]);

    // 全組合員のvoting_statusを初期化
    const voters = dbAll(rosterDb, "SELECT employee_id FROM members WHERE role = 'voter'");
    for (const voter of voters) {
        dbRun(rosterDb,
            'INSERT OR IGNORE INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
            [id, voter.employee_id, 'not_voted']
        );
    }
    saveDatabases();

    writeAuditLog({
        actor_id: req.user.employee_id,
        actor_role: req.user.role,
        action: 'election_created',
        target_employee_id: null,
        election_id: id,
        reason: null,
        details: JSON.stringify({ title, type, start_datetime, end_datetime }),
        ip_address: req.ip
    });

    res.json({ success: true, id, message: '投票が作成されました。' });
});

// PUT /api/admin/elections/:id/activate
router.put('/elections/:id/activate', authenticateToken, requireRole('admin'), (req, res) => {
    const { rosterDb } = getDb();
    const election = dbGet(rosterDb, 'SELECT * FROM elections WHERE id = ?', [req.params.id]);
    if (!election) {
        return res.status(404).json({ error: '投票が見つかりません。' });
    }

    dbRun(rosterDb, "UPDATE elections SET status = 'active' WHERE id = ?", [req.params.id]);
    saveDatabases();

    writeAuditLog({
        actor_id: req.user.employee_id,
        actor_role: req.user.role,
        action: 'election_activated',
        target_employee_id: null,
        election_id: req.params.id,
        reason: null,
        details: null,
        ip_address: req.ip
    });

    res.json({ success: true, message: '投票が有効化されました。' });
});

// PUT /api/admin/elections/:id/extend
router.put('/elections/:id/extend', authenticateToken, requireRole('admin'), (req, res) => {
    const { new_end_datetime } = req.body;
    const { rosterDb } = getDb();

    const election = dbGet(rosterDb, 'SELECT * FROM elections WHERE id = ?', [req.params.id]);
    if (!election) {
        return res.status(404).json({ error: '投票が見つかりません。' });
    }

    if (new Date(new_end_datetime) <= new Date(election.end_datetime)) {
        return res.status(400).json({ error: '延長のみ可能です。現在の終了日時よりも後の日時を指定してください。' });
    }

    dbRun(rosterDb, 'UPDATE elections SET end_datetime = ? WHERE id = ?', [new_end_datetime, req.params.id]);
    saveDatabases();

    writeAuditLog({
        actor_id: req.user.employee_id,
        actor_role: req.user.role,
        action: 'election_extended',
        target_employee_id: null,
        election_id: req.params.id,
        reason: '投票期間延長',
        details: JSON.stringify({ old_end: election.end_datetime, new_end: new_end_datetime }),
        ip_address: req.ip
    });

    res.json({ success: true, message: `投票期間が延長されました。新しい終了日時: ${new_end_datetime}` });
});

// PUT /api/admin/reset-status
router.put('/reset-status', authenticateToken, requireRole('admin'), (req, res) => {
    const { employee_id, election_id, reason } = req.body;

    if (!employee_id || !election_id || !reason || reason.trim().length === 0) {
        return res.status(400).json({ error: '職員番号、投票ID、理由を全て入力してください。' });
    }

    const { rosterDb } = getDb();

    const currentStatus = dbGet(rosterDb,
        'SELECT status FROM voting_status WHERE election_id = ? AND employee_id = ?',
        [election_id, employee_id]
    );

    if (!currentStatus) {
        return res.status(404).json({ error: '指定された投票ステータスが見つかりません。' });
    }

    if (currentStatus.status !== 'voted_paper') {
        return res.status(400).json({
            error: 'ステータスリセットは「紙投票受付完了」状態からのみ可能です。電子投票完了のリセットはできません。'
        });
    }

    dbRun(rosterDb,
        "UPDATE voting_status SET status = ?, updated_at = datetime('now', 'localtime') WHERE election_id = ? AND employee_id = ?",
        ['not_voted', election_id, employee_id]
    );
    saveDatabases();

    writeAuditLog({
        actor_id: req.user.employee_id,
        actor_role: req.user.role,
        action: 'status_force_reset',
        target_employee_id: employee_id,
        election_id: election_id,
        reason: reason.trim(),
        details: JSON.stringify({ from_status: 'voted_paper', to_status: 'not_voted', reset_datetime: new Date().toISOString() }),
        ip_address: req.ip
    });

    res.json({ success: true, message: 'ステータスがリセットされました。監査ログに記録しました。' });
});

// POST /api/admin/count-votes/:electionId
router.post('/count-votes/:electionId', authenticateToken, requireRole('admin'), (req, res) => {
    const { electionId } = req.params;
    const { rosterDb, ballotDb } = getDb();

    const election = dbGet(rosterDb, 'SELECT * FROM elections WHERE id = ?', [electionId]);
    if (!election) {
        return res.status(404).json({ error: '投票が見つかりません。' });
    }

    const now = new Date();
    const endTime = new Date(election.end_datetime);

    if (now <= endTime) {
        return res.status(400).json({
            error: `投票期間が終了していません。終了日時: ${election.end_datetime}。開票は投票終了後にのみ実行できます。`
        });
    }

    if (election.status === 'counted') {
        return res.status(400).json({ error: 'この投票は既に開票済みです。' });
    }

    dbRun(rosterDb, "UPDATE elections SET status = 'counted' WHERE id = ?", [electionId]);
    saveDatabases();

    const results = dbAll(ballotDb, `
    SELECT selected_candidate, COUNT(*) as vote_count
    FROM votes
    WHERE election_id = ?
    GROUP BY selected_candidate
    ORDER BY vote_count DESC
  `, [electionId]);

    const totalVoters = dbGet(rosterDb, "SELECT COUNT(*) as count FROM members WHERE role = 'voter'").count;
    const votedCount = dbGet(rosterDb, `
    SELECT COUNT(*) as count FROM voting_status 
    WHERE election_id = ? AND status IN ('voted_electronic', 'voted_paper')
  `, [electionId]).count;

    writeAuditLog({
        actor_id: req.user.employee_id,
        actor_role: req.user.role,
        action: 'election_counted',
        target_employee_id: null,
        election_id: electionId,
        reason: null,
        details: JSON.stringify({ total_voters: totalVoters, voted_count: votedCount, results }),
        ip_address: req.ip
    });

    res.json({
        success: true,
        election: { id: electionId, title: election.title, type: election.type },
        results,
        statistics: {
            total_voters: totalVoters,
            voted_count: votedCount,
            turnout_rate: totalVoters > 0 ? (votedCount / totalVoters * 100).toFixed(1) : '0.0'
        }
    });
});

// GET /api/admin/results/:electionId
router.get('/results/:electionId', authenticateToken, requireRole('admin'), (req, res) => {
    const { electionId } = req.params;
    const { rosterDb, ballotDb } = getDb();

    const election = dbGet(rosterDb, 'SELECT * FROM elections WHERE id = ?', [electionId]);
    if (!election) {
        return res.status(404).json({ error: '投票が見つかりません。' });
    }

    if (election.status !== 'counted') {
        return res.status(400).json({ error: 'この投票はまだ開票されていません。' });
    }

    const results = dbAll(ballotDb, `
    SELECT selected_candidate, COUNT(*) as vote_count
    FROM votes
    WHERE election_id = ?
    GROUP BY selected_candidate
    ORDER BY vote_count DESC
  `, [electionId]);

    const totalVoters = dbGet(rosterDb, "SELECT COUNT(*) as count FROM members WHERE role = 'voter'").count;
    const votedCount = dbGet(rosterDb, `
    SELECT COUNT(*) as count FROM voting_status 
    WHERE election_id = ? AND status IN ('voted_electronic', 'voted_paper')
  `, [electionId]).count;

    res.json({
        election: {
            id: electionId,
            title: election.title,
            type: election.type,
            start_datetime: election.start_datetime,
            end_datetime: election.end_datetime
        },
        results,
        statistics: {
            total_voters: totalVoters,
            voted_count: votedCount,
            turnout_rate: totalVoters > 0 ? (votedCount / totalVoters * 100).toFixed(1) : '0.0'
        }
    });
});

// GET /api/admin/audit-logs
router.get('/audit-logs', authenticateToken, requireRole('admin'), (req, res) => {
    const { auditDb } = getDb();
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const total = dbGet(auditDb, 'SELECT COUNT(*) as count FROM audit_logs').count;
    const logs = dbAll(auditDb,
        'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?',
        [Number(limit), Number(offset)]
    );

    res.json({
        logs,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            total_pages: Math.ceil(total / limit)
        }
    });
});

// GET /api/admin/stats/:electionId
router.get('/stats/:electionId', authenticateToken, requireRole('admin'), (req, res) => {
    const { electionId } = req.params;
    const { rosterDb } = getDb();

    const totalVoters = dbGet(rosterDb, "SELECT COUNT(*) as count FROM members WHERE role = 'voter'").count;

    const statusCounts = dbAll(rosterDb, `
    SELECT status, COUNT(*) as count 
    FROM voting_status 
    WHERE election_id = ? 
    GROUP BY status
  `, [electionId]);

    const statusMap = {};
    let totalTracked = 0;
    statusCounts.forEach(s => {
        statusMap[s.status] = s.count;
        totalTracked += s.count;
    });

    res.json({
        total_voters: totalVoters,
        not_voted: (statusMap['not_voted'] || 0) + (totalVoters - totalTracked),
        voted_electronic: statusMap['voted_electronic'] || 0,
        voted_paper: statusMap['voted_paper'] || 0,
        turnout_rate: totalVoters > 0
            ? (((statusMap['voted_electronic'] || 0) + (statusMap['voted_paper'] || 0)) / totalVoters * 100).toFixed(1)
            : '0.0'
    });
});

// GET /api/admin/members
router.get('/members', authenticateToken, requireRole('admin'), (req, res) => {
    const { rosterDb } = getDb();
    const members = dbAll(rosterDb,
        'SELECT employee_id, name, role, created_at FROM members ORDER BY employee_id'
    );
    res.json(members);
});

module.exports = router;
