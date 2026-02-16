// 1,000名のダミー組合員CSVデータを生成するスクリプト
const fs = require('fs');
const path = require('path');

const lastNames = [
    '田中', '鈴木', '佐藤', '高橋', '渡辺', '伊藤', '山本', '中村', '小林', '加藤',
    '吉田', '山田', '松本', '井上', '木村', '林', '清水', '森', '阿部', '池田',
    '橋本', '山口', '石川', '前田', '藤田', '小川', '岡田', '後藤', '長谷川', '村上',
    '近藤', '坂本', '遠藤', '青木', '藤井', '西村', '福田', '太田', '三浦', '岡本',
    '松田', '中川', '中野', '原田', '小野', '竹内', '金子', '和田', '中山', '石田',
    '上田', '森田', '原', '柴田', '酒井', '工藤', '横山', '宮崎', '宮本', '内田',
    '高木', '安藤', '島田', '谷口', '大野', '丸山', '今井', '河野', '藤原', '福島',
    '中島', '三宅', '服部', '小島', '塚本', '秋山', '久保', '野口', '松井', '菊地',
    '千葉', '岩崎', '桜井', '野村', '木下', '佐々木', '菅原', '市川', '杉山', '北村',
    '新井', '平野', '大塚', '堀', '久保田', '松尾', '浜田', '土屋', '片山', '望月'
];

const firstNamesMale = [
    '太郎', '一郎', '二郎', '三郎', '健太', '拓也', '大輔', '翔太', '健一', '雄太',
    '直樹', '和也', '達也', '浩二', '誠', '豊', '修', '隆', '博', '進',
    '光一', '正人', '秀樹', '和彦', '信二', '敏夫', '幸一', '勇', '清', '弘',
    '亮太', '悠太', '蓮', '大翔', '陽太', '悠斗', '陸', '颯太', '朝陽', '湊'
];

const firstNamesFemale = [
    '花子', '美咲', '陽子', '恵子', '理恵', '真由美', '裕子', '直美', '智子', '京子',
    '由美子', '久美子', '幸子', '洋子', '節子', '和子', '弘子', '明美', '典子', '美紀',
    'さくら', '結衣', '凛', '陽菜', '美月', '彩花', '愛', '遥', '七海', '心春'
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateBirthdate() {
    const year = randomInt(1965, 2000);
    const month = String(randomInt(1, 12)).padStart(2, '0');
    const day = String(randomInt(1, 28)).padStart(2, '0');
    return `${year}${month}${day}`;
}

// CSV生成
const rows = [];
rows.push('employee_id,birthdate,name,role');

// 管理者 2名
rows.push('ADMIN001,19800101,選挙管理 太郎,admin');
rows.push('ADMIN002,19780315,選挙管理 花子,admin');

// 受付担当 5名
for (let i = 1; i <= 5; i++) {
    const id = `STAFF${String(i).padStart(3, '0')}`;
    const lastName = lastNames[randomInt(0, lastNames.length - 1)];
    const firstName = firstNamesFemale[randomInt(0, firstNamesFemale.length - 1)];
    rows.push(`${id},${generateBirthdate()},${lastName} ${firstName},reception`);
}

// 組合員 993名（合計1,000名）
for (let i = 1; i <= 993; i++) {
    const id = `EMP${String(i).padStart(4, '0')}`;
    const lastName = lastNames[randomInt(0, lastNames.length - 1)];
    const isMale = Math.random() > 0.4; // 60%男性
    const firstName = isMale
        ? firstNamesMale[randomInt(0, firstNamesMale.length - 1)]
        : firstNamesFemale[randomInt(0, firstNamesFemale.length - 1)];
    rows.push(`${id},${generateBirthdate()},${lastName} ${firstName},voter`);
}

// 特定テスト用アカウントの生年月日を固定
rows[rows.findIndex(r => r.startsWith('EMP0001,'))] = 'EMP0001,19900607,田中 太郎,voter';

const csvContent = rows.join('\n');
const outputPath = path.join(__dirname, 'dummy_members_1000.csv');
fs.writeFileSync(outputPath, '\ufeff' + csvContent, 'utf8'); // BOM付きUTF-8

console.log(`✅ ダミーCSV生成完了: ${outputPath}`);
console.log(`   合計行数: ${rows.length - 1}名（ヘッダー除く）`);
console.log(`   内訳: 管理者2名, 受付5名, 組合員993名`);
console.log(`\n📋 CSVフォーマット:`);
console.log(`   employee_id,birthdate,name,role`);
console.log(`   例: EMP0001,19900607,田中 太郎,voter`);
