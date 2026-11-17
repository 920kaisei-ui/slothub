export function reelStrip({ column, width, height, board, previous, colors }) {
  const at = (symbols, row) => symbols?.[row * width + column];
  const destination = Array.from({ length: height }, (_, row) => at(board, row));
  const fillers = Array.from({ length: height * 3 }, (_, row) =>
    (row * 11 + Math.floor(row / colors) + column * 5) % colors
  );
  const source = Array.from({ length: height }, (_, row) => at(previous, row));
  return [...destination, ...fillers, ...source];
}

export async function spinReels({ overlay, paintCells, previous, board, signal, width, height, colors, quick, stop }) {
  if (signal.aborted) return;
  const strips = Array.from({ length: width }, (_, column) => {
    const lane = document.createElement('div');
    lane.className = 'reel-column';
    const strip = document.createElement('div');
    strip.className = 'reel-strip';
    const values = reelStrip({ column, width, height, board, previous, colors });
    const cells = values.map(() => {
      const cell = document.createElement('span');
      cell.className = 'cell';
      return cell;
    });
    strip.append(...cells);
    lane.append(strip);
    paintCells(cells, values);
    return { lane, strip };
  });
  overlay.replaceChildren(...strips.map(({ lane }) => lane));

  const animations = [];
  const cancel = () => animations.forEach(animation => animation.cancel());
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const finished = strips.map(({ lane, strip }, column) => {
      const distance = Math.max(0, strip.scrollHeight - lane.clientHeight);
      const animation = strip.animate([
        { transform: `translateY(-${distance}px)`, easing: 'cubic-bezier(.55,.05,.68,.37)' },
        { transform: `translateY(-${distance * 0.6}px)`, filter: 'blur(1px)', offset: 0.28, easing: 'linear' },
        { transform: 'translateY(-12px)', filter: 'blur(.25px)', offset: 0.83, easing: 'ease-out' },
        { transform: 'translateY(2px)', filter: 'none', offset: 0.95, easing: 'ease-out' },
        { transform: 'translateY(0)', filter: 'none' },
      ], { duration: (quick ? 310 : 560) + column * (quick ? 34 : 70), fill: 'both' });
      animations.push(animation);
      return animation.finished.then(() => {
        if (!signal.aborted) stop();
      }, () => {});
    });
    await Promise.all(finished);
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    overlay.replaceChildren();
  }
}
