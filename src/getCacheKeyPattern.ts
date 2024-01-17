import {camelCase} from 'lodash';

export type CacheKeyPatternParams = {[key: string]: string}[];

export const getCacheKeyPattern = (params: CacheKeyPatternParams) =>
  params
    .map(obj =>
      Object.entries(obj).map(([key, value]) =>
        key.toLocaleLowerCase() === 'glob'
          ? value
          : `${camelCase(key)}:${camelCase(value)}`
      )
    )
    .join(':');
