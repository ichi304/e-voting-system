const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun, writeAuditLog } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// GET /api/vote/elections
router.get('/elections', authenticateToken, async (req, res) => {
    try {
        const elections = await dbAll(
            "SELECT * FROM elections WHERE status IN ('active', 'upcoming') ORDER BY start_datetime ASC"
        );

        const electionsWithCandidates = [];
        for (const election of elections) {
            const candidates = await dbAll(
                'SELECT * FROM election_candidates WHERE election_id = ? ORDER BY display_order ASC',
                [election.id]
            );

            let myStatus = await dbGet(
                'SELECT status FROM voting_status WHERE election_id = ? AND employee_id = ?',
                [election.id, req.user.employee_id]
            );

            if (!myStatus) {
                await dbRun(
                    'INSERT OR IGNORE INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
                    [election.id, req.user.employee_id, 'not_voted']
                );
                myStatus = { status: 'not_voted' };
            }

            electionsWithCandidates.push({ ...election, candidates, my_status: myStatus.status });
        }

        res.json(electionsWithCandidates);
    } catch (err) {
        console.error('投票一覧取得エラー:', err);
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

// GET /api/vote/election/:id
router.get('/election/:id', authenticateToken, async (req, res) => {
    try {
        const election = await dbGet('SELECT * FROM elections WHERE id = ?', [req.params.id]);

        if (!election) {
            return res.status(404).json({ error: '指定された投票が見つかりません。' });
        }

        const candidates = await dbAll(
            'SELECT * FROM election_candidates WHERE election_id = ? ORDER BY display_order ASC',
            [req.params.id]
        );

        const myStatus = await dbGet(
            'SELECT status FROM voting_status WHERE election_id = ? AND employee_id = ?',
            [req.params.id, req.user.employee_id]
        );

        res.json({
            ...election,
            candidates,
            my_status: myStatus ? myStatus.status : 'not_voted'
        });
    } catch (err) {
        console.error('投票詳細取得エラー:', err);
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

// POST /api/vote/submit - 投票実行（トランザクション）
router.post('/submit', authenticateToken, requireRole('voter'), async (req, res) => {
    const { election_id, selections } = req.body;

    if (!election_id || !selections || !Array.isArray(selections) || selections.length === 0) {
        return res.status(400).json({ error: '投票内容が不正です。' });
    }

    try {
        const election = await dbGet('SELECT * FROM elections WHERE id = ?', [election_id]);
        if (!election) {
            return res.status(404).json({ error: '指定された投票が見つかりません。' });
        }

        const now = new Date();
        const start = new Date(election.start_datetime);
        const end = new Date(election.end_datetime);

        if (now < start) {
            return res.status(400).json({ error: '投票期間がまだ開始されていません。' });
        }
        if (now > end) {
            return res.status(400).json({ error: '投票期間が終了しています。' });
        }
        if (election.status !== 'active') {
            return res.status(400).json({ error: 'この投票は現在受付中ではありません。' });
        }

        // 二重投票チェック
        const currentStatus = await dbGet(
            'SELECT status FROM voting_status WHERE election_id = ? AND employee_id = ?',
            [election_id, req.user.employee_id]
        );

        if (currentStatus && currentStatus.status !== 'not_voted') {
            return res.status(400).json({ error: '既に投票済みです。再投票はできません。' });
        }

        // 選択内容の妥当性チェック
        const validCandidatesRows = await dbAll(
            'SELECT candidate_name FROM election_candidates WHERE election_id = ?',
            [election_id]
        );
        const validCandidates = validCandidatesRows.map(c => c.candidate_name);

        const allValid = selections.every(s => validCandidates.includes(s));
        if (!allValid) {
            return res.status(400).json({ error: '不正な選択肢が含まれています。' });
        }

        // ステータス更新
        const recheck = await dbGet(
            'SELECT status FROM voting_status WHERE election_id = ? AND employee_id = ?',
            [election_id, req.user.employee_id]
        );

        if (recheck && recheck.status !== 'not_voted') {
            throw new Error('二重投票が検出されました。');
        }

        if (!recheck) {
            await dbRun(
                'INSERT INTO voting_status (election_id, employee_id, status, voted_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
                [election_id, req.user.employee_id, 'voted_electronic']
            );
        } else {
            await dbRun(
                "UPDATE voting_status SET status = ?, voted_at = CURRENT_TIMESTAMP WHERE election_id = ? AND employee_id = ?",
                ['voted_electronic', election_id, req.user.employee_id]
            );
        }

        // 票データを追加（個人情報なし）
        for (const selection of selections) {
            const voteId = uuidv4();
            await dbRun(
                "INSERT INTO votes (id, election_id, selected_candidate, vote_source) VALUES (?, ?, ?, 'electronic')",
                [voteId, election_id, selection]
            );
        }

        // 監査ログ記録（投票内容は記録しない）
        await writeAuditLog({
            action: 'vote_submitted',
            actorId: req.user.employee_id,
            targetEmployeeId: req.user.employee_id,
            electionId: election_id,
            details: JSON.stringify({ vote_count: selections.length }),
            ipAddress: req.ip
        });

        res.json({ success: true, message: '投票が完了しました。ご協力ありがとうございます。' });

    } catch (err) {
        console.error('投票処理エラー:', err);
        return res.status(500).json({
            error: '投票処理中にエラーが発生しました。お手数ですが、再度お試しください。',
            detail: err.message
        });
    }
});

module.exports = router;
