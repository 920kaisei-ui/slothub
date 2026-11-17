import { createSlotEngine, WILD } from './slot-engine.mjs';
import { BET_OPTIONS, createGameSession } from './session.mjs';
import { spinReels } from './reel-motion.mjs';
import { createAudioPlayer } from './audio.mjs';

const boardView = document.getElementById('board');
const reelWindow = document.getElementById('reel-window');
const reelOverlay = document.getElementById('reel-overlay');
const spinButton = document.getElementById('spin');
const skipButton = document.getElementById('skip');
const resetButton = document.getElementById('reset');
const betSelect = document.getElementById('bet');
const paceSelect = document.getElementById('pace');
const soundToggle = document.getElementById('sound');
const volumeSlider = document.getElementById('volume');
const balanceView = document.getElementById('balance');
const payoutView = document.getElementById('payout');
const stakeView = document.getElementById('round-stake');
const netView = document.getElementById('round-net');
const profitView = document.getElementById('profit');
const phaseView = document.getElementById('phase');
const matchesView = document.getElementById('matches');
const milestoneView = document.getElementById('milestone');
const result = document.getElementById('result');
const receiptView = document.getElementById('receipt');
const receiptNote = document.getElementById('receipt-note');
const practiceButton = document.getElementById('practice');
const practiceDialog = document.getElementById('practice-dialog');
const practiceBoard = document.getElementById('practice-board');
const practiceReveal = document.getElementById('practice-reveal');
const practiceNext = document.getElementById('practice-next');
const practiceResult = document.getElementById('practice-result');
const challengeButton = document.getElementById('challenge');
const challengeSummary = document.getElementById('challenge-summary');
const gemLabels = {
  Ruby: ['▣', 'ルビー'],
  Topaz: ['▲', 'トパーズ'],
  Emerald: ['▯', 'エメラルド'],
  Sapphire: ['⬭', 'サファイア'],
  Diamond: ['◆', 'ダイヤモンド'],
  RainbowOrb: ['●', 'レインボーオーブ'],
  Wild: ['✦', 'ワイルド'],
};
const format = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });
const signedFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const MAX_ANIMATED_CHAINS = 8;
const MILESTONE_CHAIN = 8;
const CHALLENGE_LENGTH = 10;
const PACES = {
  normal: { start: 190, match: 170, land: 90 },
  quick: { start: 85, match: 80, land: 40 },
};
const PRACTICE = [
  { title: 'L字の5個', width: 3, tiles: [0, 1, 2, 0, 2, 1, 0, 0, 0],
    description: '上下左右をたどると、角を曲がっても同じかたまりです。' },
  { title: '2色が使う固定ワイルド', width: 5, tiles: [0, 0, 2, 1, 1, 0, 0, WILD, 1, 1, 2, 2, 3, 2, 2],
    description: '中央のワイルドは両方の色に加わります。盤面では固定されたままです。' },
];

function wait(ms, signal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });

    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
  });
}

