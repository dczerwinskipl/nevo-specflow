export function paginationPageItems(pageIndex, pageCount, siblingCount) {
    if (pageCount <= 1)
        return [0];
    const visible = new Set([0, pageCount - 1, pageIndex]);
    for (let offset = 1; offset <= siblingCount; offset += 1) {
        visible.add(pageIndex - offset);
        visible.add(pageIndex + offset);
    }
    const pages = [...visible].filter((page) => page >= 0 && page < pageCount).sort((a, b) => a - b);
    const result = [];
    pages.forEach((page, index) => {
        const previous = pages[index - 1];
        if (index > 0 && previous !== undefined && page - previous > 1) {
            result.push('ellipsis');
        }
        result.push(page);
    });
    return result;
}
//# sourceMappingURL=Pagination.model.js.map