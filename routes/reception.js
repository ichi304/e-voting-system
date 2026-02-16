const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun, writeAuditLog } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/reception/search
router.get('/search', authenticateToken, requireRole('reception', 'admin'), async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length === 0) {
            return res.status(400).json({ error: '検索キーワードを入力してください。' });
        }

        const keyword = `%${q.trim()}%`;
        const members = await dbAll(
            'SELECT employee_id, name, role FROM members WHERE employee_id LIKE ? OR name LIKE ? LIMIT 50',
            [keyword, keyword]
        );

        res.json(members);
    } catch (err) {
        console.error('検索エラー:', err);
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

// GET /api/reception/status/:employeeId/:electionId
router.get('/status/:employeeId/:electionId', authenticateToken, requireRole('reception', 'admin'), async (req, res) => {
    try {
        const { employeeId, electionId } = req.params;

        const member = await dbGet('SELECT employee_id, name FROM members WHERE employee_id = ?', [employeeId]);
        if (!member) {
            return res.status(404).json({ error: '組合員が見つかりません。' });
        }

        const status = await dbGet(
            'SELECT status, voted_at FROM voting_status WHERE election_id = ? AND employee_id = ?',
            [electionId, employeeId]
        );

        res.json({
            employee_id: member.employee_id,
            name: member.name,
            election_id: electionId,
            status: status ? status.status : 'not_voted',
            updated_at: status ? status.voted_at : null
        });
    } catch (err) {
        console.error('ステータス取得エラー:', err);
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

// POST /api/reception/paper-vote
router.post('/paper-vote', authenticateToken, requireRole('reception', 'admin'), async (req, res) => {
    try {
        const { employee_id, election_id } = req.body;

        if (!employee_id || !election_id) {
            return res.status(400).json({ error: '職員番号と投票IDが必要です。' });
        }

        const election = await dbGet('SELECT * FROM elections WHERE id = ?', [election_id]);
        if (!election) {
            return res.status(404).json({ error: '指定された投票が見つかりません。' });
        }

        if (election.status !== 'active') {
            return res.status(400).json({ error: 'この投票は現在受付中ではありません。' });
        }

        const currentStatus = await dbGet(
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
            await dbRun(
                "UPDATE voting_status SET status = ?, voted_at = CURRENT_TIMESTAMP WHERE election_id = ? AND employee_id = ?",
                ['voted_paper', election_id, employee_id]
            );
        } else {
            await dbRun(
                'INSERT INTO voting_status (election_id, employee_id, status, voted_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
                [election_id, employee_id, 'voted_paper']
            );
        }

        await writeAuditLog({
            action: 'paper_vote_registered',
            actorId: req.user.employee_id,
            targetEmployeeId: employee_id,
            electionId: election_id,
            reason: '紙投票受付',
            ipAddress: req.ip
        });

        res.json({ success: true, message: '紙投票受付が完了しました。投票用紙を交付してください。' });
    } catch (err) {
        console.error('紙投票受付エラー:', err);
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

// GET /api/reception/elections
router.get('/elections', authenticateToken, requireRole('reception', 'admin'), async (req, res) => {
    try {
        const elections = await dbAll(
            "SELECT * FROM elections WHERE status IN ('active', 'upcoming') ORDER BY start_datetime ASC"
        );
        res.json(elections);
    } catch (err) {
        console.error('選挙一覧取得エラー:', err);
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

// GET /api/reception/stats/:electionId
router.get('/stats/:electionId', authenticateToken, requireRole('reception', 'admin'), async (req, res) => {
    try {
        const { electionId } = req.params;

        const totalRow = await dbGet("SELECT COUNT(*) as count FROM members WHERE role = 'voter'");
        const total = parseInt(totalRow.count);

        const notVotedRow = await dbGet(
            "SELECT COUNT(*) as count FROM voting_status WHERE election_id = ? AND status = 'not_voted'",
            [electionId]
        );
        const notVoted = parseInt(notVotedRow.count);

        const electronicRow = await dbGet(
            "SELECT COUNT(*) as count FROM voting_status WHERE election_id = ? AND status = 'voted_electronic'",
            [electionId]
        );
        const electronic = parseInt(electronicRow.count);

        const paperRow = await dbGet(
            "SELECT COUNT(*) as count FROM voting_status WHERE election_id = ? AND status = 'voted_paper'",
            [electionId]
        );
        const paper = parseInt(paperRow.count);

        const registered = notVoted + electronic + paper;
        const unregistered = total - registered;

        res.json({
            total,
            not_voted: notVoted + unregistered,
            voted_electronic: electronic,
            voted_paper: paper,
            turnout_rate: total > 0 ? ((electronic + paper) / total * 100).toFixed(1) : '0.0'
        });
    } catch (err) {
        console.error('統計取得エラー:', err);
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

module.exports = router;
