document.addEventListener('DOMContentLoaded', async () => {
  const MAX_EVALUATORS = 6;
  const evaluatorListEl = document.getElementById('evaluator-list');
  const packSelector = document.getElementById('pack-selector');
  const badgeSizeSelector = document.getElementById('badge-size-selector');
  const btnAdd = document.getElementById('btn-add-evaluator');
  const btnViewHtml = document.getElementById('btn-view-html');
  const btnCopyTsv = document.getElementById('btn-copy-tsv');
  const btnDownloadCsv = document.getElementById('btn-download-csv');
  const btnClear = document.getElementById('btn-clear-data');
  const statusMsg = document.getElementById('status-msg');
  const ratingCountEl = document.getElementById('rating-count');

  let evaluators = [{ id: 'user_1', name: 'プレイヤー1' }];
  let cardRatings = {};
  let badgeSize = 'medium';

  try {
    const stored = await chrome.storage.local.get({
      evaluators: [{ id: 'user_1', name: 'プレイヤー1' }],
      cardRatings: {},
      badgeSize: 'medium'
    });
    evaluators = stored.evaluators || evaluators;
    cardRatings = stored.cardRatings || {};
    badgeSize = stored.badgeSize || 'medium';
  } catch (err) {
    console.error(err);
  }

  badgeSizeSelector.value = badgeSize;

  badgeSizeSelector.addEventListener('change', async () => {
    badgeSize = badgeSizeSelector.value;
    try {
      await chrome.storage.local.set({ badgeSize });
      showStatus('評価バッジサイズ設定を保存しました');
    } catch(e) {}
  });

  if (evaluators.length > MAX_EVALUATORS) {
    evaluators = evaluators.slice(0, MAX_EVALUATORS);
    try { await chrome.storage.local.set({ evaluators }); } catch(e){}
  }

  let currentActivePack = null;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0 && tabs[0].url) {
      const match = tabs[0].url.match(/\/ja\/cards\/pack\/([^/]+)/);
      if (match) {
        currentActivePack = decodeURIComponent(match[1]);
      }
    }
  } catch (e) {}

  function showStatus(text) {
    statusMsg.textContent = text;
    setTimeout(() => { statusMsg.textContent = ''; }, 2500);
  }

  function updatePackSelector() {
    const selectedVal = packSelector.value;
    packSelector.innerHTML = '<option value="ALL">【全パック一括】</option>';

    const packNames = new Set(Object.keys(cardRatings || {}));
    if (currentActivePack) {
      packNames.add(currentActivePack);
    }

    const sortedPacks = Array.from(packNames).sort();
    sortedPacks.forEach(packName => {
      const opt = document.createElement('option');
      opt.value = packName;
      opt.textContent = packName === currentActivePack ? `${packName} (表示中)` : packName;
      packSelector.appendChild(opt);
    });

    if (sortedPacks.includes(selectedVal)) {
      packSelector.value = selectedVal;
    } else if (currentActivePack && sortedPacks.includes(currentActivePack)) {
      packSelector.value = currentActivePack;
    } else {
      packSelector.value = 'ALL';
    }
  }

  function updateCountInfo() {
    const selectedPack = packSelector.value;
    cardRatings = cardRatings || {};

    if (selectedPack === 'ALL') {
      let totalCards = 0;
      for (const packCards of Object.values(cardRatings)) {
        if (packCards) {
          for (const card of Object.values(packCards)) {
            if (card && card.updatedAt && String(card.updatedAt).trim() !== '') {
              totalCards++;
            }
          }
        }
      }
      ratingCountEl.textContent = `記録済みカード（全パック合計）: ${totalCards}枚`;
    } else {
      const packCards = cardRatings[selectedPack] || {};
      let count = 0;
      for (const card of Object.values(packCards)) {
        if (card && card.updatedAt && String(card.updatedAt).trim() !== '') {
          count++;
        }
      }
      ratingCountEl.textContent = `記録済みカード (${selectedPack}): ${count}枚`;
    }
  }

  packSelector.addEventListener('change', () => {
    updateCountInfo();
  });

  function updateAddButtonState() {
    if (evaluators.length >= MAX_EVALUATORS) {
      btnAdd.disabled = true;
      btnAdd.textContent = `評価者は最大${MAX_EVALUATORS}人までです`;
      btnAdd.style.opacity = '0.5';
      btnAdd.style.cursor = 'not-allowed';
    } else {
      btnAdd.disabled = false;
      btnAdd.textContent = `＋ 評価者を追加 (${evaluators.length}/${MAX_EVALUATORS})`;
      btnAdd.style.opacity = '1';
      btnAdd.style.cursor = 'pointer';
    }
  }

  function renderEvaluators() {
    evaluatorListEl.innerHTML = '';
    evaluators.forEach((ev, index) => {
      const row = document.createElement('div');
      row.className = 'evaluator-row';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = ev.name;
      input.placeholder = `評価者 ${index + 1}`;
      input.addEventListener('input', async (e) => {
        evaluators[index].name = e.target.value.trim() || `評価者${index + 1}`;
        try { await chrome.storage.local.set({ evaluators }); } catch(err){}
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', async () => {
        if (evaluators.length <= 1) {
          showStatus('最低1人の評価者が必要です');
          return;
        }
        evaluators.splice(index, 1);
        try { await chrome.storage.local.set({ evaluators }); } catch(err){}
        renderEvaluators();
        showStatus('評価者を削除しました');
      });

      row.appendChild(input);
      row.appendChild(removeBtn);
      evaluatorListEl.appendChild(row);
    });
    updateAddButtonState();
  }

  btnAdd.addEventListener('click', async () => {
    if (evaluators.length >= MAX_EVALUATORS) {
      showStatus(`評価者は最大${MAX_EVALUATORS}人までです`);
      return;
    }
    evaluators.push({ id: 'user_' + Date.now(), name: `プレイヤー${evaluators.length + 1}` });
    try { await chrome.storage.local.set({ evaluators }); } catch(err){}
    renderEvaluators();
    showStatus('評価者を追加しました');
  });

  async function buildExportRows() {
    let currentData = {};
    try {
      const data = await chrome.storage.local.get({
        evaluators: [{ id: 'user_1', name: 'プレイヤー1' }],
        cardRatings: {}
      });
      evaluators = data.evaluators.slice(0, MAX_EVALUATORS);
      currentData = data.cardRatings || {};
    } catch(e) {
      currentData = cardRatings || {};
    }

    const selectedPack = packSelector.value;
    const header = ['パックID', 'カード名', 'クラス', ...evaluators.map(e => e.name), '更新日時'];
    const rows = [header];

    let targetCards = [];
    if (selectedPack === 'ALL') {
      for (const packCards of Object.values(currentData)) {
        if (packCards) {
          for (const card of Object.values(packCards)) {
            if (card && card.updatedAt && String(card.updatedAt).trim() !== '') {
              targetCards.push(card);
            }
          }
        }
      }
    } else {
      const packCards = currentData[selectedPack] || {};
      for (const card of Object.values(packCards)) {
        if (card && card.updatedAt && String(card.updatedAt).trim() !== '') {
          targetCards.push(card);
        }
      }
    }

    for (const card of targetCards) {
      const evalCols = evaluators.map(e => (card.ratings && card.ratings[e.id]) ? card.ratings[e.id] : '');
      rows.push([
        card.pack || '',
        card.name || '',
        card.cardClass || '',
        ...evalCols,
        card.updatedAt || ''
      ]);
    }
    return rows;
  }

  btnViewHtml.addEventListener('click', () => {
    const selectedPack = packSelector.value;
    const reportUrl = chrome.runtime.getURL(`report.html?pack=${encodeURIComponent(selectedPack)}`);
    chrome.tabs.create({ url: reportUrl });
    showStatus('🌐 HTML評価一覧を新しいタブで表示しました');
  });

  btnCopyTsv.addEventListener('click', async () => {
    const rows = await buildExportRows();
    if (rows.length <= 1) return showStatus('有効な評価データ（更新済み）がありません');
    const tsv = rows.map(r => r.map(c => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
    await navigator.clipboard.writeText(tsv);
    showStatus('✅ クリップボードにコピーしました。スプレッドシートに貼り付けられます');
  });

  btnDownloadCsv.addEventListener('click', async () => {
    const rows = await buildExportRows();
    if (rows.length <= 1) return showStatus('有効な評価データ（更新済み）がありません');
    const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const selectedPack = packSelector.value;
    const filenamePrefix = selectedPack === 'ALL' ? 'all_packs' : selectedPack;

    const a = document.createElement('a');
    a.href = url;
    a.download = `svwb_ratings_${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('✅ CSVをダウンロードしました');
  });

  btnClear.addEventListener('click', async () => {
    const selectedPack = packSelector.value;
    let data = {};
    try {
      data = await chrome.storage.local.get({ cardRatings: {} });
    } catch(e) {}
    cardRatings = data.cardRatings || {};

    if (selectedPack === 'ALL') {
      if (!confirm('すべてのパックの評価データを完全に消去しますか？')) return;
      cardRatings = {};
      try { await chrome.storage.local.set({ cardRatings: {} }); } catch(e){}
      showStatus('すべての評価データをリセットしました');
    } else {
      if (!confirm(`パック [${selectedPack}] の評価データを消去しますか？`)) return;
      if (cardRatings[selectedPack]) {
        delete cardRatings[selectedPack];
        try { await chrome.storage.local.set({ cardRatings }); } catch(e){}
      }
      showStatus(`パック [${selectedPack}] のデータをリセットしました`);
    }

    updatePackSelector();
    updateCountInfo();
  });

  renderEvaluators();
  updatePackSelector();
  updateCountInfo();
});