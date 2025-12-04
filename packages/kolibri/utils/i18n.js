import has from 'lodash/has';
import Vue from 'vue';
import logger from 'kolibri-logging';
import plugin_data from 'kolibri-plugin-data';
import importIntlLocale from './internal/intl-locale-data';
import importVueIntlLocaleData from './internal/vue-intl-locale-data';
import setupAndLoadFonts from './internal/setupAndLoadFonts';

export const languageDirections = {
  LTR: 'ltr',
  RTL: 'rtl',
};

export const defaultLanguage = {
  id: 'en',
  lang_name: 'English',
  lang_direction: languageDirections.LTR,
};

export const languageValidator = language => {
  return ['id', 'lang_name', 'lang_direction'].reduce((valid, key) => valid && language[key], true);
};

export const getContentLangDir = language => {
  return (language || {}).lang_direction || languageDirections.LTR;
};

const contentLanguageCodes = {
  ff: ['ful', 'fuv'],
  ny: ['nya'],
  sw: ['swa'],
  yo: ['yor'],
};

export const getContentLangActive = language => {
  const langCode = languageIdToCode(currentLanguage);
  const additionalCodes = contentLanguageCodes[langCode] || [];
  if (language.id.toLowerCase() === currentLanguage.toLowerCase()) {
    // Best possible match, return a 2 to have it still be truthy, but distinguishable
    // from a 1 which is a lang_code match
    return 2;
  }
  if (language.lang_code === langCode || additionalCodes.includes(language.lang_code)) {
    return 1;
  }
  return 0;
};

const logging = logger.getLogger(__filename);

const languageGlobals = plugin_data['languageGlobals'] || {};

let _i18nReady = false;

function $trWrapper(nameSpace, defaultMessages, formatter, messageId, args) {
  if (!_i18nReady) {
    throw 'Translator used before i18n is ready';
  }
  if (args) {
    if (!Array.isArray(args) && typeof args !== 'object') {
      logging.error(`The $tr functions take either an array of positional
                      arguments or an object of named options.`);
    }
  }

  // Handle the possibility that the message is defined with an object including context.
  const messageValue = defaultMessages[messageId];
  const defaultMessageText =
    typeof messageValue === 'object' && has(messageValue, 'message')
      ? messageValue.message
      : messageValue;

  const message = {
    id: `${nameSpace}.${messageId}`,
    defaultMessage: defaultMessageText,
  };

  return formatter(message, args);
}

const defaultLocale = defaultLanguage.id;

export const availableLanguages = {
  ...(languageGlobals.languages || { [defaultLocale]: defaultLanguage }),
};

export const currentLanguage = languageGlobals.languageCode || defaultLocale;

// Default to ltr
export const languageDirection = languageGlobals.languageDir || languageDirections.LTR;

export function getLangDir(id) {
  return (availableLanguages[id] || {}).lang_direction || languageDirections.LTR;
}

export function isRtl(id) {
  return getLangDir(id) === languageDirections.RTL;
}

export const languageDensities = {
  englishLike: 'english_like',
  tall: 'tall',
  dense: 'dense',
};

export let languageDensity = languageDensities.englishLike;

const languageDensityMapping = {
  ar: languageDensities.tall,
  bn: languageDensities.tall,
  fa: languageDensities.tall,
  gu: languageDensities.tall,
  hi: languageDensities.tall,
  ja: languageDensities.dense,
  km: languageDensities.tall,
  kn: languageDensities.tall,
  ko: languageDensities.dense,
  lo: languageDensities.tall,
  ml: languageDensities.tall,
  mr: languageDensities.tall,
  my: languageDensities.tall,
  ne: languageDensities.tall,
  pa: languageDensities.tall,
  si: languageDensities.tall,
  ta: languageDensities.tall,
  te: languageDensities.tall,
  th: languageDensities.tall,
  ur: languageDensities.tall,
  vi: languageDensities.tall,
  zh: languageDensities.dense,
};

export function languageIdToCode(id) {
  return id.split('-')[0].toLowerCase();
}

function setLanguageDensity(id) {
  const langCode = languageIdToCode(id);
  // Set the exported languageDensity in JS
  languageDensity = languageDensityMapping[langCode] || languageDensities.englishLike;
  // Set the body class for global typography
  global.document.body.classList.add(`language-${languageDensity}`);
}