try {
  const response = await fetch(new URL('./simulator/presets/6x7.json', import.meta.url));
  if (!response.ok) throw new Error(`設定の取得に失敗しました（HTTP ${response.status}）`);
  const config = await response.json();
  const engine = createSlotEngine(config);
  const orb = config.gems.findIndex(gem => gem.name === 'RainbowOrb');
  const session = createGameSession(engine);
  const sound = createAudioPlayer();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  boardView.style.setProperty('--columns', config.width);
  reelWindow.style.setProperty('--columns', config.width);
  const cells = createCells(boardView, config.width * config.height);
  let animation;
  let challenge;
  let visibleBoard;

  const labelFor = name => gemLabels[name] ?? [name[0], name];

  function createCells(container, count) {
    const elements = Array.from({ length: count }, () => {
      const cell = document.createElement('span');
      cell.className = 'cell';
      return cell;
    });
    container.replaceChildren(...elements);
    return elements;
  }

  function paintCells(elements, board, frame) {
    elements.forEach((cell, index) => {
      const gem = board?.[index];
      const name = gem === WILD ? 'Wild' : config.gems[gem]?.name;
      const [symbol, label] = name ? labelFor(name) : ['·', '空きマス'];
      cell.textContent = symbol;
      cell.setAttribute('role', 'img');
      cell.setAttribute('aria-label', label);
      cell.title = label;
      cell.setAttribute('data-gem', name ?? 'Empty');
      cell.classList.toggle('wild', gem === WILD);
      cell.classList.toggle('cleared', frame?.cleared[index] === 1);
      cell.classList.toggle('active-wild', Boolean(frame?.activeWilds.has(index)));
    });
  }

  function describeMatches(matches) {
    return matches?.map(({ color, cells }) =>
      `${labelFor(config.gems[color].name)[1]} ${cells.length}個`
    ).join(' · ') ?? '';
  }

  function renderBoard(board, frame) {
    paintCells(cells, board, frame);
    visibleBoard = board;
    const text = describeMatches(frame?.matches);
    matchesView.textContent = text;
    matchesView.title = text;
  }

  function showBalance({ balance, profit }) {
    balanceView.textContent = format.format(engine.payoutAsNumber(balance));
    profitView.textContent = signedFormat.format(engine.payoutAsNumber(profit));
  }

  function showRound({ stake, payout, net }) {
    stakeView.textContent = format.format(engine.payoutAsNumber(stake));
    payoutView.textContent = format.format(engine.payoutAsNumber(payout));
    netView.textContent = net === undefined ? '—' : signedFormat.format(engine.payoutAsNumber(net));
  }

  function showCue(cue, stage = 1) {
    phaseView.setAttribute('data-cue', cue);
    if (cue === 'idle' || document.hidden) sound.stop();
    else if (!animation?.signal.aborted) {
      try {
        sound.play(cue, stage);
      } catch {
        // 音声が再生できない場合も盤面・払い出しは確定させる。
      }
    }
  }

  function showReceipt(round) {
    receiptView.replaceChildren();
    receiptNote.textContent = !round ? '最初の回転が終わると表示します。'
      : round.frames.length ? `${round.spins}回目の配当内訳` : '成立なし。払い出しは0です。';
    round?.frames.forEach((frame, index) => {
      const item = document.createElement('li');
      const groupText = frame.matches.map(({ color, cells, award }) => {
        const label = labelFor(config.gems[color].name)[1];
        return `${label} ${cells.length}個 ${format.format(engine.payoutAsNumber(award))}`;
      });
      const payout = frame.matches.reduce((sum, match) => sum + match.award, 0n);
      item.textContent = `×${index + 1} · ${groupText.join('、')} · 計 ${format.format(engine.payoutAsNumber(payout))}`;
      receiptView.append(item);
    });
  }

  function updateControls() {
    const busy = Boolean(animation);
    const bet = Number(betSelect.value);
    betSelect.disabled = busy || Boolean(challenge?.active);
    paceSelect.disabled = busy;
    spinButton.disabled = busy || !session.canSpin(bet);
    resetButton.disabled = busy;
    practiceButton.disabled = busy;
    challengeButton.disabled = busy || (!challenge?.active && !session.canSpin(bet));
    skipButton.disabled = !busy || reducedMotion.matches || paceSelect.value === 'instant';
    boardView.setAttribute('aria-busy', String(busy));
  }

  function showChallenge() {
    challengeButton.textContent = challenge?.active ? 'ここで記録を終える' : '記録を始める';
    if (!challenge) {
      challengeSummary.textContent = '記録なし';
      return;
    }
    const net = signedFormat.format(engine.payoutAsNumber(challenge.net));
    const header = challenge.active ? `残り${CHALLENGE_LENGTH - challenge.spins}回転` : `${challenge.spins}回転で終了`;
    challengeSummary.textContent = `${header} · 差引 ${net} · 最大${challenge.maxChains}連鎖 · オーブ成立${challenge.orbs}回`;
  }

  function recordChallenge(round, bet) {
    if (!challenge?.active) return;
    challenge.spins++;
    challenge.net += round.net;
    challenge.maxChains = Math.max(challenge.maxChains, round.frames.length);
    if (round.frames.some(frame => frame.matches.some(match => match.color === orb))) challenge.orbs++;
    if (challenge.spins === CHALLENGE_LENGTH || !session.canSpin(bet)) challenge.active = false;
    showChallenge();
  }

  function startOver() {
    challenge = undefined;
    showChallenge();
    showBalance(session.reset());
    showReceipt();
    for (const field of [stakeView, payoutView, netView]) field.textContent = '—';
    renderBoard();
    phaseView.textContent = '回転待ち';
    showCue('idle');
    milestoneView.textContent = '';
    betSelect.value = String(BET_OPTIONS[0]);
    result.textContent = 'ベットを選んで「回す」を押してください。';
    updateControls();
  }

  for (const bet of BET_OPTIONS) {
    const option = document.createElement('option');
    option.value = String(bet);
    option.textContent = String(bet);
    betSelect.append(option);
  }
  document.getElementById('match-rule').textContent =
    `同じ宝石が上下左右につながるとひとつのかたまりになります。ワイルドも数に含め、合計${config.minimumClusterSize}個以上で成立します。`;
  for (const gem of config.gems) {
    const item = document.createElement('li');
    const [symbol, label] = labelFor(gem.name);
    const payouts = gem.payouts.map(tier => `${tier.count}個以上 ${format.format(tier.amount)}倍`);
    item.textContent = `${symbol} ${label} ${payouts.join(' / ')}`;
    document.getElementById('paytable').append(item);
  }

  betSelect.addEventListener('change', () => {
    updateControls();
    if (!session.canSpin(Number(betSelect.value))) {
      result.textContent = 'このベットにはクレジットが足りません。';
    } else {
      result.textContent = '「回す」を押すと次の回転を始めます。';
    }
  });
  resetButton.addEventListener('click', startOver);
  skipButton.addEventListener('click', () => {
    sound.stop();
    animation?.abort();
  });
  soundToggle.checked = false;
  volumeSlider.disabled = true;
  soundToggle.addEventListener('change', () => {
    const enabled = sound.setEnabled(soundToggle.checked);
    soundToggle.checked = enabled;
    volumeSlider.disabled = !enabled;
  });
  volumeSlider.addEventListener('input', () => sound.setVolume(Number(volumeSlider.value) / 100));
  document.addEventListener('visibilitychange', () => { if (document.hidden) sound.stop(); });
  challengeButton.addEventListener('click', () => {
    if (animation) return;
    if (challenge?.active) challenge.active = false;
    else if (session.canSpin(Number(betSelect.value))) {
      challenge = { active: true, spins: 0, net: 0n, maxChains: 0, orbs: 0 };
    }
    showChallenge();
    updateControls();
  });

  let practiceIndex = 0;
  let practiceCells;
  function showPractice() {
    const example = PRACTICE[practiceIndex];
    document.getElementById('practice-title').textContent = example.title;
    document.getElementById('practice-description').textContent = example.description;
    practiceResult.textContent = '';
    practiceBoard.style.setProperty('--columns', example.width);
    practiceCells = createCells(practiceBoard, example.tiles.length);
    paintCells(practiceCells, example.tiles);
  }
  practiceButton.addEventListener('click', () => {
    if (animation) return;
    practiceIndex = 0;
    showPractice();
    practiceDialog.showModal();
    practiceReveal.focus();
  });
  practiceNext.addEventListener('click', () => {
    practiceIndex = (practiceIndex + 1) % PRACTICE.length;
    showPractice();
    practiceReveal.focus();
  });
  practiceReveal.addEventListener('click', () => {
    const example = PRACTICE[practiceIndex];
    const demo = createSlotEngine({ ...config, width: example.width, height: 3 }, () => 0);
    demo.step(Int32Array.from(example.tiles), 1, (cleared, matches) => {
      const activeWilds = new Set(matches.flatMap(match => [...match.cells]).filter(cell => example.tiles[cell] === WILD));
      paintCells(practiceCells, example.tiles, { cleared, activeWilds });
      practiceResult.textContent = describeMatches(matches);
    });
  });
  practiceDialog.addEventListener('close', () => practiceButton.focus());

  function milestoneText(frame, stage) {
    const reached = stage === MILESTONE_CHAIN ? [`${MILESTONE_CHAIN}連鎖到達`] : [];
    const orbs = frame.matches.filter(match => match.color === orb);
    if (orbs.length) {
      const award = orbs.reduce((sum, match) => sum + match.award, 0n);
      reached.push(`レインボーオーブ成立 · 第${stage}連鎖 ${format.format(engine.payoutAsNumber(award))}クレジット`);
    }
    return reached.join(' · ');
  }

  spinButton.addEventListener('click', async () => {
    const bet = Number(betSelect.value);
    if (animation || !session.canSpin(bet)) return;
    const restoreFocus = document.activeElement === spinButton;
    animation = new AbortController();
    phaseView.textContent = '回転中';
    milestoneView.textContent = '';
    updateControls();
    const { signal } = animation;
    try {
      const round = session.spin(bet);
      showCue('spin');
      const chains = round.frames.length;
      let board = round.initialBoard;
      const pace = paceSelect.value === 'instant' || reducedMotion.matches
        ? null : PACES[paceSelect.value] ?? PACES.normal;
      if (pace) {
        balanceView.textContent = format.format(engine.payoutAsNumber(round.balanceAfterBet));
        showRound({ stake: round.stake, payout: 0n });
        const previous = visibleBoard;
        renderBoard(board);
        if (typeof reelOverlay.animate === 'function') {
          await spinReels({
            overlay: reelOverlay, paintCells, previous, board, signal,
            width: config.width, height: config.height, colors: config.gems.length,
            quick: pace === PACES.quick, stop: () => showCue('stop'),
          });
        } else {
          await wait(pace.start, signal);
        }
        for (let index = 0; index < Math.min(chains, MAX_ANIMATED_CHAINS) && !signal.aborted; index++) {
          const frame = round.frames[index];
          phaseView.textContent = `第${index + 1}連鎖 · ×${index + 1}`;
          milestoneView.textContent = milestoneText(frame, index + 1);
          showCue(frame.matches.some(match => match.color === orb) ? 'orb' : 'match', index + 1);
          renderBoard(board, frame);
          await wait(pace.match, signal);
          if (signal.aborted) break;
          board = frame.board;
          renderBoard(board);
          showCue('land');
          payoutView.textContent = format.format(engine.payoutAsNumber(frame.payout));
          await wait(pace.land, signal);
        }
      }

      renderBoard(round.frames.at(-1)?.board ?? round.initialBoard);
      showBalance(round);
      showRound(round);
      showReceipt(round);
      recordChallenge(round, bet);
      phaseView.textContent = '結果確定';
      const milestones = round.frames.map((frame, index) => milestoneText(frame, index + 1)).filter(Boolean);
      milestoneView.textContent = milestones.join(' / ');
      const payout = format.format(engine.payoutAsNumber(round.payout));
      const outcome = round.net > 0n ? 'プラス' : round.net === 0n ? '元返し' : 'マイナス';
      showCue(round.net > 0n ? 'win' : 'settle');
      const remaining = session.canSpin(bet) ? ''
        : session.canSpin(BET_OPTIONS[0]) ? ' ベットを下げると続けられます。' : ' 「最初から」で再開できます。';
      const highlights = milestones.length ? ` ${milestones.join('。')}。` : '';
      result.textContent = `${round.spins}回目 · ${chains}連鎖 · 払い出し ${payout}クレジット · ${outcome}。${highlights}${remaining}`;
    } catch (error) {
      showCue('idle');
      phaseView.textContent = '回転中断';
      result.textContent = error.message;
    } finally {
      const focusSkip = document.activeElement === skipButton;
      animation = undefined;
      updateControls();
      if (focusSkip || (restoreFocus && document.activeElement === document.body)) {
        (spinButton.disabled ? betSelect : spinButton).focus();
      }
    }
  });

  startOver();
} catch (error) {
  phaseView.textContent = '読み込みエラー';
  result.textContent = error.message;
}
