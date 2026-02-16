// ===== Shared Components =====
const Components = {

  // ナビゲーションバー
  navbar(user) {
    const roleLabels = {
      admin: '管理者',
      reception: '受付担当',
      voter: '組合員'
    };

    return `
      <nav class="navbar">
        <div class="navbar-inner">
          <a class="navbar-brand" href="#" onclick="event.preventDefault();">
            <div class="navbar-logo">🗳️</div>
            <div>
              <div class="navbar-title">電子投票システム</div>
              <div class="navbar-subtitle">E-Voting System</div>
            </div>
          </a>
          <div class="navbar-user">
            <div class="navbar-user-info">
              <div class="navbar-user-name">${this.escapeHtml(user.name)}</div>
              <div class="navbar-user-role">${roleLabels[user.role] || user.role}</div>
            </div>
            <button class="btn-logout" onclick="App.logout()">ログアウト</button>
          </div>
        </div>
      </nav>
    `;
  },

  // トースト通知
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-message">${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 200);
    }, 4000);
  },

  // モーダル
  showModal(content) {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
      <div class="modal-overlay" onclick="Components.closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()">
          ${content}
        </div>
      </div>
    `;
  },

  closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const container = document.getElementById('modal-container');
    container.innerHTML = '';
  },

  // ローディング
  loading() {
    return `
      <div class="loading-page">
        <div class="spinner"></div>
        <div class="text-muted">読み込み中...</div>
      </div>
    `;
  },

  // ステータスバッジ
  statusBadge(status) {
    const config = {
      'not_voted': { label: '未投票', class: 'badge-neutral' },
      'voted_electronic': { label: '電子投票完了', class: 'badge-success' },
      'voted_paper': { label: '紙投票受付完了', class: 'badge-info' },
      'upcoming': { label: '準備中', class: 'badge-neutral' },
      'active': { label: '投票中', class: 'badge-success' },
      'closed': { label: '終了', class: 'badge-warning' },
      'counted': { label: '開票済み', class: 'badge-info' }
    };
    const c = config[status] || { label: status, class: 'badge-neutral' };
    return `<span class="badge ${c.class}">${c.label}</span>`;
  },

  // 選挙タイプアイコン
  electionTypeIcon(type) {
    const icons = {
      officer: { icon: '👤', class: 'election-type-officer' },
      strike: { icon: '✊', class: 'election-type-strike' },
      agenda: { icon: '📋', class: 'election-type-agenda' },
      confidence: { icon: '✋', class: 'election-type-confidence' }
    };
    const c = icons[type] || { icon: '📄', class: '' };
    return `<div class="election-type-icon ${c.class}">${c.icon}</div>`;
  },

  // 選挙タイプラベル
  electionTypeLabel(type) {
    const labels = {
      officer: '役員選挙',
      strike: 'ストライキ批准投票',
      agenda: '議案審議投票',
      confidence: '信任投票'
    };
    return labels[type] || type;
  },

  // 日時フォーマット
  formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  // HTMLエスケープ
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
