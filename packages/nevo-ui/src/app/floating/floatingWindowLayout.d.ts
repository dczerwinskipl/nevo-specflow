export interface FloatingWindowLayoutEntry {
    id: string;
    sequence: number;
    lastActivatedAt: number;
}
export interface FloatingWindowLayout {
    visibleIds: readonly string[];
    overflowIds: readonly string[];
}
export declare function resolveFloatingWindowLayout({ activeId, entries, expandedId, maxVisible, }: {
    entries: readonly FloatingWindowLayoutEntry[];
    expandedId: string | null;
    activeId: string | null;
    maxVisible: number;
}): FloatingWindowLayout;
//# sourceMappingURL=floatingWindowLayout.d.ts.map