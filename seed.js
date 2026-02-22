const { initDatabases, getPool, dbRun, dbAll } = require('./db/init');
const { v4: uuidv4 } = require('uuid');

// ランダムな5桁PINを生成（弱いPINを除外）
function generateSecurePin() {
  const weakPins = new Set([
    '00000', '11111', '22222', '33333', '44444', '55555', '66666', '77777', '88888', '99999',
    '01234', '12345', '23456', '34567', '45678', '56789', '98765', '87654', '76543', '65432',
    '54321', '43210', '01010', '10101', '12321', '11211', '00100', '99099'
  ]);
  let pin;
  do {
    pin = String(Math.floor(10000 + Math.random() * 90000));
  } while (weakPins.has(pin));
  return pin;
}

async function seed() {
  console.log('🌱 シードデータの投入を開始します...\n');

  await initDatabases();

  const insertMember = async (id, pin, name, role) => {
    await dbRun('INSERT OR IGNORE INTO members (employee_id, login_pin, name, role) VALUES (?, ?, ?, ?)',
      [id, pin, name, role]);
  };

  // ===== 管理者・受付担当の作成 =====
  const adminPin = generateSecurePin();
  const staff1Pin = generateSecurePin();
  const staff2Pin = generateSecurePin();

  await insertMember('ADMIN001', adminPin, '選挙管理 太郎', 'admin');
  await insertMember('STAFF001', staff1Pin, '事務局 花子', 'reception');
  await insertMember('STAFF002', staff2Pin, '受付 次郎', 'reception');
  console.log('✅ 管理者・受付担当を登録しました');

  // ===== 組合員の作成 =====
  const names = [
    '田中 太郎', '鈴木 花子', '佐藤 一郎', '高橋 美咲', '渡辺 健太',
    '伊藤 さくら', '山本 大輔', '中村 あかり', '小林 翔太', '加藤 由美',
    '吉田 拓海', '山田 千尋', '松本 隼人', '井上 葵', '木村 悠斗',
    '林 美月', '斎藤 蓮', '清水 結衣', '山崎 陽向', '森 凛',
    '池田 大地', '橋本 ひなた', '阿部 颯', '石川 心愛', '前田 奏',
    '藤田 朝陽', '後藤 彩花', '岡田 湊', '長谷川 詩', '村上 樹'
  ];

  const voterPins = [];
  for (let i = 1; i <= 30; i++) {
    const empId = `EMP${String(i).padStart(4, '0')}`;
    const pin = generateSecurePin();
    voterPins.push({ empId, pin, name: names[i - 1] });
    await insertMember(empId, pin, names[i - 1], 'voter');
  }
  console.log('✅ 組合員30名を登録しました');

  // ===== テスト投票の作成 =====
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000);
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  // ストライキ批准投票
  const strikeId = uuidv4();
  await dbRun(
    `INSERT INTO elections (id, title, description, type, start_datetime, end_datetime, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [strikeId, 'テスト: ストライキ批准投票', 'テスト用のストライキ批准投票です。', 'strike', fmt(start), fmt(end), 'active']
  );

  await dbRun('INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order) VALUES (?, ?, ?, ?)',
    [strikeId, '賛成', 'ストライキを批准する', 0]);
  await dbRun('INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order) VALUES (?, ?, ?, ?)',
    [strikeId, '反対', 'ストライキを批准しない', 1]);
  await dbRun('INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order) VALUES (?, ?, ?, ?)',
    [strikeId, '白票（棄権）', '棄権する場合はこちらを選択してください', 2]);

  console.log('✅ テスト投票(ストライキ批准)を作成しました');

  // 議案審議投票（detail_url付き）
  const agendaId = uuidv4();
  await dbRun(
    `INSERT INTO elections (id, title, description, type, start_datetime, end_datetime, status, detail_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [agendaId, 'テスト: 議案審議投票', '来年度の予算案について審議します。', 'agenda', fmt(start), fmt(end), 'active', 'https://example.com/budget-proposal-2026.pdf']
  );

  await dbRun('INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order) VALUES (?, ?, ?, ?)',
    [agendaId, '賛成', '予算案を承認する', 0]);
  await dbRun('INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order) VALUES (?, ?, ?, ?)',
    [agendaId, '反対', '予算案を否決する', 1]);
  await dbRun('INSERT INTO election_candidates (election_id, candidate_name, candidate_description, display_order) VALUES (?, ?, ?, ?)',
    [agendaId, '白票（棄権）', '棄権する場合はこちらを選択してください', 2]);

  console.log('✅ テスト投票(議案審議 / 資料リンク付き)を作成しました');

  // 全組合員のvoting_statusを初期化
  const voters = await dbAll("SELECT employee_id FROM members WHERE role = 'voter'");
  for (const voter of voters) {
    await dbRun('INSERT OR IGNORE INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
      [strikeId, voter.employee_id, 'not_voted']);
    await dbRun('INSERT OR IGNORE INTO voting_status (election_id, employee_id, status) VALUES (?, ?, ?)',
      [agendaId, voter.employee_id, 'not_voted']);
  }
  console.log('✅ 投票ステータス初期化完了');

  console.log('\n🎉 シードデータの投入が完了しました！\n');
  console.log('━'.repeat(50));
  console.log('📋 ログイン情報');
  console.log('━'.repeat(50));
  console.log(`  管理者:     ADMIN001  / PIN: ${adminPin}`);
  console.log(`  受付担当1:  STAFF001  / PIN: ${staff1Pin}`);
  console.log(`  受付担当2:  STAFF002  / PIN: ${staff2Pin}`);
  console.log('');
  console.log('  組合員:');
  voterPins.forEach(v => {
    console.log(`    ${v.empId} / PIN: ${v.pin}  (${v.name})`);
  });
  console.log('━'.repeat(50));
  console.log('⚠️  上記のPINを控えてください。再生成すると変わります。\n');

  process.exit(0);
}

seed().catch(err => {
  console.error('❌ シードエラー:', err);
  process.exit(1);
});
