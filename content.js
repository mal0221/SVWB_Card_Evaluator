(() => {
  const RANKS = ['S', 'A', 'B', 'C', 'D'];
  const MAX_EVALUATORS = 6;
  const PANEL_ID = 'svwb-eval-root-panel';
  const BADGE_CONTAINER_CLASS = 'svwb-card-list-badges';

  const SELECTORS = {
    modalContainer: '[role="dialog"], [aria-modal="true"], [class*="Modal"], [class*="modal"], [class*="Popup"], [class*="popup"], [class*="CardDetail"], [class*="cardDetail"], [class*="detail"]',
    cardName: 'h1, h2, h3, [class*="CardName"], [class*="cardName"], [class*="name"], [class*="title"]'
  };

  let currentCardKey = null;
  let debounceTimer = null;
  let isMinimized = false;

  function isTargetPackPage() {
    return /^\/ja\/cards\/pack\/[^/]+\/?/.test(location.pathname);
  }

  function getPackName() {
    const match = location.pathname.match(/^\/ja\/cards\/pack\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : 'unknown';
  }

  function findActivePopup() {
    const candidates = Array.from(document.querySelectorAll(SELECTORS.modalContainer));
    const visibleModals = candidates.filter(el => {
      if (el.id === PANEL_ID || el.closest(`#${PANEL_ID}`)) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 240 && rect.height > 200;
    });
    return visibleModals.length > 0 ? visibleModals[visibleModals.length - 1] : null;
  }

  function extractCardInfo(popupEl) {
    let cardName = '';
    let cardId = '';

    const imgs = popupEl.querySelectorAll('img');
    for (const img of imgs) {
      if (img.closest(`#${PANEL_ID}`)) continue;
      const src = img.currentSrc || img.src || '';
      if (src.includes('card_image')) {
        const m = src.match(/\/([^/?#]+)\.(?:png|webp|jpg|jpeg)/i);
        if (m) {
          cardId = m[1];
          break;
        }
      }
    }

    if (cardId) {
      const allImgs = document.querySelectorAll('img');
      for (const img of allImgs) {
        const src = img.currentSrc || img.src || '';
        if (src.includes(cardId) && img.alt && img.alt.trim()) {
          cardName = img.alt.trim();
          break;
        }
      }
    }

    if (!cardName) {
      const nameCandidates = popupEl.querySelectorAll(SELECTORS.cardName);
      for (const el of nameCandidates) {
        if (el.closest(`#${PANEL_ID}`)) continue;
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        if (text && text.length >= 1 && text.length <= 40) {
          cardName = text;
          break;
        }
      }
    }

    let cardClass = '';
    const activeTabBtn = document.querySelector('button[aria-selected="true"], [role="tab"][aria-selected="true"]');
    if (activeTabBtn) {
      const classNameSpan = activeTabBtn.querySelector('span[class*="class-name"]');
      if (classNameSpan) {
        cardClass = (classNameSpan.textContent || '').trim();
      }
    }

    if (!cardClass) {
      const candidateEls = popupEl.querySelectorAll('dd, span, div, p');
      for (const el of candidateEls) {
        if (el.closest(`#${PANEL_ID}`)) continue;
        const text = (el.textContent || '').trim();
        if (['エルフ', 'ロイヤル', 'ウィッチ', 'ドラゴン', 'ナイトメア', 'ビショップ', 'ネメシス', 'ニュートラル'].includes(text)) {
          cardClass = text;
          break;
        }
      }
    }
    if (!cardClass) cardClass = '不明';

    if (!cardName && !cardId) return null;
    if (!cardName) cardName = `カード(${cardId})`;
    if (!cardId) cardId = 'card_' + cardName;

    return {
      id: cardId,
      name: cardName,
      pack: getPackName(),
      cardClass: cardClass
    };
  }

  function syncPanelPosition(popupEl, panel) {
    const rect = popupEl.getBoundingClientRect();
    const rightOffset = Math.max(20, window.innerWidth - rect.right + 20);
    const bottomOffset = Math.max(20, window.innerHeight - rect.bottom + 20);
    panel.style.right = `${rightOffset}px`;
    panel.style.bottom = `${bottomOffset}px`;
    panel.style.left = 'auto';
  }

  async function saveRating(cardInfo, evaluatorId, selectedRank) {
    const packName = getPackName();
    const data = await chrome.storage.local.get({ cardRatings: {} });
    data.cardRatings = data.cardRatings || {};
    data.cardRatings[packName] = data.cardRatings[packName] || {};

    const packCards = data.cardRatings[packName];
    const entry = packCards[cardInfo.id] || {
      id: cardInfo.id,
      name: cardInfo.name,
      pack: packName,
      cardClass: cardInfo.cardClass,
      ratings: {}
    };

    entry.name = cardInfo.name;
    entry.pack = packName;
    entry.cardClass = cardInfo.cardClass;
    entry.ratings = entry.ratings || {};

    if (!selectedRank) {
      delete entry.ratings[evaluatorId];
    } else {
      entry.ratings[evaluatorId] = selectedRank;
    }

    entry.updatedAt = new Date().toLocaleString('ja-JP');
    packCards[cardInfo.id] = entry;

    await chrome.storage.local.set({ cardRatings: data.cardRatings });
  }

  async function renderEvaluationPanel(popupEl, cardInfo) {
    const packName = getPackName();
    const storageData = await chrome.storage.local.get({
      evaluators: [{ id: 'user_1', name: 'プレイヤー1' }],
      cardRatings: {}
    });

    const activeEvaluators = storageData.evaluators.slice(0, MAX_EVALUATORS);
    const packCards = (storageData.cardRatings && storageData.cardRatings[packName]) || {};
    
    if (!packCards[cardInfo.id]) {
      packCards[cardInfo.id] = {
        id: cardInfo.id,
        name: cardInfo.name,
        pack: packName,
        cardClass: cardInfo.cardClass,
        ratings: {}
      };
      storageData.cardRatings[packName] = packCards;
      await chrome.storage.local.set({ cardRatings: storageData.cardRatings });
    } else if (packCards[cardInfo.id].name !== cardInfo.name || packCards[cardInfo.id].cardClass !== cardInfo.cardClass) {
      packCards[cardInfo.id].name = cardInfo.name;
      packCards[cardInfo.id].cardClass = cardInfo.cardClass;
      storageData.cardRatings[packName] = packCards;
      await chrome.storage.local.set({ cardRatings: storageData.cardRatings });
    }

    const savedCard = packCards[cardInfo.id];

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      ['click', 'mousedown', 'mouseup', 'keydown', 'change', 'input'].forEach(evt => {
        panel.addEventListener(evt, e => e.stopPropagation());
      });
    }

    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    syncPanelPosition(popupEl, panel);

    panel.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'svwb-eval-header';
    if (isMinimized) header.classList.add('is-minimized');

    const titleSpan = document.createElement('span');
    titleSpan.className = 'svwb-eval-title';
    titleSpan.textContent = `★ 評価 (${packName})`;
    header.appendChild(titleSpan);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'svwb-eval-toggle-btn';
    toggleBtn.textContent = isMinimized ? '＋' : 'ー';
    toggleBtn.title = isMinimized ? '展開する' : '最小化する';
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isMinimized = !isMinimized;
      renderEvaluationPanel(popupEl, cardInfo);
    });
    header.appendChild(toggleBtn);

    panel.appendChild(header);

    if (!isMinimized) {
      const rowContainer = document.createElement('div');
      rowContainer.className = 'svwb-eval-horizontal-list';

      activeEvaluators.forEach(ev => {
        const item = document.createElement('div');
        item.className = 'svwb-eval-col';

        const nameLabel = document.createElement('div');
        nameLabel.className = 'svwb-eval-user';
        nameLabel.textContent = ev.name;
        nameLabel.title = ev.name;
        item.appendChild(nameLabel);

        const currentRank = (savedCard.ratings && savedCard.ratings[ev.id]) || '';

        const select = document.createElement('select');
        select.className = `svwb-rank-select ${currentRank ? 'rank-' + currentRank : 'rank-none'}`;

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-';
        if (!currentRank) defaultOpt.selected = true;
        select.appendChild(defaultOpt);

        RANKS.forEach(rank => {
          const opt = document.createElement('option');
          opt.value = rank;
          opt.textContent = rank;
          if (currentRank === rank) opt.selected = true;
          select.appendChild(opt);
        });

        select.addEventListener('change', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const newRank = e.target.value;
          select.className = `svwb-rank-select ${newRank ? 'rank-' + newRank : 'rank-none'}`;
          await saveRating(cardInfo, ev.id, newRank);
          updateCardListBadges();
        });

        item.appendChild(select);
        rowContainer.appendChild(item);
      });

      panel.appendChild(rowContainer);
    }
  }

  // 一覧画面用バッジの描画（サイズ設定対応）
  async function updateCardListBadges() {
    if (!isTargetPackPage()) return;
    const packName = getPackName();

    const data = await chrome.storage.local.get({
      evaluators: [{ id: 'user_1', name: 'プレイヤー1' }],
      cardRatings: {},
      badgeSize: 'medium'
    });

    const badgeSize = data.badgeSize || 'medium';
    const evaluators = data.evaluators.slice(0, MAX_EVALUATORS);
    const cardRatingsData = data.cardRatings || {};
    cardRatingsData[packName] = cardRatingsData[packName] || {};
    const packCards = cardRatingsData[packName];

    const imgs = document.querySelectorAll('img');

    imgs.forEach(async img => {
      if (img.closest(`#${PANEL_ID}`)) return;

      const src = img.currentSrc || img.src || '';
      if (!src.includes('card_image')) return;

      let cardEl = img.closest('a, [class*="Card"], [class*="card"], [class*="item"], [class*="Item"]');
      if (!cardEl) cardEl = img.parentElement;

      const cardRect = cardEl.getBoundingClientRect();
      if (cardRect.width > window.innerWidth * 0.6 || cardRect.height > window.innerHeight * 0.8) {
        cardEl = img.parentElement;
      }

      if (!cardEl || cardEl.id === PANEL_ID || cardEl.closest(`#${PANEL_ID}`)) return;

      let badgeContainer = cardEl.querySelector(`.${BADGE_CONTAINER_CLASS}`);
      
      // 「表示しない」の場合はコンテナを削除して終了
      if (badgeSize === 'none') {
        if (badgeContainer) badgeContainer.remove();
        return;
      }

      const m = src.match(/\/([^/?#]+)\.(?:png|webp|jpg|jpeg)/i);
      if (!m) return;
      const cardId = m[1];
      const cardName = img.alt ? img.alt.trim() : `カード(${cardId})`;

      if (!packCards[cardId]) {
        packCards[cardId] = {
          id: cardId,
          name: cardName,
          pack: packName,
          cardClass: '不明',
          ratings: {}
        };
        await chrome.storage.local.set({ cardRatings: cardRatingsData });
      } else if (!packCards[cardId].name || packCards[cardId].name.startsWith('カード(')) {
        packCards[cardId].name = cardName;
        await chrome.storage.local.set({ cardRatings: cardRatingsData });
      }

      if (!badgeContainer) {
        badgeContainer = document.createElement('div');
        badgeContainer.className = BADGE_CONTAINER_CLASS;
        const computedStyle = window.getComputedStyle(cardEl);
        if (computedStyle.position === 'static') {
          cardEl.style.position = 'relative';
        }
        cardEl.appendChild(badgeContainer);
      }

      // サイズクラスを設定
      badgeContainer.className = `${BADGE_CONTAINER_CLASS} size-${badgeSize}`;
      badgeContainer.innerHTML = '';
      const savedCard = packCards[cardId];

      evaluators.forEach(ev => {
        const rank = (savedCard && savedCard.ratings && savedCard.ratings[ev.id]) ? savedCard.ratings[ev.id] : '';
        const badge = document.createElement('div');
        badge.className = `svwb-list-badge ${rank ? 'rank-' + rank : 'rank-none'}`;
        badge.textContent = rank || '-';
        badge.title = `${ev.name}: ${rank || '未評価'}`;
        badgeContainer.appendChild(badge);
      });
    });
  }

  function checkDOMState() {
    if (!isTargetPackPage()) {
      const existing = document.getElementById(PANEL_ID);
      if (existing) existing.remove();
      currentCardKey = null;
      return;
    }

    updateCardListBadges();

    const popupEl = findActivePopup();
    if (!popupEl) {
      const existing = document.getElementById(PANEL_ID);
      if (existing) existing.remove();
      currentCardKey = null;
      return;
    }

    const cardInfo = extractCardInfo(popupEl);
    if (!cardInfo) return;

    const existingPanel = document.getElementById(PANEL_ID);
    if (!existingPanel || currentCardKey !== cardInfo.id) {
      currentCardKey = cardInfo.id;
      renderEvaluationPanel(popupEl, cardInfo);
    } else {
      syncPanelPosition(popupEl, existingPanel);
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkDOMState, 200);
  });

  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-hidden'] });

  window.addEventListener('resize', () => {
    const popupEl = findActivePopup();
    const panel = document.getElementById(PANEL_ID);
    if (popupEl && panel) syncPanelPosition(popupEl, panel);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.cardRatings || changes.badgeSize) {
        updateCardListBadges();
      }
      if (changes.evaluators) {
        const popupEl = findActivePopup();
        if (popupEl && isTargetPackPage()) {
          const cardInfo = extractCardInfo(popupEl);
          if (cardInfo) renderEvaluationPanel(popupEl, cardInfo);
        }
      }
    }
  });

  checkDOMState();
})();