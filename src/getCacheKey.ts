import {camelCase} from 'lodash';

export type CacheKeyParams = {[key: string]: string}[];

export const getCacheKey = (params: CacheKeyParams) =>
  params
    .map(obj =>
      Object.entries(obj).map(
        ([key, value]) => `${camelCase(key)}:${camelCase(value)}`
      )
    )
    .join(':');
