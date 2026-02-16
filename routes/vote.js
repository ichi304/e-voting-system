const express = require('express');
const router = express.Router();
const { getDb, dbAll, dbGet, dbRun, writeAuditLog, saveDatabases } = require('../db/init');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/vote/elections
router.get('/elections', authenticateToken, (req, res) => {
    const { rosterDb } = getDb();

    const elections = dbAll(rosterDb,
        "SELECT * FROM elections WHERE status IN ('active', 'upcoming') ORDER BY start_datetime ASC"
    );

    const electionsWithCandidates = elections.map(election => {
        const candidates = dbAll(rosterDb,
            'SELECT * FROM election_candidates WHERE election_id = ? ORDER BY display_order ASC',
            [election.id]
        );

        let myStatus = dbGet(rosterDb,
            'SELECT status FROM voting_status WHERE election_id = ? AND employee_id = ?',
            [election.id, req.user.employee_id]
        );

        if (!myStatus) {
            dbRun(rosterDb,
                'INSERT OR IGNORE INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
                [election.id, req.user.employee_id, 'not_voted']
            );
            myStatus = { status: 'not_voted' };
            saveDatabases();
        }

        return { ...election, candidates, my_status: myStatus.status };
    });

    res.json(electionsWithCandidates);
});

// GET /api/vote/election/:id
router.get('/election/:id', authenticateToken, (req, res) => {
    const { rosterDb } = getDb();
    const election = dbGet(rosterDb, 'SELECT * FROM elections WHERE id = ?', [req.params.id]);

    if (!election) {
        return res.status(404).json({ error: '指定された投票が見つかりません。' });
    }

    const candidates = dbAll(rosterDb,
        'SELECT * FROM election_candidates WHERE election_id = ? ORDER BY display_order ASC',
        [req.params.id]
    );

    const myStatus = dbGet(rosterDb,
        'SELECT status FROM voting_status WHERE election_id = ? AND employee_id = ?',
        [req.params.id, req.user.employee_id]
    );

    res.json({
        ...election,
        candidates,
        my_status: myStatus ? myStatus.status : 'not_voted'
    });
});

// POST /api/vote/submit - 投票実行（2フェーズコミット）
router.post('/submit', authenticateToken, requireRole('voter'), (req, res) => {
    const { election_id, selections } = req.body;

    if (!election_id || !selections || !Array.isArray(selections) || selections.length === 0) {
        return res.status(400).json({ error: '投票内容が不正です。' });
    }

    const { rosterDb, ballotDb } = getDb();

    const election = dbGet(rosterDb, 'SELECT * FROM elections WHERE id = ?', [election_id]);
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
    const currentStatus = dbGet(rosterDb,
        'SELECT status FROM voting_status WHERE election_id = ? AND employee_id = ?',
        [election_id, req.user.employee_id]
    );

    if (currentStatus && currentStatus.status !== 'not_voted') {
        return res.status(400).json({ error: '既に投票済みです。再投票はできません。' });
    }

    // 選択内容の妥当性チェック
    const validCandidates = dbAll(rosterDb,
        'SELECT candidate_name FROM election_candidates WHERE election_id = ?',
        [election_id]
    ).map(c => c.candidate_name);

    const allValid = selections.every(s => validCandidates.includes(s));
    if (!allValid) {
        return res.status(400).json({ error: '不正な選択肢が含まれています。' });
    }

    // ===== 2フェーズコミット =====
    let rosterSuccess = false;
    let ballotSuccess = false;

    try {
        // Phase 1: 名簿DB - ステータスを「電子投票完了」に更新
        const recheck = dbGet(rosterDb,
            'SELECT status FROM voting_status WHERE election_id = ? AND employee_id = ?',
            [election_id, req.user.employee_id]
        );

        if (recheck && recheck.status !== 'not_voted') {
            throw new Error('二重投票が検出されました。');
        }

        if (!recheck) {
            dbRun(rosterDb,
                'INSERT INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
                [election_id, req.user.employee_id, 'voted_electronic']
            );
        } else {
            dbRun(rosterDb,
                "UPDATE voting_status SET status = ?, updated_at = datetime('now', 'localtime') WHERE election_id = ? AND employee_id = ?",
                ['voted_electronic', election_id, req.user.employee_id]
            );
        }
        rosterSuccess = true;

        // Phase 2: 投票箱DB - 票データを追加（個人情報なし）
        for (const selection of selections) {
            dbRun(ballotDb,
                'INSERT INTO votes (election_id, selected_candidate) VALUES (?, ?)',
                [election_id, selection]
            );
        }
        ballotSuccess = true;

        // 両DB保存
        saveDatabases();

        // 監査ログ記録（投票内容は記録しない）
        writeAuditLog({
            actor_id: req.user.employee_id,
            actor_role: req.user.role,
            action: 'vote_submitted',
            target_employee_id: req.user.employee_id,
            election_id: election_id,
            reason: null,
            details: JSON.stringify({ vote_count: selections.length }),
            ip_address: req.ip
        });

        res.json({ success: true, message: '投票が完了しました。ご協力ありがとうございます。' });

    } catch (err) {
        // ロールバック処理
        if (rosterSuccess && !ballotSuccess) {
            try {
                dbRun(rosterDb,
                    "UPDATE voting_status SET status = ?, updated_at = datetime('now', 'localtime') WHERE election_id = ? AND employee_id = ?",
                    ['not_voted', election_id, req.user.employee_id]
                );
                saveDatabases();
            } catch (rollbackErr) {
                console.error('ロールバック失敗:', rollbackErr);
                writeAuditLog({
                    actor_id: 'SYSTEM',
                    actor_role: 'system',
                    action: 'rollback_failed',
                    target_employee_id: req.user.employee_id,
                    election_id: election_id,
                    reason: 'トランザクションロールバック失敗',
                    details: JSON.stringify({ error: rollbackErr.message }),
                    ip_address: req.ip
                });
            }
        }

        console.error('投票処理エラー:', err);
        return res.status(500).json({
            error: '投票処理中にエラーが発生しました。お手数ですが、再度お試しください。',
            detail: err.message
        });
    }
});

module.exports = router;
