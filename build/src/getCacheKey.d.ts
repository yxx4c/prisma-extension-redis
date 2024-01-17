export type CacheKeyParams = {
    [key: string]: string;
}[];
export declare const getCacheKey: (params: CacheKeyParams) => string;
