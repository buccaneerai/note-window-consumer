const fs = require('fs');
const path = require('path');
const {expect} = require('chai');
const sinon = require('sinon');
const {marbles} = require('rxjs-marbles/mocha');

const toSpacyModel = require('./toSpacyModel');

const fakeResponsePath = path.resolve(__dirname, './sampleSpacyResponse.json');
const fakeSpacyResponse = JSON.parse(fs.readFileSync(fakeResponsePath).toString());

const fakePredictions = [
  {
    runId: 'fakerun',
    noteWindowId: 'fakeWindow',
    strategy: 'spacyPatternMatcher',
    findingCode: 'GREETINGS',
    confidence: 0.80,
    isVerified: false,
    isCorrect: false,
  },
  {
    runId: 'fakerun',
    noteWindowId: 'fakeWindow',
    strategy: 'spacyPatternMatcher',
    findingCode: 'HEADACHE_ACUTE',
    confidence: 0.80,
    isVerified: false,
    isCorrect: false,
  },
  {
    runId: 'fakerun',
    noteWindowId: 'fakeWindow',
    strategy: 'spacyPatternMatcher',
    findingCode: 'HEADACHE',
    confidence: 0.80,
    isVerified: false,
    isCorrect: false,
  },
];

describe('toSpacyModel', () => {
  it('should export a curried function', () => {
    expect(toSpacyModel).to.be.a('function');
    expect(toSpacyModel()).to.be.a('function');
  });

  it('should convert spacy responses to prediction objects', marbles(m => {
    const words = [{text: 'foo'}, {text: 'bar'}];
    const source$ = m.cold('-(0|)', [words]);
    const fakeResponse$ = m.cold('---(0|)', [fakeSpacyResponse]);
    const params = {
      runId: 'fakerun',
      noteWindowId: 'fakeWindow',
      _toSpacyAPI: sinon.stub().returns(() => fakeResponse$),
    };
    const actual$ = source$.pipe(toSpacyModel(params));
    const expected$ = m.cold('----(0|)', [fakePredictions]);
    m.expect(actual$).toBeObservable(expected$);
  }));
});
