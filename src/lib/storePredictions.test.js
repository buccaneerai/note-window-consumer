const {expect} = require('chai');
// const sinon = require('sinon');
const {marbles} = require('rxjs-marbles/mocha');

const storePredictions = require('./storePredictions');

describe('storePredictions', () => {
  it('should export a function', () => {
    expect(storePredictions).to.be.a('function');
  });

  it('should return an array if no predictions are given', marbles(m => {
    const actual$ = storePredictions()({predictions: []});
    const expected$ = m.cold('(0|)', [[]]);
    m.expect(actual$).toBeObservable(expected$);
  }));
});
