// ===== Voter Page (組合員) =====
const VoterPage = {
  elections: [],
  currentElection: null,

  async render(container) {
    const user = API.getUser();
    container.innerHTML = Components.navbar(user) + `
      <div class="main-content">
        <div class="page-header">
          <h1 class="page-title">投票一覧</h1>
          <p class="page-subtitle">参加可能な投票を選択してください</p>
        </div>
        <div id="elections-list">
          ${Components.loading()}
        </div>
      </div>
    `;

    await this.loadElections();
  },

  async loadElections() {
    try {
      this.elections = await API.get('/vote/elections');
      this.renderElectionsList();
    } catch (err) {
      document.getElementById('elections-list').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-title">読み込みエラー</div>
          <p class="text-muted">${Components.escapeHtml(err.message)}</p>
          <button class="btn btn-secondary mt-2" onclick="VoterPage.loadElections()">再読み込み</button>
        </div>
      `;
    }
  },

  renderElectionsList() {
    const listEl = document.getElementById('elections-list');

    if (this.elections.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-title">現在、参加可能な投票はありません</div>
          <p class="text-muted">新しい投票が開始されると、ここに表示されます</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.elections.map((election, i) => {
      const canVote = election.status === 'active' && election.my_status === 'not_voted';
      const isVoted = election.my_status === 'voted_electronic' || election.my_status === 'voted_paper';

      return `
        <div class="election-card" style="animation-delay: ${i * 0.1}s" 
             ${canVote ? `onclick="VoterPage.goToVote('${election.id}')"` : ''}>
          <div class="election-card-header">
            <div class="flex gap-2" style="align-items: flex-start;">
              ${Components.electionTypeIcon(election.type)}
              <div>
                <div class="election-title">${Components.escapeHtml(election.title)}</div>
                <div style="margin-top: 0.25rem;">
                  ${Components.statusBadge(election.status)}
                  ${isVoted ? Components.statusBadge(election.my_status) : ''}
                </div>
              </div>
            </div>
          </div>
          ${election.description ? `<div class="election-description">${Components.escapeHtml(election.description)}</div>` : ''}
          ${election.type === 'agenda' && election.detail_url ? `
            <div class="detail-link-banner">
              <a href="${Components.escapeHtml(election.detail_url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">
                📄 詳細はこちら（審議資料を確認する）
              </a>
            </div>
          ` : ''}
          <div class="election-meta">
            <div class="election-meta-item">📅 ${Components.formatDateTime(election.start_datetime)}</div>
            <div class="election-meta-item">→</div>
            <div class="election-meta-item">📅 ${Components.formatDateTime(election.end_datetime)}</div>
          </div>
          ${canVote ? `
            <div style="margin-top: 1rem;">
              <button class="btn btn-primary btn-block">投票する →</button>
            </div>
          ` : ''}
          ${isVoted ? `
            <div style="margin-top: 1rem; text-align: center; color: var(--color-success); font-size: 0.9rem; font-weight: 600;">
              ✅ 投票済みです
            </div>
          ` : ''}
          ${election.my_status === 'voted_paper' ? `
            <div style="margin-top: 1rem; text-align: center; color: var(--color-info); font-size: 0.9rem; font-weight: 600;">
              📄 紙投票で受付済みです
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  },

  goToVote(electionId) {
    Router.navigate('voter-vote', { electionId });
  },

  // ===== 投票画面 =====
  async renderVoting(container, params) {
    const user = API.getUser();
    container.innerHTML = Components.navbar(user) + `
      <div class="main-content">
        <div class="voting-section" id="voting-content">
          ${Components.loading()}
        </div>
      </div>
    `;

    try {
      const election = await API.get(`/vote/election/${params.electionId}`);
      this.currentElection = election;
      this.renderVotingForm(election);
    } catch (err) {
      document.getElementById('voting-content').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-title">エラー</div>
          <p class="text-muted">${Components.escapeHtml(err.message)}</p>
          <button class="btn btn-secondary mt-2" onclick="Router.navigate('voter')">戻る</button>
        </div>
      `;
    }
  },

  // 信任投票（confidence）かどうかの判定
  isConfidenceVote(election) {
    return election.type === 'confidence';
  },

  renderVotingForm(election) {
    // 既に投票済みの場合
    if (election.my_status !== 'not_voted') {
      document.getElementById('voting-content').innerHTML = `
        <div class="vote-complete">
          <div class="vote-complete-icon">✅</div>
          <h2>投票済みです</h2>
          <p>この投票は既に完了しています。再投票はできません。</p>
          <button class="btn btn-secondary mt-3" onclick="Router.navigate('voter')">一覧に戻る</button>
        </div>
      `;
      return;
    }

    const candidates = election.candidates || [];
    const isConfidence = this.isConfidenceVote(election);
    const inputType = isConfidence ? 'checkbox' : 'radio';
    const instructionText = isConfidence
      ? '信任する候補者をすべて選択してください（複数選択可）'
      : '候補者・選択肢を選んでください（1つ選択）';

    document.getElementById('voting-content').innerHTML = `
      <button class="btn btn-secondary btn-sm mb-2" onclick="Router.navigate('voter')">← 一覧に戻る</button>
      
      <div class="card mt-2">
        <div class="card-header">
          <div>
            <div class="card-title">${Components.escapeHtml(election.title)}</div>
            <div class="card-subtitle">${Components.escapeHtml(election.description || '')}</div>
          </div>
          ${Components.statusBadge(election.status)}
        </div>

        ${election.type === 'agenda' && election.detail_url ? `
          <div class="detail-link-banner" style="margin-bottom: 1rem;">
            <a href="${Components.escapeHtml(election.detail_url)}" target="_blank" rel="noopener noreferrer">
              📄 議案の詳細資料はこちら →
            </a>
          </div>
        ` : ''}

        <div style="margin-bottom: 1.25rem;">
          <div class="election-meta">
            <div class="election-meta-item">📅 投票期間: ${Components.formatDateTime(election.start_datetime)} ～ ${Components.formatDateTime(election.end_datetime)}</div>
          </div>
        </div>

        ${isConfidence ? `
          <div style="background: var(--color-info-bg); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: var(--radius-md); padding: 0.875rem; margin-bottom: 1rem;">
            <div style="font-size: 0.85rem; color: var(--color-info); font-weight: 500;">
              ℹ️ これは信任投票です。信任する候補者を<strong>複数選択</strong>できます。<br>
              棄権する場合は「白票（棄権）」を選択してください（他の選択は解除されます）。
            </div>
          </div>
        ` : ''}

        <div style="margin-bottom: 0.75rem;">
          <div class="form-label">${instructionText}</div>
        </div>

        <div class="candidate-list" id="candidate-list">
          ${candidates.map((c, i) => {
      const isAbstain = c.candidate_name === '白票（棄権）';
      const changeHandler = isConfidence
        ? `onchange="VoterPage.handleConfidenceChange(${i}, ${isAbstain})"`
        : '';
      return `
              <div class="candidate-option ${isAbstain ? 'abstain-option' : ''}">
                <input type="${inputType}" name="vote-selection" id="candidate-${i}" value="${Components.escapeHtml(c.candidate_name)}" ${changeHandler}>
                <label class="candidate-label" for="candidate-${i}">
                  <div class="candidate-radio"></div>
                  <div class="candidate-info">
                    <div class="candidate-name">${isAbstain ? '🏳️ ' : (isConfidence ? '✅ ' : '')}${Components.escapeHtml(c.candidate_name)}</div>
                    ${c.candidate_description ? `<div class="candidate-desc">${Components.escapeHtml(c.candidate_description)}</div>` : ''}
                  </div>
                </label>
              </div>
            `;
    }).join('')}
        </div>

        ${isConfidence ? `
          <div id="selection-count" style="text-align: center; font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 1rem;">
            選択中: 0名
          </div>
        ` : ''}

        <div id="vote-error" class="hidden" style="color: var(--color-danger); font-size: 0.85rem; margin-bottom: 1rem; text-align: center;"></div>

        <button class="btn btn-primary btn-lg btn-block" id="vote-submit-btn" onclick="VoterPage.showConfirmation('${election.id}')">
          投票内容を確認する
        </button>
      </div>
    `;
  },

  // 信任投票時のチェックボックス制御（白票と候補者の排他制御）
  handleConfidenceChange(changedIndex, isAbstain) {
    const checkboxes = document.querySelectorAll('input[name="vote-selection"]');

    if (isAbstain) {
      // 白票が選択された場合、他のすべてのチェックを外す
      const abstainCheckbox = document.getElementById(`candidate-${changedIndex}`);
      if (abstainCheckbox.checked) {
        checkboxes.forEach((cb, i) => {
          if (i !== changedIndex) {
            cb.checked = false;
          }
        });
      }
    } else {
      // 候補者が選択された場合、白票のチェックを外す
      checkboxes.forEach(cb => {
        if (cb.value === '白票（棄権）') {
          cb.checked = false;
        }
      });
    }

    // 選択数の更新
    this.updateSelectionCount();
  },

  updateSelectionCount() {
    const countEl = document.getElementById('selection-count');
    if (!countEl) return;

    const checked = document.querySelectorAll('input[name="vote-selection"]:checked');
    const hasAbstain = Array.from(checked).some(cb => cb.value === '白票（棄権）');

    if (hasAbstain) {
      countEl.innerHTML = '選択中: <span style="color: var(--color-warning); font-weight: 600;">白票（棄権）</span>';
    } else {
      const count = checked.length;
      countEl.innerHTML = `選択中: <span style="color: var(--color-accent); font-weight: 600;">${count}名</span>`;
    }
  },

  showConfirmation(electionId) {
    const election = this.currentElection;
    const isConfidence = election && this.isConfidenceVote(election);
    const errorDiv = document.getElementById('vote-error');

    let selectedValues = [];

    if (isConfidence) {
      // 信任投票: チェックボックスから複数選択を取得
      const checked = document.querySelectorAll('input[name="vote-selection"]:checked');
      selectedValues = Array.from(checked).map(cb => cb.value);
    } else {
      // 通常投票: ラジオボタンから単一選択を取得
      const selected = document.querySelector('input[name="vote-selection"]:checked');
      if (selected) {
        selectedValues = [selected.value];
      }
    }

    if (selectedValues.length === 0) {
      errorDiv.textContent = isConfidence
        ? '信任する候補者を選択するか、「白票（棄権）」を選択してください。未選択の状態では投票できません。'
        : '候補者・選択肢を選択してください。未選択の状態では投票できません。';
      errorDiv.classList.remove('hidden');
      return;
    }

    errorDiv.classList.add('hidden');

    // 選択内容の表示を構築
    const hasAbstain = selectedValues.includes('白票（棄権）');
    let summaryHtml = '';

    if (isConfidence && !hasAbstain) {
      summaryHtml = `
                <div class="confirm-item">
                    <span class="confirm-item-label">投票形式</span>
                    <span class="confirm-item-value">信任投票</span>
                </div>
                <div class="confirm-item">
                    <span class="confirm-item-label">信任数</span>
                    <span class="confirm-item-value">${selectedValues.length}名</span>
                </div>
                ${selectedValues.map(v => `
                    <div class="confirm-item">
                        <span class="confirm-item-label">✅ 信任</span>
                        <span class="confirm-item-value">${Components.escapeHtml(v)}</span>
                    </div>
                `).join('')}
            `;
    } else if (hasAbstain) {
      summaryHtml = `
                <div class="confirm-item">
                    <span class="confirm-item-label">選択内容</span>
                    <span class="confirm-item-value">🏳️ 白票（棄権）</span>
                </div>
            `;
    } else {
      summaryHtml = `
                <div class="confirm-item">
                    <span class="confirm-item-label">選択内容</span>
                    <span class="confirm-item-value">${Components.escapeHtml(selectedValues[0])}</span>
                </div>
            `;
    }

    // 選択値をJSON形式でデータ属性に保存
    const selectionsJson = JSON.stringify(selectedValues);

    Components.showModal(`
      <div class="modal-header">
        <div class="modal-icon modal-icon-warning">⚠️</div>
        <div class="modal-title">投票内容の最終確認</div>
      </div>
      <div class="modal-body">
        <div class="confirm-summary">
          ${summaryHtml}
        </div>
        
        <div style="color: var(--color-warning); font-size: 0.85rem; text-align: center; margin-bottom: 1rem; font-weight: 500;">
          ⚠️ 投票実行後の変更・取り消しはできません
        </div>

        <label class="confirm-checkbox" id="confirm-label">
          <input type="checkbox" id="confirm-agree" onchange="VoterPage.toggleSubmitBtn()">
          <span class="confirm-checkbox-text">上記の内容で投票することに同意します。再投票はできないことを理解しました。</span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Components.closeModal(event)">
          キャンセル
        </button>
        <button class="btn btn-primary" id="final-submit-btn" disabled onclick="VoterPage.submitVoteMulti('${electionId}')">
          投票を確定する
        </button>
      </div>
      <div id="pending-selections" style="display:none;">${Components.escapeHtml(selectionsJson)}</div>
    `);
  },

  toggleSubmitBtn() {
    const checkbox = document.getElementById('confirm-agree');
    const btn = document.getElementById('final-submit-btn');
    if (checkbox && btn) {
      btn.disabled = !checkbox.checked;
    }
  },

  async submitVoteMulti(electionId) {
    const btn = document.getElementById('final-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 送信中...';

    // 保存された選択値を取得
    const selectionsEl = document.getElementById('pending-selections');
    let selections = [];
    try {
      selections = JSON.parse(selectionsEl.textContent);
    } catch (e) {
      Components.showToast('選択内容の取得に失敗しました。', 'error');
      btn.disabled = false;
      btn.innerHTML = '投票を確定する';
      return;
    }

    try {
      const result = await API.post('/vote/submit', {
        election_id: electionId,
        selections: selections
      });

      Components.closeModal();

      // 完了画面を表示
      document.getElementById('voting-content').innerHTML = `
        <div class="vote-complete">
          <div class="vote-complete-icon">✅</div>
          <h2>投票が完了しました</h2>
          <p>ご協力ありがとうございます。<br>投票結果は開票後に公開されます。</p>
          <button class="btn btn-primary mt-3" onclick="Router.navigate('voter')">投票一覧に戻る</button>
        </div>
      `;

      Components.showToast('投票が完了しました！', 'success');
    } catch (err) {
      Components.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '投票を確定する';
    }
  }
};
