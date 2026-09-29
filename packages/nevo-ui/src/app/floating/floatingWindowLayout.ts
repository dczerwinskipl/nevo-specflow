export interface FloatingWindowLayoutEntry {
  id: string;
  sequence: number;
  lastActivatedAt: number;
}

export interface FloatingWindowLayout {
  visibleIds: readonly string[];
  overflowIds: readonly string[];
}

export function resolveFloatingWindowLayout({
  activeId,
  entries,
  expandedId,
  maxVisible,
}: {
  entries: readonly FloatingWindowLayoutEntry[];
  expandedId: string | null;
  activeId: string | null;
  maxVisible: number;
}): FloatingWindowLayout {
  const safeMaxVisible = Math.max(0, Math.floor(maxVisible));
  const ordered = [...entries].sort((a, b) => a.sequence - b.sequence);

  if (safeMaxVisible === 0) {
    return {
      visibleIds: [],
      overflowIds: ordered.map((entry) => entry.id),
    };
  }

  const ranked = [...entries].sort((a, b) => {
    const rank = (entry: FloatingWindowLayoutEntry) => {
      if (entry.id === expandedId) return 3;
      if (entry.id === activeId) return 2;
      return 1;
    };

    const rankDiff = rank(b) - rank(a);
    if (rankDiff !== 0) return rankDiff;

    const activityDiff = b.lastActivatedAt - a.lastActivatedAt;
    if (activityDiff !== 0) return activityDiff;

    return a.sequence - b.sequence;
  });

  const visibleSet = new Set(ranked.slice(0, safeMaxVisible).map((entry) => entry.id));

  return {
    visibleIds: ordered.filter((entry) => visibleSet.has(entry.id)).map((entry) => entry.id),
    overflowIds: ordered.filter((entry) => !visibleSet.has(entry.id)).map((entry) => entry.id),
  };
}
