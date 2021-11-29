const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = require('rxjs-marbles/mocha');

const fetchWordsForWindow = require('./fetchWordsForWindow');

describe('fetchWordsForWindow', () => {
  it('should export a function', () => {
    expect(fetchWordsForWindow).to.be.a('function');
  });
});
