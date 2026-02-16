// ===== Admin Page (管理者) =====
const AdminPage = {
  activeTab: 'elections',

  async render(container) {
    const user = API.getUser();
    container.innerHTML = Components.navbar(user) + `
      <div class="main-content">
        <div class="page-header">
          <h1 class="page-title">管理者ダッシュボード</h1>
          <p class="page-subtitle">選挙管理委員長 管理パネル</p>
        </div>

        <div class="tabs" id="admin-tabs">
          <button class="tab ${this.activeTab === 'elections' ? 'active' : ''}" onclick="AdminPage.switchTab('elections')">📋 投票管理</button>
          <button class="tab ${this.activeTab === 'create' ? 'active' : ''}" onclick="AdminPage.switchTab('create')">➕ 新規作成</button>
          <button class="tab ${this.activeTab === 'import' ? 'active' : ''}" onclick="AdminPage.switchTab('import')">📥 CSVインポート</button>
          <button class="tab ${this.activeTab === 'reset' ? 'active' : ''}" onclick="AdminPage.switchTab('reset')">🔄 ステータスリセット</button>
          <button class="tab ${this.activeTab === 'reception' ? 'active' : ''}" onclick="AdminPage.switchTab('reception')">📝 受付機能</button>
          <button class="tab ${this.activeTab === 'audit' ? 'active' : ''}" onclick="AdminPage.switchTab('audit')">📜 監査ログ</button>
        </div>

        <div id="admin-content">
          ${Components.loading()}
        </div>
      </div>
    `;

    await this.loadTabContent();
  },

  async switchTab(tab) {
    this.activeTab = tab;

    // タブのアクティブ状態更新
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    document.getElementById('admin-content').innerHTML = Components.loading();
    await this.loadTabContent();
  },

  async loadTabContent() {
    switch (this.activeTab) {
      case 'elections': await this.loadElections(); break;
      case 'create': this.showCreateForm(); break;
      case 'import': this.showImportForm(); break;
      case 'reset': await this.showResetForm(); break;
      case 'reception': await this.loadReception(); break;
      case 'audit': await this.loadAuditLogs(); break;
    }
  },

  // ===== 投票管理 =====
  async loadElections() {
    const contentEl = document.getElementById('admin-content');
    try {
      const elections = await API.get('/admin/elections');

      if (elections.length === 0) {
        contentEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <div class="empty-state-title">投票がまだ作成されていません</div>
            <button class="btn btn-primary mt-2" onclick="AdminPage.switchTab('create')">新規投票を作成</button>
          </div>
        `;
        return;
      }

      let html = '';
      for (const election of elections) {
        let stats = null;
        try {
          stats = await API.get(`/admin/stats/${election.id}`);
        } catch (e) { /* ignore */ }

        const now = new Date();
        const endTime = new Date(election.end_datetime);
        const isExpired = now > endTime;

        html += `
          <div class="card mb-2">
            <div class="card-header">
              <div>
                <div class="flex gap-2" style="align-items: center;">
                  ${Components.electionTypeIcon(election.type)}
                  <div>
                    <div class="card-title">${Components.escapeHtml(election.title)}</div>
                    <div class="card-subtitle">${Components.electionTypeLabel(election.type)}</div>
                  </div>
                </div>
              </div>
              ${Components.statusBadge(election.status)}
            </div>

            <div class="election-meta mb-2">
              <div class="election-meta-item">📅 開始: ${Components.formatDateTime(election.start_datetime)}</div>
              <div class="election-meta-item">📅 終了: ${Components.formatDateTime(election.end_datetime)}</div>
            </div>

            ${stats ? `
              <div class="stats-grid" style="margin-bottom: 1rem;">
                <div class="stat-card">
                  <div class="stat-value accent">${stats.total_voters}</div>
                  <div class="stat-label">有権者</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value warning">${stats.not_voted}</div>
                  <div class="stat-label">未投票</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value success">${stats.voted_electronic}</div>
                  <div class="stat-label">電子</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${stats.voted_paper}</div>
                  <div class="stat-label">紙</div>
                </div>
              </div>
              <div class="progress-bar mb-2">
                <div class="progress-fill" style="width: ${stats.turnout_rate}%"></div>
              </div>
              <div class="text-center text-muted mb-2" style="font-size: 0.8rem;">投票率: ${stats.turnout_rate}%</div>
            ` : ''}

            <div class="flex gap-1" style="flex-wrap: wrap;">
              ${election.status === 'upcoming' ? `
                <button class="btn btn-success btn-sm" onclick="AdminPage.activateElection('${election.id}')">
                  ▶️ 有効化
                </button>
              ` : ''}
              ${election.status === 'active' ? `
                <button class="btn btn-warning btn-sm" onclick="AdminPage.showExtendForm('${election.id}', '${election.end_datetime}')">
                  ⏰ 期間延長
                </button>
              ` : ''}
              ${(election.status === 'active' || election.status === 'closed') && isExpired ? `
                <button class="btn btn-primary btn-sm" onclick="AdminPage.countVotes('${election.id}')">
                  🗳️ 開票する
                </button>
              ` : ''}
              ${election.status === 'counted' ? `
                <button class="btn btn-info btn-sm" style="background: linear-gradient(135deg, var(--color-info), #2563eb); color: white;" onclick="AdminPage.showResults('${election.id}')">
                  📊 結果を見る
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }

      contentEl.innerHTML = html;
    } catch (err) {
      contentEl.innerHTML = `<div class="empty-state"><p class="text-danger">${Components.escapeHtml(err.message)}</p></div>`;
    }
  },

  async activateElection(id) {
    if (!confirm('この投票を有効化しますか？組合員が投票できるようになります。')) return;

    try {
      await API.put(`/admin/elections/${id}/activate`);
      Components.showToast('投票が有効化されました', 'success');
      await this.loadElections();
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  },

  showExtendForm(electionId, currentEnd) {
    Components.showModal(`
      <div class="modal-header">
        <div class="modal-icon modal-icon-warning">⏰</div>
        <div class="modal-title">投票期間の延長</div>
      </div>
      <div class="modal-body">
        <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 1rem;">
          現在の終了日時: <strong style="color: var(--color-text-primary)">${Components.formatDateTime(currentEnd)}</strong>
        </p>
        <div class="form-group">
          <label class="form-label">新しい終了日時（延長のみ）</label>
          <input type="datetime-local" id="new-end-datetime" class="form-input">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Components.closeModal(event)">キャンセル</button>
        <button class="btn btn-warning" onclick="AdminPage.extendElection('${electionId}')">延長する</button>
      </div>
    `);
  },

  async extendElection(electionId) {
    const newEnd = document.getElementById('new-end-datetime').value;
    if (!newEnd) {
      Components.showToast('新しい終了日時を入力してください', 'warning');
      return;
    }

    try {
      await API.put(`/admin/elections/${electionId}/extend`, {
        new_end_datetime: newEnd.replace('T', ' ')
      });
      Components.closeModal();
      Components.showToast('投票期間が延長されました', 'success');
      await this.loadElections();
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  },

  async countVotes(electionId) {
    Components.showModal(`
      <div class="modal-header">
        <div class="modal-icon modal-icon-warning">🗳️</div>
        <div class="modal-title">開票の確認</div>
      </div>
      <div class="modal-body">
        <p style="text-align: center; color: var(--color-text-secondary); margin-bottom: 1rem;">
          この操作を実行すると投票結果が集計されます。<br>
          開票後は投票の再開はできません。
        </p>
        <label class="confirm-checkbox">
          <input type="checkbox" id="count-confirm-check" onchange="document.getElementById('count-confirm-btn').disabled = !this.checked">
          <span class="confirm-checkbox-text">開票処理を実行することに同意します</span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Components.closeModal(event)">キャンセル</button>
        <button class="btn btn-primary" id="count-confirm-btn" disabled onclick="AdminPage.executeCount('${electionId}')">開票を実行</button>
      </div>
    `);
  },

  async executeCount(electionId) {
    const btn = document.getElementById('count-confirm-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 集計中...';

    try {
      const result = await API.post(`/admin/count-votes/${electionId}`);
      Components.closeModal();
      Components.showToast('開票が完了しました', 'success');
      this.displayResults(result);
    } catch (err) {
      Components.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '開票を実行';
    }
  },

  async showResults(electionId) {
    try {
      const result = await API.get(`/admin/results/${electionId}`);
      this.displayResults(result);
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  },

  displayResults(data) {
    const results = data.results || [];
    const stats = data.statistics || {};
    const election = data.election || {};
    const totalVotes = results.reduce((sum, r) => sum + r.vote_count, 0);

    const barClasses = ['bar-1', 'bar-2', 'bar-3', 'bar-1', 'bar-2'];

    Components.showModal(`
      <div class="modal-header">
        <div class="modal-icon modal-icon-success">📊</div>
        <div class="modal-title">開票結果</div>
      </div>
      <div class="modal-body">
        <div style="text-align: center; margin-bottom: 1rem;">
          <div style="font-weight: 700; font-size: 1.1rem;">${Components.escapeHtml(election.title)}</div>
          <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-top: 0.25rem;">
            投票率: ${stats.turnout_rate}%（${stats.voted_count} / ${stats.total_voters}名）
          </div>
        </div>

        ${results.map((r, i) => {
      const pct = totalVotes > 0 ? (r.vote_count / totalVotes * 100) : 0;
      const isAbstain = r.selected_candidate === '白票（棄権）';
      return `
            <div class="result-item">
              <div class="result-header">
                <span class="result-name">${isAbstain ? '🏳️ ' : ''}${Components.escapeHtml(r.selected_candidate)}</span>
                <span class="result-count">${r.vote_count}票 (${pct.toFixed(1)}%)</span>
              </div>
              <div class="result-bar">
                <div class="result-bar-fill ${isAbstain ? 'bar-abstain' : barClasses[i % barClasses.length]}" style="width: ${Math.max(pct, 2)}%">
                  ${pct >= 10 ? pct.toFixed(1) + '%' : ''}
                </div>
              </div>
            </div>
          `;
    }).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-block" onclick="Components.closeModal(event)">閉じる</button>
      </div>
    `);

    // アニメーション
    setTimeout(() => {
      document.querySelectorAll('.result-bar-fill').forEach(bar => {
        bar.style.transition = 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
      });
    }, 100);
  },

  // ===== 新規投票作成 =====
  candidateCount: 2,

  showCreateForm() {
    this.candidateCount = 2;
    const contentEl = document.getElementById('admin-content');
    contentEl.innerHTML = `
      <div class="card" style="max-width: 640px;">
        <div class="card-header">
          <div class="card-title">➕ 新規投票の作成</div>
        </div>
        <form id="create-election-form" class="admin-form" onsubmit="AdminPage.createElection(event)">
          <div class="form-group">
            <label class="form-label">投票タイトル *</label>
            <input type="text" class="form-input" id="election-title" placeholder="例: 2026年度 役員選挙" required>
          </div>
          <div class="form-group">
            <label class="form-label">説明</label>
            <textarea class="form-input" id="election-desc" placeholder="投票の説明文を入力..." rows="3"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">投票タイプ *</label>
            <select class="form-input" id="election-type" required>
              <option value="">選択してください</option>
              <option value="officer">役員選挙</option>
              <option value="strike">ストライキ批准投票</option>
              <option value="agenda">議案審議投票</option>
              <option value="confidence">信任投票（複数選択可）</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">開始日時 *</label>
              <input type="datetime-local" class="form-input" id="election-start" required>
            </div>
            <div class="form-group">
              <label class="form-label">終了日時 *</label>
              <input type="datetime-local" class="form-input" id="election-end" required>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">候補者・選択肢 *（白票は自動追加されます）</label>
            <div class="candidate-inputs" id="candidate-inputs">
              <div class="candidate-input-row">
                <input type="text" class="form-input" placeholder="候補者名・選択肢" data-candidate="0" required>
                <input type="text" class="form-input" placeholder="説明（任意）" data-candidate-desc="0" style="flex: 1.5;">
              </div>
              <div class="candidate-input-row">
                <input type="text" class="form-input" placeholder="候補者名・選択肢" data-candidate="1" required>
                <input type="text" class="form-input" placeholder="説明（任意）" data-candidate-desc="1" style="flex: 1.5;">
              </div>
            </div>
            <button type="button" class="btn-add-candidate mt-1" onclick="AdminPage.addCandidateInput()">
              ＋ 候補者を追加
            </button>
          </div>
          <button type="submit" class="btn btn-primary btn-lg btn-block" id="create-btn">
            投票を作成する
          </button>
        </form>
      </div>
    `;
  },

  addCandidateInput() {
    const container = document.getElementById('candidate-inputs');
    const row = document.createElement('div');
    row.className = 'candidate-input-row';
    row.innerHTML = `
      <input type="text" class="form-input" placeholder="候補者名・選択肢" data-candidate="${this.candidateCount}" required>
      <input type="text" class="form-input" placeholder="説明（任意）" data-candidate-desc="${this.candidateCount}" style="flex: 1.5;">
      <button type="button" class="btn-remove-candidate" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(row);
    this.candidateCount++;
  },

  async createElection(event) {
    event.preventDefault();
    const btn = document.getElementById('create-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 作成中...';

    const candidateInputs = document.querySelectorAll('[data-candidate]');
    const candidates = [];
    candidateInputs.forEach(input => {
      const idx = input.dataset.candidate;
      const desc = document.querySelector(`[data-candidate-desc="${idx}"]`);
      if (input.value.trim()) {
        candidates.push({
          name: input.value.trim(),
          description: desc ? desc.value.trim() : ''
        });
      }
    });

    try {
      await API.post('/admin/elections', {
        title: document.getElementById('election-title').value.trim(),
        description: document.getElementById('election-desc').value.trim(),
        type: document.getElementById('election-type').value,
        start_datetime: document.getElementById('election-start').value.replace('T', ' '),
        end_datetime: document.getElementById('election-end').value.replace('T', ' '),
        candidates
      });

      Components.showToast('投票が作成されました！', 'success');
      this.activeTab = 'elections';
      await this.loadElections();

      // タブを切り替え
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.tab:first-child').classList.add('active');
    } catch (err) {
      Components.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '投票を作成する';
    }
  },

  // ===== ステータス強制リセット =====
  async showResetForm() {
    const contentEl = document.getElementById('admin-content');

    let elections = [];
    try {
      elections = await API.get('/admin/elections');
    } catch (e) { }

    contentEl.innerHTML = `
      <div class="card" style="max-width: 640px;">
        <div class="card-header">
          <div class="card-title">🔄 ステータス強制リセット</div>
        </div>
        <div style="background: var(--color-danger-bg); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem;">
          <p style="font-size: 0.85rem; color: var(--color-danger); font-weight: 500;">
            ⚠️ この操作は「紙投票受付完了」→「未投票」へのロールバックに限定されます。<br>
            実行すると監査ログに「日時・実行者・理由」が記録されます。
          </p>
        </div>
        <form class="admin-form" onsubmit="AdminPage.executeReset(event)">
          <div class="form-group">
            <label class="form-label">対象投票 *</label>
            <select class="form-input" id="reset-election" required>
              <option value="">選択してください</option>
              ${elections.map(e => `<option value="${e.id}">${Components.escapeHtml(e.title)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">対象職員番号 *</label>
            <input type="text" class="form-input" id="reset-employee" placeholder="例: EMP0001" required>
          </div>
          <div class="form-group">
            <label class="form-label">リセット理由 *（監査ログに記録されます）</label>
            <textarea class="form-input" id="reset-reason" placeholder="例: 用紙交付後の急病退場のため" rows="3" required></textarea>
          </div>
          <button type="submit" class="btn btn-danger btn-lg btn-block" id="reset-btn">
            ⚠️ ステータスをリセットする
          </button>
        </form>
      </div>
    `;
  },

  async executeReset(event) {
    event.preventDefault();

    if (!confirm('本当にステータスをリセットしますか？この操作は監査ログに記録されます。')) return;

    const btn = document.getElementById('reset-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 処理中...';

    try {
      const result = await API.put('/admin/reset-status', {
        election_id: document.getElementById('reset-election').value,
        employee_id: document.getElementById('reset-employee').value.trim(),
        reason: document.getElementById('reset-reason').value.trim()
      });

      Components.showToast(result.message, 'success');
      document.getElementById('reset-employee').value = '';
      document.getElementById('reset-reason').value = '';
      btn.disabled = false;
      btn.innerHTML = '⚠️ ステータスをリセットする';
    } catch (err) {
      Components.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '⚠️ ステータスをリセットする';
    }
  },

  // ===== 受付機能（管理者用） =====
  async loadReception() {
    // 受付ページと同じ機能を管理者にも提供
    const contentEl = document.getElementById('admin-content');
    contentEl.innerHTML = `
      <div class="card mb-2" id="admin-election-selector-card">
        <div class="card-header">
          <div class="card-title">📋 対象投票の選択</div>
        </div>
        <div id="admin-election-selector">
          ${Components.loading()}
        </div>
      </div>
      <div id="admin-stats-section" class="hidden">
        <div id="admin-stats-grid" class="stats-grid mb-2"></div>
      </div>
      <div class="card" id="admin-search-card" style="display: none;">
        <div class="card-header">
          <div class="card-title">🔍 組合員検索・紙投票受付</div>
        </div>
        <div class="search-box">
          <span class="search-icon">🔎</span>
          <input type="text" id="admin-member-search" placeholder="職員番号または氏名で検索..." oninput="AdminPage.debouncedReceptionSearch()">
        </div>
        <div id="admin-search-results"></div>
      </div>
    `;

    try {
      const elections = await API.get('/reception/elections');
      const selectorEl = document.getElementById('admin-election-selector');

      if (elections.length === 0) {
        selectorEl.innerHTML = '<div class="empty-state" style="padding: 1.5rem;"><div class="empty-state-title">アクティブな投票はありません</div></div>';
        return;
      }

      selectorEl.innerHTML = elections.map(e => `
        <div class="election-card" style="margin-bottom: 0.5rem; cursor: pointer;" onclick="AdminPage.selectReceptionElection('${e.id}', '${Components.escapeHtml(e.title).replace(/'/g, "\\'")}')">
          <div class="flex-between">
            <div class="flex gap-2" style="align-items: center;">
              ${Components.electionTypeIcon(e.type)}
              <div>
                <div style="font-weight: 600;">${Components.escapeHtml(e.title)}</div>
                <div style="font-size: 0.8rem; color: var(--color-text-muted);">${Components.formatDateTime(e.start_datetime)} ～ ${Components.formatDateTime(e.end_datetime)}</div>
              </div>
            </div>
            ${Components.statusBadge(e.status)}
          </div>
        </div>
      `).join('');
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  },

  selectedReceptionElection: null,

  async selectReceptionElection(electionId, title) {
    this.selectedReceptionElection = { id: electionId, title };
    document.getElementById('admin-election-selector-card').querySelector('.card-title').innerHTML =
      `📋 対象投票: <span style="color: var(--color-text-accent)">${title}</span>`;
    document.getElementById('admin-search-card').style.display = 'block';
    document.getElementById('admin-stats-section').classList.remove('hidden');

    try {
      const stats = await API.get(`/reception/stats/${electionId}`);
      document.getElementById('admin-stats-grid').innerHTML = `
        <div class="stat-card"><div class="stat-value accent">${stats.total}</div><div class="stat-label">有権者</div></div>
        <div class="stat-card"><div class="stat-value warning">${stats.not_voted}</div><div class="stat-label">未投票</div></div>
        <div class="stat-card"><div class="stat-value success">${stats.voted_electronic}</div><div class="stat-label">電子</div></div>
        <div class="stat-card"><div class="stat-value">${stats.voted_paper}</div><div class="stat-label">紙</div></div>
        <div class="stat-card"><div class="stat-value accent">${stats.turnout_rate}%</div><div class="stat-label">投票率</div></div>
      `;
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  },

  receptionSearchTimeout: null,
  debouncedReceptionSearch() {
    clearTimeout(this.receptionSearchTimeout);
    this.receptionSearchTimeout = setTimeout(() => this.receptionSearch(), 300);
  },

  async receptionSearch() {
    const query = document.getElementById('admin-member-search').value.trim();
    const resultsEl = document.getElementById('admin-search-results');
    if (!query) { resultsEl.innerHTML = ''; return; }

    try {
      const members = await API.get(`/reception/search?q=${encodeURIComponent(query)}`);
      if (members.length === 0) {
        resultsEl.innerHTML = '<div class="empty-state" style="padding: 1rem;"><div class="empty-state-title">該当なし</div></div>';
        return;
      }

      const statuses = await Promise.all(
        members.map(m => API.get(`/reception/status/${m.employee_id}/${this.selectedReceptionElection.id}`).catch(() => ({ status: 'unknown' })))
      );

      resultsEl.innerHTML = `
        <div class="table-container">
          <table>
            <thead><tr><th>職員番号</th><th>氏名</th><th>ステータス</th><th>操作</th></tr></thead>
            <tbody>${members.map((m, i) => {
        const s = statuses[i];
        return `<tr>
                <td style="font-weight: 600;">${Components.escapeHtml(m.employee_id)}</td>
                <td>${Components.escapeHtml(m.name)}</td>
                <td>${Components.statusBadge(s.status)}</td>
                <td>${s.status === 'not_voted' ?
            `<button class="btn btn-success btn-sm" onclick="AdminPage.adminPaperVote('${m.employee_id}', '${Components.escapeHtml(m.name).replace(/'/g, "\\'")}')">紙投票受付</button>` :
            '<span class="text-muted" style="font-size: 0.8rem;">受付不可</span>'
          }</td></tr>`;
      }).join('')}</tbody>
          </table>
        </div>
      `;
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  },

  async adminPaperVote(employeeId, name) {
    Components.showModal(`
      <div class="modal-header"><div class="modal-icon modal-icon-warning">📄</div><div class="modal-title">紙投票受付の確認</div></div>
      <div class="modal-body">
        <div class="confirm-summary">
          <div class="confirm-item"><span class="confirm-item-label">対象投票</span><span class="confirm-item-value">${Components.escapeHtml(this.selectedReceptionElection.title)}</span></div>
          <div class="confirm-item"><span class="confirm-item-label">職員番号</span><span class="confirm-item-value">${Components.escapeHtml(employeeId)}</span></div>
          <div class="confirm-item"><span class="confirm-item-label">氏名</span><span class="confirm-item-value">${Components.escapeHtml(name)}</span></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Components.closeModal(event)">キャンセル</button>
        <button class="btn btn-success" id="admin-paper-btn" onclick="AdminPage.execAdminPaperVote('${employeeId}')">受付を確定</button>
      </div>
    `);
  },

  async execAdminPaperVote(employeeId) {
    const btn = document.getElementById('admin-paper-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      const result = await API.post('/reception/paper-vote', { employee_id: employeeId, election_id: this.selectedReceptionElection.id });
      Components.closeModal();
      Components.showToast(result.message, 'success');
      await this.receptionSearch();
      await this.selectReceptionElection(this.selectedReceptionElection.id, this.selectedReceptionElection.title);
    } catch (err) {
      Components.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '受付を確定';
    }
  },

  // ===== 監査ログ =====
  async loadAuditLogs() {
    const contentEl = document.getElementById('admin-content');
    try {
      const data = await API.get('/admin/audit-logs?limit=100');

      if (data.logs.length === 0) {
        contentEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📜</div>
            <div class="empty-state-title">監査ログはまだありません</div>
          </div>
        `;
        return;
      }

      const actionLabels = {
        'vote_submitted': '🗳️ 電子投票実行',
        'paper_vote_registered': '📄 紙投票受付',
        'status_force_reset': '🔄 ステータスリセット',
        'election_created': '➕ 投票作成',
        'election_activated': '▶️ 投票有効化',
        'election_extended': '⏰ 投票期間延長',
        'election_counted': '📊 開票処理',
        'rollback_failed': '❌ ロールバック失敗'
      };

      contentEl.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-title">📜 監査ログ（${data.pagination.total}件）</div>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>日時</th>
                  <th>操作</th>
                  <th>実行者</th>
                  <th>対象</th>
                  <th>理由・詳細</th>
                </tr>
              </thead>
              <tbody>
                ${data.logs.map(log => `
                  <tr>
                    <td style="white-space: nowrap; font-size: 0.8rem;">${Components.formatDateTime(log.timestamp)}</td>
                    <td>${actionLabels[log.action] || log.action}</td>
                    <td style="font-weight: 500;">${Components.escapeHtml(log.actor_id)}</td>
                    <td>${log.target_employee_id ? Components.escapeHtml(log.target_employee_id) : '-'}</td>
                    <td style="font-size: 0.8rem; color: var(--color-text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${Components.escapeHtml(log.reason || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      contentEl.innerHTML = `<div class="empty-state"><p class="text-danger">${Components.escapeHtml(err.message)}</p></div>`;
    }
  },

  // ===== CSVインポート =====
  showImportForm() {
    const contentEl = document.getElementById('admin-content');
    contentEl.innerHTML = `
      <div class="card" style="max-width: 720px;">
        <div class="card-header">
          <div class="card-title">📥 組合員CSVインポート</div>
        </div>

        <div style="padding: 1rem; background: var(--color-bg-glass); border-radius: var(--radius-md); margin-bottom: 1.5rem;">
          <div class="form-label" style="margin-bottom: 0.5rem;">📋 CSVフォーマット</div>
          <code style="font-size: 0.85rem; color: var(--color-text-secondary);">employee_id,birthdate,name,role</code><br>
          <code style="font-size: 0.85rem; color: var(--color-text-secondary);">EMP0001,19900607,田中 太郎,voter</code>
          <div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--color-text-muted);">
            ※ role: admin / reception / voter<br>
            ※ birthdate: 8桁の数字（YYYYMMDD）
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">CSVファイルを選択</label>
          <input type="file" id="csv-file-input" accept=".csv" onchange="AdminPage.previewCSV()"
            style="width:100%; padding:0.75rem; border:2px dashed var(--color-border); border-radius:var(--radius-md); cursor:pointer;">
        </div>

        <div id="csv-preview" style="display:none; margin-top:1rem;">
          <div class="form-label">📊 プレビュー</div>
          <div id="csv-preview-content" style="max-height: 300px; overflow-y: auto; font-size: 0.85rem; background: var(--color-bg-glass); padding: 1rem; border-radius: var(--radius-md);"></div>
        </div>

        <div class="form-group" style="margin-top: 1.5rem;">
          <label class="form-label">インポートモード</label>
          <select id="import-mode" class="form-select">
            <option value="append">追加モード（既存メンバーを保持して追加/更新）</option>
            <option value="replace">置換モード（管理者以外を全削除してから登録）</option>
          </select>
          <div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--color-warning);">
            ⚠️ 置換モードを選択すると、管理者以外の既存メンバーが全て削除されます。
          </div>
        </div>

        <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
          <button class="btn btn-primary" id="import-btn" onclick="AdminPage.executeImport()" disabled>
            📥 インポート実行
          </button>
          <button class="btn btn-outline" onclick="AdminPage.resetMembers()">
            🗑️ 全メンバーリセット
          </button>
        </div>

        <div id="import-result" style="margin-top: 1.5rem;"></div>
      </div>
    `;
  },

  async previewCSV() {
    const fileInput = document.getElementById('csv-file-input');
    const previewDiv = document.getElementById('csv-preview');
    const previewContent = document.getElementById('csv-preview-content');
    const importBtn = document.getElementById('import-btn');

    if (!fileInput.files || fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const text = await file.text();
    const lines = text.trim().split('\n').map(l => l.replace(/\r/g, ''));

    const totalLines = lines.length - 1; // ヘッダー除く
    const previewLines = lines.slice(0, 11); // ヘッダー + 10件

    let html = `<div style="margin-bottom: 0.75rem; font-weight: 600;">合計: ${totalLines}件のデータ</div>`;
    html += '<table class="data-table" style="font-size: 0.8rem;"><thead><tr>';

    const headers = previewLines[0].split(',');
    headers.forEach(h => { html += `<th>${Components.escapeHtml(h.trim())}</th>`; });
    html += '</tr></thead><tbody>';

    for (let i = 1; i < previewLines.length; i++) {
      html += '<tr>';
      const cols = previewLines[i].split(',');
      cols.forEach(c => { html += `<td>${Components.escapeHtml(c.trim())}</td>`; });
      html += '</tr>';
    }

    if (totalLines > 10) {
      html += `<tr><td colspan="${headers.length}" style="text-align:center; color: var(--color-text-muted);">... 他${totalLines - 10}件</td></tr>`;
    }

    html += '</tbody></table>';

    previewContent.innerHTML = html;
    previewDiv.style.display = 'block';
    importBtn.disabled = false;
  },

  async executeImport() {
    const fileInput = document.getElementById('csv-file-input');
    const mode = document.getElementById('import-mode').value;
    const resultDiv = document.getElementById('import-result');
    const importBtn = document.getElementById('import-btn');

    if (!fileInput.files || fileInput.files.length === 0) {
      Components.showToast('CSVファイルを選択してください。', 'error');
      return;
    }

    if (mode === 'replace') {
      if (!confirm('⚠️ 置換モード：管理者以外の既存メンバーを全て削除して、CSVのデータで置き換えます。\n\nよろしいですか？')) {
        return;
      }
    }

    importBtn.disabled = true;
    importBtn.innerHTML = '<span class="spinner"></span> インポート中...';

    try {
      const csv_data = await fileInput.files[0].text();
      const result = await API.post('/admin/import-members', { csv_data, mode });

      let html = `
        <div class="card" style="background: var(--color-success-bg); border-color: var(--color-success);">
          <div style="font-weight: 600; margin-bottom: 0.5rem;">✅ ${Components.escapeHtml(result.message)}</div>
          <div style="font-size: 0.9rem;">
            <div>登録/更新: <strong>${result.stats.inserted}名</strong></div>
            <div>スキップ: <strong>${result.stats.skipped}名</strong></div>
            ${result.stats.deleted > 0 ? `<div>削除: <strong>${result.stats.deleted}名</strong></div>` : ''}
          </div>
      `;

      if (result.stats.errors && result.stats.errors.length > 0) {
        html += `<div style="margin-top: 0.5rem; color: var(--color-warning); font-size: 0.85rem;">`;
        html += '<div>⚠️ エラー:</div>';
        result.stats.errors.forEach(e => { html += `<div>・${Components.escapeHtml(e)}</div>`; });
        html += '</div>';
      }

      html += '</div>';
      resultDiv.innerHTML = html;
    } catch (err) {
      resultDiv.innerHTML = `<div class="text-danger">❌ ${Components.escapeHtml(err.message)}</div>`;
    }

    importBtn.disabled = false;
    importBtn.innerHTML = '📥 インポート実行';
  },

  async resetMembers() {
    if (!confirm('⚠️ 管理者以外の全メンバーを削除します。\n投票ステータスも全てリセットされます。\n\n本当によろしいですか？')) {
      return;
    }
    if (!confirm('⚠️⚠️ 最終確認です。この操作は元に戻せません。\n\n実行しますか？')) {
      return;
    }

    try {
      const result = await API.delete('/admin/members/reset');
      Components.showToast(result.message, 'success');
    } catch (err) {
      Components.showToast(err.message, 'error');
    }
  }
};
