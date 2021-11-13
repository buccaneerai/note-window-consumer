const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = require('rxjs-marbles/mocha');

const handleMessage = require('./handleMessage');

describe('handleMessage', () => {
  it('should export a function', () => {
    expect(handleMessage).to.be.a('function');
  });
});
