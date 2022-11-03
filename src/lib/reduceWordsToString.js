const get = require('lodash/get');

const reduceWordsToString = () => (acc, w) => {
  const text = get(w, 'text', '');
  return (
    acc
    ? `${acc} ${text}`
    : text
  );
};

module.exports = reduceWordsToString;
