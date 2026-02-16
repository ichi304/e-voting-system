const express = require('express');
const router = express.Router();
const { getDb, dbAll, dbGet, dbRun, writeAuditLog, saveDatabases } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/reception/search
router.get('/search', authenticateToken, requireRole('reception', 'admin'), (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
        return res.status(400).json({ error: '検索キーワードを入力してください。' });
    }

    const { rosterDb } = getDb();
    const keyword = `%${q.trim()}%`;
    const members = dbAll(rosterDb,
        'SELECT employee_id, name, role FROM members WHERE employee_id LIKE ? OR name LIKE ? LIMIT 50',
        [keyword, keyword]
    );

    res.json(members);
});

// GET /api/reception/status/:employeeId/:electionId
router.get('/status/:employeeId/:electionId', authenticateToken, requireRole('reception', 'admin'), (req, res) => {
    const { employeeId, electionId } = req.params;
    const { rosterDb } = getDb();

    const member = dbGet(rosterDb, 'SELECT employee_id, name FROM members WHERE employee_id = ?', [employeeId]);
    if (!member) {
        return res.status(404).json({ error: '組合員が見つかりません。' });
    }

    const status = dbGet(rosterDb,
        'SELECT status, updated_at FROM voting_status WHERE election_id = ? AND employee_id = ?',
        [electionId, employeeId]
    );

    res.json({
        employee_id: member.employee_id,
        name: member.name,
        election_id: electionId,
        status: status ? status.status : 'not_voted',
        updated_at: status ? status.updated_at : null
    });
});

// POST /api/reception/paper-vote
router.post('/paper-vote', authenticateToken, requireRole('reception', 'admin'), (req, res) => {
    const { employee_id, election_id } = req.body;

    if (!employee_id || !election_id) {
        return res.status(400).json({ error: '職員番号と投票IDが必要です。' });
    }

    const { rosterDb } = getDb();

    const election = dbGet(rosterDb, 'SELECT * FROM elections WHERE id = ?', [election_id]);
    if (!election) {
        return res.status(404).json({ error: '指定された投票が見つかりません。' });
    }

    if (election.status !== 'active') {
        return res.status(400).json({ error: 'この投票は現在受付中ではありません。' });
    }

    const currentStatus = dbGet(rosterDb,
        'SELECT status FROM voting_status WHERE election_id = ? AND employee_id = ?',
        [election_id, employee_id]
    );

    const status = currentStatus ? currentStatus.status : 'not_voted';

    if (status !== 'not_voted') {
        const statusLabels = {
            'voted_electronic': '電子投票完了',
            'voted_paper': '紙投票受付完了'
        };
        return res.status(400).json({
            error: `この組合員は既に「${statusLabels[status] || status}」です。紙投票の受付はできません。`
        });
    }

    if (currentStatus) {
        dbRun(rosterDb,
            "UPDATE voting_status SET status = ?, updated_at = datetime('now', 'localtime') WHERE election_id = ? AND employee_id = ?",
            ['voted_paper', election_id, employee_id]
        );
    } else {
        dbRun(rosterDb,
            'INSERT INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
            [election_id, employee_id, 'voted_paper']
        );
    }
    saveDatabases();

    writeAuditLog({
        actor_id: req.user.employee_id,
        actor_role: req.user.role,
        action: 'paper_vote_registered',
        target_employee_id: employee_id,
        election_id: election_id,
        reason: '紙投票受付',
        details: null,
        ip_address: req.ip
    });

    res.json({ success: true, message: '紙投票受付が完了しました。投票用紙を交付してください。' });
});

// GET /api/reception/elections
router.get('/elections', authenticateToken, requireRole('reception', 'admin'), (req, res) => {
    const { rosterDb } = getDb();
    const elections = dbAll(rosterDb,
        "SELECT * FROM elections WHERE status IN ('active', 'upcoming') ORDER BY start_datetime ASC"
    );
    res.json(elections);
});

// GET /api/reception/stats/:electionId
router.get('/stats/:electionId', authenticateToken, requireRole('reception', 'admin'), (req, res) => {
    const { electionId } = req.params;
    const { rosterDb } = getDb();

    const total = dbGet(rosterDb, "SELECT COUNT(*) as count FROM members WHERE role = 'voter'").count;

    const notVoted = dbGet(rosterDb,
        "SELECT COUNT(*) as count FROM voting_status WHERE election_id = ? AND status = 'not_voted'",
        [electionId]
    ).count;

    const electronic = dbGet(rosterDb,
        "SELECT COUNT(*) as count FROM voting_status WHERE election_id = ? AND status = 'voted_electronic'",
        [electionId]
    ).count;

    const paper = dbGet(rosterDb,
        "SELECT COUNT(*) as count FROM voting_status WHERE election_id = ? AND status = 'voted_paper'",
        [electionId]
    ).count;

    const registered = notVoted + electronic + paper;
    const unregistered = total - registered;

    res.json({
        total,
        not_voted: notVoted + unregistered,
        voted_electronic: electronic,
        voted_paper: paper,
        turnout_rate: total > 0 ? ((electronic + paper) / total * 100).toFixed(1) : '0.0'
    });
});

module.exports = router;