/**
 * Class exposing translation functions for a particular message name space.
 * @class
 */
class Translator {
  /**
   * Create a Translator object.
   * @param {string} nameSpace - The nameSpace of the messages for translation.
   * @param {object} defaultMessages - an object mapping message ids to default messages.
   */
  constructor(nameSpace, defaultMessages) {
    this._nameSpace = nameSpace;
    this._defaultMessages = defaultMessages;
    for (const key in defaultMessages) {
      this[`${key}$`] = this.$tr.bind(this, key);
      this[`${key}$`].KOLIBRI_I18N_WRAPPED_STRING = true;
    }
  }
  $tr(messageId, args) {
    return $trWrapper(
      this._nameSpace,
      this._defaultMessages,
      Vue.prototype.$formatMessage,
      messageId,
      args,
    );
  }
  // For convenience, also proxy all vue intl translation methods on this object
  $formatDate(date, options = {}) {
    return Vue.prototype.$formatDate(date, options);
  }
  $formatTime(time, options = {}) {
    return Vue.prototype.$formatTime(time, options);
  }
  $formatRelative(date, options = {}) {
    return Vue.prototype.$formatRelative(date, options);
  }
  $formatNumber(number, options = {}) {
    return Vue.prototype.$formatNumber(number, options);
  }
  $formatPlural(plural, options = {}) {
    return Vue.prototype.$formatPlural(plural, options);
  }
}

/**
 * Returns a Translator instance.
 * @param {string} nameSpace - The nameSpace of the messages for translation.
 * @param {object} defaultMessages - an object mapping message ids to default messages.
 */
export function createTranslator(nameSpace, defaultMessages) {
  return new Translator(nameSpace, defaultMessages);
}

/**
 * Returns a Translator instance that can grab strings from another component.
 * WARNINGS:
 *  - Cannot be used across plugin boundaries
 *  - Use sparingly, e.g. to bypass string freeze
 *  - Try to remove post-string-freeze
 * @param {Component} Component - An imported component.
 */
export function crossComponentTranslator(Component) {
  return new Translator(Component.name, Component.$trs);
}

function _setUpVueIntl() {
  /**
   * Use the vue-intl plugin.
   *
   * Note that this _must_ be called after i18nSetup because this function sets up
   * the currentLanguage module variable which is referenced inside of here.
   **/
  const VueIntl = require('vue-intl');
  Vue.use(VueIntl, { defaultLocale });
  Vue.prototype.isRtl = languageDirection === 'rtl';

  Vue.prototype.$tr = function $tr(messageId, args) {
    const nameSpace = this.$options.name || this.$options.$trNameSpace;
    return $trWrapper(nameSpace, this.$options.$trs, this.$formatMessage, messageId, args);
  };

  Vue.setLocale(currentLanguage);
  if (languageGlobals.coreLanguageMessages) {
    Vue.registerMessages(currentLanguage, languageGlobals.coreLanguageMessages);
  }
  importVueIntlLocaleData().forEach(localeData => VueIntl.addLocaleData(localeData));

  _i18nReady = true;
}

export function i18nSetup(skipPolyfill = false) {
  /**
   * Load fonts, app strings, and Intl polyfills
   **/

  // Set up typography
  setLanguageDensity(currentLanguage);
  setupAndLoadFonts();

  // If the browser doesn't support the Intl polyfill, we retrieve that and
  // the modules need to wait until that happens.
  return new Promise((resolve, reject) => {
    if (Object.prototype.hasOwnProperty.call(global, 'Intl') || skipPolyfill) {
      _setUpVueIntl();
      resolve();
    } else {
      Promise.all([
        new Promise(res => {
          require.ensure(
            ['intl'],
            require => {
              res(() => require('intl'));
            },
            'intl',
          );
        }),
        importIntlLocale(currentLanguage),
      ]).then(
        // eslint-disable-line
        ([requireIntl, requireIntlLocaleData]) => {
          requireIntl(); // requireIntl must run before requireIntlLocaleData
          requireIntlLocaleData();
          _setUpVueIntl();
          resolve();
        },
        error => {
          logging.error(error);
          logging.error('An error occurred trying to setup Internationalization', error);
          reject();
        },
      );
    }
  });
}

