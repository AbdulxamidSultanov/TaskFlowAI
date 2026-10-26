export type Pagination = {
    page: number;
    pageSize: number;
    limit: number;
    offset: number;
};

export function getPagination(
    url: URL,
    defaults: {pageSize?: number; maxPageSize?: number} = {},
): Pagination {
    const defaultPageSize = defaults.pageSize ?? 20;
    const maxPageSize = defaults.maxPageSize ?? 100;

    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const requestedPageSize =
        Number(url.searchParams.get("pageSize") ?? defaultPageSize) ||
        defaultPageSize;
    const pageSize = Math.min(
        maxPageSize,
        Math.max(1, requestedPageSize),
    );

    return {
        page,
        pageSize,
        limit: pageSize,
        offset: (page - 1) * pageSize,
    };
}

export function paginationMeta(total: number, pagination: Pagination) {
    return {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        pages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    };
}
