const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = require('rxjs-marbles/mocha');

const toPredictions = require('./toPredictions');

describe('toPredictions', () => {
  it('should export a function', () => {
    expect(toPredictions).to.be.a('function');
    expect(toPredictions()).to.be.a('function');
  });

  it('should have tests', () => {
    expect(false).to.be.true;
  });
});