/**
 * Locale-aware string comparison wrapper for proper internationalization.
 *
 * This wrapper exists primarily for iOS 9.3 compatibility, which does not
 * fully support the locale and options parameters of String.prototype.localeCompare.
 * All other supported browsers (Chrome 49+, Firefox 52+, Safari 11.1+, etc.)
 * have full support.
 *
 * @param {string} str1 - First string to compare
 * @param {string} str2 - Second string to compare
 * @param {string} [locale] - BCP 47 locale code (defaults to currentLanguage)
 * @param {object} [options] - Comparison options
 * @param {string} [options.usage='sort'] - 'sort' for sorting, 'search' for case-insensitive search
 * @param {string} [options.sensitivity] - 'base', 'accent', 'case', or 'variant'
 * @param {boolean} [options.ignorePunctuation] - Whether to ignore punctuation
 * @param {string} [options.numeric] - Whether numeric collation should be used
 * @param {string} [options.caseFirst] - Whether upper or lower case should sort first
 * @returns {number} -1 if str1 < str2, 0 if equal, 1 if str1 > str2
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare
 */
export function localeCompare(str1, str2, locale, options) {
  const compareLocale = locale || currentLanguage;
  const compareOptions = { usage: 'sort', ...options };

  // Catch if browser does not support extended localeCompare arguments (iOS 9.3)
  try {
    return String(str1).localeCompare(String(str2), compareLocale, compareOptions);
  } catch (e) {
    return String(str1).localeCompare(String(str2));
  }
}

/**
 * Creates an Intl.Collator for efficient string comparison in array sorting.
 *
 * When sorting large arrays of strings, creating a single Collator instance
 * and reusing its compare method is more efficient than calling localeCompare
 * repeatedly. This is the recommended approach per MDN documentation.
 *
 * @param {string} [locale] - BCP 47 locale code (defaults to currentLanguage)
 * @param {object} [options] - Collator options (same as localeCompare options)
 * @returns {Intl.Collator|Object} Collator instance, or fallback with compare method
 *
 * @example
 * const collator = createCollator();
 * users.sort((a, b) => collator.compare(a.name, b.name));
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator
 */
export function createCollator(locale, options) {
  const collatorLocale = locale || currentLanguage;
  const collatorOptions = { usage: 'sort', ...options };

  try {
    if (typeof Intl !== 'undefined' && Intl.Collator) {
      return new Intl.Collator(collatorLocale, collatorOptions);
    }
  } catch (e) {
    // Intl.Collator not supported or failed (e.g., iOS 9.3)
  }

  // Fallback: return object with compare method using localeCompare
  return {
    compare: (str1, str2) => localeCompare(str1, str2, collatorLocale, collatorOptions),
  };
}

// Wrapper to Intl.ListFormat
export function formatList(array) {
  if (Intl.ListFormat) {
    const formatter = new Intl.ListFormat(currentLanguage, { style: 'short', type: 'unit' });
    return formatter.format(array);
  } else {
    return array.join(', ');
  }
}

/**
 * Sorts an Array of language objects by their `lang_name` property.
 * If currentLanguageId is truthy and is a language code that exists in
 * an element of availableLanguages, that element is always sorted first.
 *
 * @export
 * @param {Array} availableLanguages Array of language objects
 * @param {(String|null|undefined)} currentLanguageId Lang code for currently
 *  selected language
 * @returns {Array} Array of sorted language objects with the
 *  currently selected language object first, if one exists.
 */
export function sortLanguages(availableLanguages, currentLanguageId) {
  const currentLanguageElem = availableLanguages.find(language => {
    return language.id == currentLanguageId;
  });

  const sortedLanguages = availableLanguages
    .sort(compareLanguages)
    .filter(language => language.id != currentLanguageId);

  if (currentLanguageElem) {
    sortedLanguages.unshift(currentLanguageElem);
  }

  return sortedLanguages;
}

/**
 * Compares two language objects by their lang_name property using locale-aware comparison.
 * Used for sorting language lists in the language switcher.
 *
 * @param {object} a - First language object with lang_name property
 * @param {object} b - Second language object with lang_name property
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareLanguages(a, b) {
  return localeCompare(a.lang_name, b.lang_name);
}
