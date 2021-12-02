const get = require('lodash/get');
const uniqBy = require('lodash/uniqBy');
const axios = require('axios');
const { from } = require('rxjs');
const { map, mergeMap} = require('rxjs/operators');

// const isDone = words => nextWord === '.';

// const wordsToString = () => (acc, nextWord) => (
//   // isDone(acc)
//   // ? [`${acc[0]} ${nextWord}`, true]
//   // : (acc[1] ? [nextWord, false] : [`${acc[0]} ${nextWord}`, false])
// );

const reduceWordsToString = () => (acc, w) => (acc ? `${acc} ${w.text}` : w.text);

// const charIndexReducer = () => (acc, [words, tags]) => [
//   words,
//   tags,
//   acc,
//   acc + words.reduce(w => w.text.length + 1, 0) - 1,
// ];

// const stringifyWords = () => words$ =>
//   words$.pipe(
//     // scan(textReducer(), [null, false]),
//     // filter(([, done]) => done),
//     map(words => words.reduce(wordStringReducer(), ''))
//   );

// const linkTagsToWords = () => (words, { entities, matches, tokens }) => {
//   const wordsWithCharIndex = words.reduce(
//     (acc, w, i) => [
//       ...acc,
//       i === 0
//         ? { ...w, length: w.text.length, charIndex: 0 }
//         : {
//             ...w,
//             length: w.text.length,
//             // add an extra character for "spaces" between words
//             charIndex: acc[i - 1].charIndex + acc[i - 1].length + 1,
//           },
//     ],
//     []
//   );
//   const wordDict = wordsWithCharIndex.reduce(
//     (acc, w) => ({
//       ...acc,
//       [w.charIndex]: w.i,
//     }),
//     {}
//   );
//   // FIXME: there is something wrong here...  the indexes on the matches
//   // do not seem to correspond to character indexes...
//   const matchesWithWordIndexes = matches.map(m => ({
//     ...m,
//     wordIndexes: wordsWithCharIndex
//       .filter(w => w.charIndex >= m.i && w.charIndex <= m.endI)
//       .map(w => w.i),
//   }));
//   return {
//     entities: entities.map(e => ({ ...e, wordIndex: wordDict[e.i.toString()] })),
//     tokens: tokens.map(t => ({ ...t, wordIndex: wordDict[t.i.toString()] })),
//     matches: matchesWithWordIndexes,
//   };
// };

// const extractWordTags = ({
//   spacyUrl = process.env.NLP_SERVICE_URL,
//   _stringifyWords = stringifyWords,
//   _extractTags = extractTags,
//   _linkTagsToWords = linkTagsToWords
// } = {}) => words$ => {
//   const wordSub$ = words$.pipe(share());
//   const strings$ = wordsSub$.pipe(_stringifyWords());
//   const nlpOut$ = zip(wordsSub$, strings$).pipe(
//     mergeMap(([words, strings]) => zip(
//       of(words),
//       _extractTags(spacyUrl)(string)
//     )),
//     // scan(charIndexReducer(), [null, null, 0]),
//     map(([words, tags]) => _linkTagsToWords()(words, tags))
//   );
//   return nlpOut$;
// };

const toSpacyAPI = ({url, token, _axios = axios}) => text => {
  const promise = _axios({
    url: `${url}/tokens`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: { text },
  });
  const nlpOut$ = from(promise).pipe(
    map(res => res.data)
  );
  return nlpOut$;
};

const mapSpacyResponseToPredictions = ({
  runId,
  noteWindowId,
  strategy = 'spacyPatternMatcher'
}) => response => {
  const matches = get(response, 'matches', []);
  const predictions = uniqBy(matches, m => m.matchId).map(m => ({
    runId,
    noteWindowId,
    strategy,
    findingCode: m.matchId,
    confidence: 0.80,
    isVerified: false,
    isCorrect: false,
  }));
  return predictions;
};

const toSpacyModel = ({
  runId,
  noteWindowId,
  spacyUrl = process.env.NLP_SERVICE_URL,
  token = process.env.JWT_TOKEN,
  _toSpacyAPI = toSpacyAPI,
  _mapSpacyResponseToPredictions = mapSpacyResponseToPredictions,
} = {}) => (
  words$ => words$.pipe(
    map(words => words.reduce(reduceWordsToString(), '')),
    mergeMap(_toSpacyAPI({url: spacyUrl, token})),
    map(_mapSpacyResponseToPredictions({
      runId,
      noteWindowId,
      strategy: 'spacyPatternMatcher',
    })),
  )
);

module.exports = toSpacyModel;
// module.exports.testExports = { charIndexReducer, wordStringReducer, linkTagsToWords };
