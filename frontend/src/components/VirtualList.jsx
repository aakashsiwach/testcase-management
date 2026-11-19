import { memo, useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fixed-row-height virtual scroller: only the visible rows (+ overscan) are in the DOM.
 * Calls onEndReached when the user scrolls near the bottom (infinite server pagination).
 */
function VirtualList({ items, rowHeight = 52, height = 560, overscan = 8, renderRow, onEndReached, hasMore, loadingMore, footer }) {
  const ref = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  const onScroll = useCallback(
    (e) => {
      const el = e.currentTarget;
      setScrollTop(el.scrollTop);
      if (hasMore && !loadingMore && el.scrollTop + el.clientHeight >= el.scrollHeight - rowHeight * 5) onEndReached?.();
    },
    [hasMore, loadingMore, onEndReached, rowHeight]
  );

  // If the first page doesn't fill the viewport, load more immediately.
  useEffect(() => {
    const el = ref.current;
    if (el && hasMore && !loadingMore && el.scrollHeight <= el.clientHeight) onEndReached?.();
  }, [items.length, hasMore, loadingMore, onEndReached]);

  const total = items.length;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(total, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  const visible = [];
  for (let i = start; i < end; i++) visible.push(renderRow(items[i], i, { position: 'absolute', top: i * rowHeight, height: rowHeight, left: 0, right: 0 }));

  return (
    <div ref={ref} className="virtual-list" style={{ height, overflowY: 'auto', position: 'relative' }} onScroll={onScroll} role="rowgroup" aria-rowcount={total}>
      <div style={{ height: total * rowHeight, position: 'relative' }}>{visible}</div>
      {footer}
    </div>
  );
}

export default memo(VirtualList);
