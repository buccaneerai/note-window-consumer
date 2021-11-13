const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = require('rxjs-marbles/mocha');

const storeToS3 = require('./storeToS3');

describe('storeToS3', () => {
  it('should export a function', () => {
    expect(storeToS3).to.be.a('function');
  });
});
