import {camelCase} from 'lodash';

export type CacheKeyPatternParams = {[key: string]: string}[];

const globs = ['?', '*'];

export const getCacheKeyPattern = (params: CacheKeyPatternParams) =>
  params
    .map(obj =>
      Object.entries(obj).map(([key, value]) =>
        key.toLocaleLowerCase() === 'glob'
          ? value
          : `${globs.includes(key) ? key : camelCase(key)}:${
              globs.includes(value) ? value : camelCase(value)
            }`
      )
    )
    .join(':');
