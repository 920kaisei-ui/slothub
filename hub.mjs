const list = document.getElementById('game-list');
const status = document.getElementById('catalog-status');

status.hidden = false;
status.textContent = 'ゲーム一覧を読み込み中';
try {
  const response = await fetch(new URL('./games.json', import.meta.url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { games } = await response.json();
  const cards = games.map(({ directory, title, description }) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    const heading = document.createElement('h3');
    const copy = document.createElement('p');
    const launch = document.createElement('span');
    link.href = `./${directory}/`;
    link.setAttribute('aria-label', `${title}をプレイ`);
    link.setAttribute('aria-describedby', `description-${directory}`);
    heading.textContent = title;
    copy.id = `description-${directory}`;
    copy.textContent = description;
    launch.textContent = 'プレイ →';
    link.append(heading, copy, launch);
    item.append(link);
    return item;
  });
  list.replaceChildren(...cards);
  status.hidden = cards.length > 0;
  status.textContent = '公開中のゲームはありません。';
} catch (error) {
  status.textContent = 'ゲーム一覧を読み込めませんでした。ページを再読み込みしてください。';
  console.error(error);
}
