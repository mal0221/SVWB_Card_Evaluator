document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const selectedPack = urlParams.get('pack') || 'ALL';

  document.getElementById('page-title').textContent = `📊 カード評価一覧表（対象パック: ${selectedPack}）`;

  let evaluators = [{ id: 'user_1', name: 'プレイヤー1' }];
  let cardRatings = {};

  try {
    const data = await chrome.storage.local.get({
      evaluators: [{ id: 'user_1', name: 'プレイヤー1' }],
      cardRatings: {}
    });
    evaluators = data.evaluators || [];
    cardRatings = data.cardRatings || {};
  } catch (e) {
    console.error(e);
  }

  let targetCards = [];
  if (selectedPack === 'ALL') {
    for (const packCards of Object.values(cardRatings)) {
      if (packCards) {
        for (const card of Object.values(packCards)) {
          if (card && card.updatedAt && String(card.updatedAt).trim() !== '') {
            targetCards.push(card);
          }
        }
      }
    }
  } else {
    const packCards = cardRatings[selectedPack] || {};
    for (const card of Object.values(packCards)) {
      if (card && card.updatedAt && String(card.updatedAt).trim() !== '') {
        targetCards.push(card);
      }
    }
  }

  const container = document.getElementById('content-container');

  if (targetCards.length === 0) {
    container.innerHTML = '<div class="msg">表示する有効な評価データがありません。</div>';
    return;
  }

  const classGroups = {};
  targetCards.forEach(card => {
    const cls = card.cardClass || '不明';
    if (!classGroups[cls]) classGroups[cls] = [];
    classGroups[cls].push(card);
  });

  const CLASS_ORDER = ['エルフ', 'ロイヤル', 'ウィッチ', 'ドラゴン', 'ナイトメア', 'ビショップ', 'ネメシス', 'ニュートラル'];
  
  const sortedClasses = Object.keys(classGroups).sort((a, b) => {
    let indexA = CLASS_ORDER.indexOf(a);
    let indexB = CLASS_ORDER.indexOf(b);
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    return indexA - indexB;
  });

  // 保存したSVGアイコンファイル名とのマッピング
  const classIconMap = {
    'エルフ': 'class_elf.svg',
    'ロイヤル': 'class_royal.svg',
    'ウィッチ': 'class_witch.svg',
    'ドラゴン': 'class_dragon.svg',
    'ナイトメア': 'class_nightmare.svg',
    'ビショップ': 'class_bishop.svg',
    'ネメシス': 'class_nemesis.svg',
    'ニュートラル': 'class_neutral.svg',
    '不明': 'class_unknown.svg'
  };

  const classThemes = {
    'エルフ': '#4caf50',
    'ロイヤル': '#fbc02d',
    'ウィッチ': '#576bc2',
    'ドラゴン': '#fb8c00',
    'ナイトメア': '#810202',
    'ビショップ': '#b8c2c4',
    'ネメシス': '#31e2d9',
    'ニュートラル': '#b495ee',
    '不明': '#9e9e9e'
  };

  const rankColors = {
    'S': { bg: 'linear-gradient(135deg, #ff4b6b, #ffcb3d)', color: '#fff' },
    'A': { bg: '#d94848', color: '#fff' },
    'B': { bg: '#d9822b', color: '#fff' },
    'C': { bg: '#2f855a', color: '#fff' },
    'D': { bg: '#3b6998', color: '#fff' }
  };

  let html = '';

  sortedClasses.forEach(className => {
    const cards = classGroups[className];
    const borderColor = classThemes[className] || '#9e9e9e';
    const iconFilename = classIconMap[className] || 'class_unknown.svg';
    const iconUrl = chrome.runtime.getURL(`images/${iconFilename}`);

    html += `
    <div class="class-section">
      <div class="class-header" style="border-left: 6px solid ${borderColor};">
        <img class="class-icon" src="${iconUrl}" alt="${className}">
        <span> ${className}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th class="card-name-cell">カード名</th>`;

    evaluators.forEach(ev => {
      html += `<th>${ev.name}</th>`;
    });

    html += `</tr>
        </thead>
        <tbody>`;

    cards.forEach(card => {
      html += `
      <tr>
        <td class="card-name-cell">${card.name}</td>`;

      evaluators.forEach(ev => {
        const rank = (card.ratings && card.ratings[ev.id]) ? card.ratings[ev.id] : '';
        if (rank && rankColors[rank]) {
          html += `<td class="rank-cell"><div class="rank-badge" style="background: ${rankColors[rank].bg}; color: ${rankColors[rank].color};">${rank}</div></td>`;
        } else {
          html += `<td class="rank-cell"><div class="rank-badge rank-none">-</div></td>`;
        }
      });

      html += `</tr>`;
    });

    html += `
        </tbody>
      </table>
    </div>`;
  });

  container.innerHTML = html;
});