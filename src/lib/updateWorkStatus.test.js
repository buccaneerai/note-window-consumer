const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = require('rxjs-marbles/mocha');

const updateWorkStatus = require('./updateWorkStatus');
const {timestamp} = updateWorkStatus.testExports;

describe('updateWorkStatus', () => {
  it('should export a function', () => {
    expect(updateWorkStatus).to.be.a('function');
  });

  it('should generate correct timestamps', () => {
    const actual = timestamp();
    expect(actual).to.be.a('string');
  });
});
