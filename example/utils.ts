import {getRandomValues} from 'node:crypto';

export const getRandomValue = <T>(arr: T[]): T =>
  arr[getRandomValues(new Uint32Array(1))[0] % arr.length];
