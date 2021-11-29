const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = require('rxjs-marbles/mocha');

const updateWorkStatus = require('./updateWorkStatus');

describe('updateWorkStatus', () => {
  it('should export a function', () => {
    expect(updateWorkStatus).to.be.a('function');
  });
});
