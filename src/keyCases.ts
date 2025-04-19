/**
 * Converts `string` to [camel case](https://en.wikipedia.org/wiki/CamelCase).
 *
 *  @example
 * 
 * _.camelCase('Foo Bar');
 * // => 'fooBar'
 *
 * _.camelCase('--foo-bar--');
 * // => 'fooBar'
 *
 * _.camelCase('__FOO_BAR__');
 * // => 'fooBar'
 */
export const camelCase = (str = ''): string => {
  if (!str) return '';
  let string = str.toLowerCase();
  // Replace all special characters (hyphens, underscores) with spaces
  string = string.replace(/[-_]+/g, ' ');
  string = string.trim();
  // Split by spaces
  const words = string.split(/\s+/);
  // Capitalize all words except the first one
  const camelCased = words.map((word, index) => {
    if (index === 0) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join('');
  return camelCased;
};

/**
 * Converts `string` to
 * [kebab case](https://en.wikipedia.org/wiki/Letter_case#Special_case_styles).
 *
 * @example
 *
 * _.kebabCase('Foo Bar');
 * // => 'foo-bar'
 *
 * _.kebabCase('fooBar');
 * // => 'foo-bar'
 *
 * _.kebabCase('__FOO_BAR__');
 * // => 'foo-bar'
 */
export const kebabCase = (str = ''): string => {
  if (!str) return '';
  // First, handle camelCase and PascalCase
  let string = str.replace(/([a-z])([A-Z])/g, '$1 $2');
  string = string.toLowerCase();
  // Replace all hyphens, underscores, and special characters with spaces
  string = string.replace(/[_\-]+/g, ' ');
  // Replace all remaining non-alphanumeric characters with spaces
  string = string.replace(/[^\w\s]/g, ' ');
  // Trim the string and replace spaces with hyphens
  string = string.trim().replace(/\s+/g, '-');
  return string;
};

/**
 * Converts `string` to
 * [snake case](https://en.wikipedia.org/wiki/Snake_case).
 *
 * @example
 *
 * _.snakeCase('Foo Bar');
 * // => 'foo_bar'
 *
 * _.snakeCase('fooBar');
 * // => 'foo_bar'
 *
 * _.snakeCase('--FOO-BAR--');
 * // => 'foo_bar'
 */
export const snakeCase = (str = ''): string => {
  if (!str) return '';
  // First, handle camelCase and PascalCase
  let string = str.replace(/([a-z])([A-Z])/g, '$1 $2');
  string = string.toLowerCase();
  // Replace all hyphens, underscores, and special characters with spaces
  string = string.replace(/[_\-]+/g, ' ');
  // Replace all remaining non-alphanumeric characters with spaces
  string = string.replace(/[^\w\s]/g, ' ');
  // Trim the string and replace spaces with underscores
  string = string.trim().replace(/\s+/g, '_');
  return string;
};

/**
 * Converts `string` to
 * [start case](https://en.wikipedia.org/wiki/Letter_case#Stylistic_or_specialised_usage).
 *
 * @example
 *
 * _.startCase('--foo-bar--');
 * // => 'Foo Bar'
 *
 * _.startCase('fooBar');
 * // => 'Foo Bar'
 *
 * _.startCase('__FOO_BAR__');
 * // => 'FOO BAR'
 */
export const startCase = (str = ''): string => {
  if (!str) return '';
  // First, handle camelCase and PascalCase
  let string = str.replace(/([a-z])([A-Z])/g, '$1 $2');
  // Replace all hyphens, underscores, and special characters with spaces
  string = string.replace(/[_\-]+/g, ' ');
  // Replace all remaining non-alphanumeric characters with spaces
  string = string.replace(/[^\w\s]/g, ' ');
  // Trim the string, split by spaces, capitalize each word, and join back with spaces
  string = string.trim().split(/\s+/).map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
  return string;
};

export enum CacheCase {
  CAMEL_CASE = 'camelCase',
  KEBAB_CASE = 'kebabCase',
  SNAKE_CASE = 'snakeCase',
  START_CASE = 'startCase',
}

export const caseMap = {
  [CacheCase.CAMEL_CASE]: camelCase,
  [CacheCase.KEBAB_CASE]: kebabCase,
  [CacheCase.SNAKE_CASE]: snakeCase,
  [CacheCase.START_CASE]: startCase,
};