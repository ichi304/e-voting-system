const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun, writeAuditLog } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// GET /api/admin/elections
router.get('/elections', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const elections = await dbAll('SELECT * FROM elections ORDER BY created_at DESC');
        res.json(elections);
    } catch (err) {
        console.error('選挙一覧エラー:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// POST /api/admin/elections
router.post('/elections', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
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

        const id = uuidv4();

        await dbRun(`
            INSERT INTO elections (id, title, description, type, start_datetime, end_datetime, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, title, description || '', type, start_datetime, end_datetime, 'upcoming']);

        for (let i = 0; i < candidates.length; i++) {
            await dbRun(`
                INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order)
                VALUES (?, ?, ?, ?)
            `, [id, candidates[i].name, candidates[i].description || '', i]);
        }

        // 白票（棄権）選択肢を自動追加
        await dbRun(`
            INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order)
            VALUES (?, ?, ?, ?)
        `, [id, '白票（棄権）', '棄権する場合はこちらを選択してください', candidates.length]);

        // 全組合員のvoting_statusを初期化
        const voters = await dbAll("SELECT employee_id FROM members WHERE role = 'voter'");
        for (const voter of voters) {
            await dbRun(
                'INSERT OR IGNORE INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
                [id, voter.employee_id, 'not_voted']
            );
        }

        await writeAuditLog({
            action: 'election_created',
            actorId: req.user.employee_id,
            electionId: id,
            details: JSON.stringify({ title, type, start_datetime, end_datetime }),
            ipAddress: req.ip
        });

        res.json({ success: true, id, message: '投票が作成されました。' });
    } catch (err) {
        console.error('投票作成エラー:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// PUT /api/admin/elections/:id/activate
router.put('/elections/:id/activate', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const election = await dbGet('SELECT * FROM elections WHERE id = ?', [req.params.id]);
        if (!election) return res.status(404).json({ error: '投票が見つかりません。' });

        await dbRun("UPDATE elections SET status = 'active' WHERE id = ?", [req.params.id]);

        await writeAuditLog({
            action: 'election_activated',
            actorId: req.user.employee_id,
            electionId: req.params.id,
            ipAddress: req.ip
        });

        res.json({ success: true, message: '投票が有効化されました。' });
    } catch (err) {
        console.error('有効化エラー:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// PUT /api/admin/elections/:id/extend
router.put('/elections/:id/extend', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { new_end_datetime } = req.body;
        const election = await dbGet('SELECT * FROM elections WHERE id = ?', [req.params.id]);
        if (!election) return res.status(404).json({ error: '投票が見つかりません。' });

        if (new Date(new_end_datetime) <= new Date(election.end_datetime)) {
            return res.status(400).json({ error: '延長のみ可能です。現在の終了日時よりも後の日時を指定してください。' });
        }

        await dbRun('UPDATE elections SET end_datetime = ? WHERE id = ?', [new_end_datetime, req.params.id]);

        await writeAuditLog({
            action: 'election_extended',
            actorId: req.user.employee_id,
            electionId: req.params.id,
            reason: '投票期間延長',
            details: JSON.stringify({ old_end: election.end_datetime, new_end: new_end_datetime }),
            ipAddress: req.ip
        });

        res.json({ success: true, message: `投票期間が延長されました。新しい終了日時: ${new_end_datetime}` });
    } catch (err) {
        console.error('延長エラー:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// PUT /api/admin/reset-status
router.put('/reset-status', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { employee_id, election_id, reason } = req.body;

        if (!employee_id || !election_id || !reason || reason.trim().length === 0) {
            return res.status(400).json({ error: '職員番号、投票ID、理由を全て入力してください。' });
        }

        const currentStatus = await dbGet(
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

        await dbRun(
            "UPDATE voting_status SET status = ?, voted_at = CURRENT_TIMESTAMP WHERE election_id = ? AND employee_id = ?",
            ['not_voted', election_id, employee_id]
        );

        await writeAuditLog({
            action: 'status_force_reset',
            actorId: req.user.employee_id,
            targetEmployeeId: employee_id,
            electionId: election_id,
            reason: reason.trim(),
            details: JSON.stringify({ from_status: 'voted_paper', to_status: 'not_voted', reset_datetime: new Date().toISOString() }),
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'ステータスがリセットされました。監査ログに記録しました。' });
    } catch (err) {
        console.error('リセットエラー:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// POST /api/admin/count-votes/:electionId
router.post('/count-votes/:electionId', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { electionId } = req.params;

        const election = await dbGet('SELECT * FROM elections WHERE id = ?', [electionId]);
        if (!election) return res.status(404).json({ error: '投票が見つかりません。' });

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

        await dbRun("UPDATE elections SET status = 'counted' WHERE id = ?", [electionId]);

        const results = await dbAll(`
            SELECT selected_candidate, COUNT(*) as vote_count
            FROM votes WHERE election_id = ?
            GROUP BY selected_candidate ORDER BY vote_count DESC
        `, [electionId]);

        const totalRow = await dbGet("SELECT COUNT(*) as count FROM members WHERE role = 'voter'");
        const totalVoters = parseInt(totalRow.count);
        const votedRow = await dbGet(`
            SELECT COUNT(*) as count FROM voting_status 
            WHERE election_id = ? AND status IN ('voted_electronic', 'voted_paper')
        `, [electionId]);
        const votedCount = parseInt(votedRow.count);

        await writeAuditLog({
            action: 'election_counted',
            actorId: req.user.employee_id,
            electionId: electionId,
            details: JSON.stringify({ total_voters: totalVoters, voted_count: votedCount, results }),
            ipAddress: req.ip
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
    } catch (err) {
        console.error('開票エラー:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// GET /api/admin/results/:electionId
router.get('/results/:electionId', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { electionId } = req.params;
        const election = await dbGet('SELECT * FROM elections WHERE id = ?', [electionId]);
        if (!election) return res.status(404).json({ error: '投票が見つかりません。' });

        if (election.status !== 'counted') {
            return res.status(400).json({ error: 'この投票はまだ開票されていません。' });
        }

        const results = await dbAll(`
            SELECT selected_candidate, COUNT(*) as vote_count
            FROM votes WHERE election_id = ?
            GROUP BY selected_candidate ORDER BY vote_count DESC
        `, [electionId]);

        const totalRow = await dbGet("SELECT COUNT(*) as count FROM members WHERE role = 'voter'");
        const totalVoters = parseInt(totalRow.count);
        const votedRow = await dbGet(`
            SELECT COUNT(*) as count FROM voting_status 
            WHERE election_id = ? AND status IN ('voted_electronic', 'voted_paper')
        `, [electionId]);
        const votedCount = parseInt(votedRow.count);

        res.json({
            election: { id: electionId, title: election.title, type: election.type, start_datetime: election.start_datetime, end_datetime: election.end_datetime },
            results,
            statistics: {
                total_voters: totalVoters,
                voted_count: votedCount,
                turnout_rate: totalVoters > 0 ? (votedCount / totalVoters * 100).toFixed(1) : '0.0'
            }
        });
    } catch (err) {
        console.error('結果取得エラー:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// GET /api/admin/audit-logs
router.get('/audit-logs', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        const totalRow = await dbGet('SELECT COUNT(*) as count FROM audit_logs');
        const total = parseInt(totalRow.count);
        const logs = await dbAll(
            'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?',
            [Number(limit), Number(offset)]
        );

        res.json({
            logs,
            pagination: { page: Number(page), limit: Number(limit), total, total_pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('監査ログエラー:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// GET /api/admin/stats/:electionId
router.get('/stats/:electionId', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { electionId } = req.params;
        const totalRow = await dbGet("SELECT COUNT(*) as count FROM members WHERE role = 'voter'");
        const totalVoters = parseInt(totalRow.count);

        const statusCounts = await dbAll(`
            SELECT status, COUNT(*) as count FROM voting_status WHERE election_id = ? GROUP BY status
        `, [electionId]);

        const statusMap = {};
        let totalTracked = 0;
        statusCounts.forEach(s => { statusMap[s.status] = parseInt(s.count); totalTracked += parseInt(s.count); });

        res.json({
            total_voters: totalVoters,
            not_voted: (statusMap['not_voted'] || 0) + (totalVoters - totalTracked),
            voted_electronic: statusMap['voted_electronic'] || 0,
            voted_paper: statusMap['voted_paper'] || 0,
            turnout_rate: totalVoters > 0
                ? (((statusMap['voted_electronic'] || 0) + (statusMap['voted_paper'] || 0)) / totalVoters * 100).toFixed(1)
                : '0.0'
        });
    } catch (err) {
        console.error('統計エラー:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// GET /api/admin/members
router.get('/members', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const members = await dbAll('SELECT employee_id, name, role, created_at FROM members ORDER BY employee_id');
        res.json(members);
    } catch (err) {
        console.error('メンバー一覧エラー:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

module.exports = router;
