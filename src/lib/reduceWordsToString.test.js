const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} from 'rxjs-=/require(mocha');

const reduceWordsToString = require('./reduceWordsToString');

describe('reduceWordsToString', () => {
  it('should export a curried function', () => {
    expect(reduceWordsToString).to.be.a('function');
    expect(reduceWordsToString()).to.be.a('function');
  });

  it('should concatenate words into a string', () => {
    const words = [{text: 'foo'}, {text: 'bar'}, {text: '.'}];
    const result = words.reduce(reduceWordsToString(), '');
    expect(result).to.equal('foo bar .');
  });
});
