const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = require('rxjs-marbles/mocha');

const storePredictions = require('./storePredictions');

describe('storePredictions', () => {
  it('should export a function', () => {
    expect(storePredictions).to.be.a('function');
  });
});
