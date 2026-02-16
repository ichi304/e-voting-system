const { getDb, dbRun, dbAll, saveDatabases } = require('./db/init');
const { v4: uuidv4 } = require('uuid');

function seedData() {
    const { rosterDb } = getDb();

    const insertMember = (id, birth, name, role) => {
        dbRun(rosterDb, 'INSERT OR IGNORE INTO members (employee_id, birthdate, name, role) VALUES (?, ?, ?, ?)',
            [id, birth, name, role]);
    };

    insertMember('ADMIN001', '19800101', '選挙管理 太郎', 'admin');
    insertMember('STAFF001', '19850515', '事務局 花子', 'reception');
    insertMember('STAFF002', '19870320', '事務局 次郎', 'reception');

    const names = [
        '田中 一郎', '鈴木 二郎', '佐藤 三郎', '高橋 四郎', '渡辺 五郎',
        '伊藤 六郎', '山本 七郎', '中村 八郎', '小林 九郎', '加藤 十郎',
        '吉田 太一', '山田 太二', '松本 太三', '井上 太四', '木村 太五',
        '林 太六', '清水 太七', '森 太八', '阿部 太九', '池田 太十',
        '橋本 光一', '山口 光二', '石川 光三', '前田 光四', '藤田 光五',
        '小川 光六', '岡田 光七', '後藤 光八', '長谷川 光九', '村上 光十',
        '近藤 健一', '坂本 健二', '遠藤 健三', '青木 健四', '藤井 健五',
        '西村 健六', '福田 健七', '太田 健八', '三浦 健九', '岡本 健十',
        '松田 正一', '中川 正二', '中野 正三', '原田 正四', '小野 正五',
        '竹内 正六', '金子 正七', '和田 正八', '中山 正九', '石田 正十'
    ];

    for (let i = 0; i < names.length; i++) {
        const empId = `EMP${String(i + 1).padStart(4, '0')}`;
        const year = 1980 + Math.floor(Math.random() * 20);
        const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
        const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
        const birthdate = `${year}${month}${day}`;
        insertMember(empId, birthdate, names[i], 'voter');
    }

    dbRun(rosterDb, 'UPDATE members SET birthdate = ? WHERE employee_id = ?', ['19900607', 'EMP0001']);

    const now = new Date();
    const fmtDate = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

    const addCandidate = (eid, name, desc, order) => {
        dbRun(rosterDb, `
      INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order)
      VALUES (?, ?, ?, ?)
    `, [eid, name, desc, order]);
    };

    const voters = dbAll(rosterDb, "SELECT employee_id FROM members WHERE role = 'voter'");

    const initVotingStatus = (electionId) => {
        for (const voter of voters) {
            dbRun(rosterDb,
                'INSERT OR IGNORE INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
                [electionId, voter.employee_id, 'not_voted']
            );
        }
    };

    // 役員選挙
    const e1 = uuidv4();
    dbRun(rosterDb, `INSERT OR IGNORE INTO elections (id, title, description, type, start_datetime, end_datetime, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [e1, '2026年度 役員選挙', '2026年度の組合役員（委員長・副委員長・書記長）を選出する選挙です。', 'officer',
            fmtDate(new Date(now.getTime() - 60 * 60 * 1000)), fmtDate(new Date(now.getTime() + 24 * 60 * 60 * 1000)), 'active']);
    addCandidate(e1, '山本 太郎', '現職委員長。組合活動歴15年。労働環境改善に注力。', 0);
    addCandidate(e1, '佐藤 花子', '副委員長候補。福利厚生制度の充実を公約。', 1);
    addCandidate(e1, '鈴木 一郎', '書記長候補。若手の意見反映を重視。', 2);
    addCandidate(e1, '白票（棄権）', '棄権する場合はこちらを選択してください', 3);
    initVotingStatus(e1);

    // ストライキ批准投票
    const e2 = uuidv4();
    dbRun(rosterDb, `INSERT OR IGNORE INTO elections (id, title, description, type, start_datetime, end_datetime, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [e2, 'ストライキ批准投票', '春闘における24時間ストライキの実施について批准投票を行います。', 'strike',
            fmtDate(new Date(now.getTime() - 30 * 60 * 1000)), fmtDate(new Date(now.getTime() + 48 * 60 * 60 * 1000)), 'active']);
    addCandidate(e2, '賛成', 'ストライキの実施に賛成します。', 0);
    addCandidate(e2, '反対', 'ストライキの実施に反対します。', 1);
    addCandidate(e2, '白票（棄権）', '棄権する場合はこちらを選択してください', 2);
    initVotingStatus(e2);

    // 信任投票
    const e3 = uuidv4();
    dbRun(rosterDb, `INSERT OR IGNORE INTO elections (id, title, description, type, start_datetime, end_datetime, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [e3, '2026年度 執行委員信任投票', '2026年度の執行委員候補について信任投票を行います。信任する候補者を全て選択してください（複数選択可）。', 'confidence',
            fmtDate(new Date(now.getTime() - 15 * 60 * 1000)), fmtDate(new Date(now.getTime() + 72 * 60 * 60 * 1000)), 'active']);
    addCandidate(e3, '田村 健太郎', '現職執行委員。労使交渉において成果を挙げている。', 0);
    addCandidate(e3, '中島 美咲', '新任候補。安全衛生委員としての実績あり。', 1);
    addCandidate(e3, '河野 大輔', '現職執行委員。賃金改定交渉を担当。', 2);
    addCandidate(e3, '吉村 亮太', '新任候補。若手組合員の声を代弁。工場現場出身。', 3);
    addCandidate(e3, '白票（棄権）', '棄権する場合はこちらを選択してください', 4);
    initVotingStatus(e3);

    saveDatabases();
}

module.exports = seedData;
